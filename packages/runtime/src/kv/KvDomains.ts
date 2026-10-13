/**
 * Single-KV keyspace: one `CACHE` binding, domains separated by key prefix.
 *
 * Converged from `backend-runtime/src/kv/KvDomains.ts` (Durable-DAV,
 * Durable-DAV-Router, Edge-Sonic, Mail-Otter — the same table under four sets
 * of names). The names here are the three the family shares, and they are the
 * **default**, not a requirement: a repo whose cache vocabulary is genuinely
 * different supplies its own table, because the TTL and size policy below is
 * per-repo by definition — a cache holding album artwork keyed by a file's mtime
 * and a cache holding session profiles cannot share a lifetime, and renaming
 * call sites to fit a shared table would silently change when a library is
 * re-read from its origin.
 *
 * What does **not** become open is the *union*: a consumer's registry is still a
 * closed `Record<D, KvDomainDef>` over its own names, so a typo cannot create a
 * new keyspace, and prefix collisions still start the way the family has always
 * assumed they do.
 *
 * Rationale: D1 and the Durable Object stay the source of truth. KV is a
 * loss-tolerant, read-heavy cache only — a miss or eviction must always be
 * recoverable by recompute. Call sites never touch `env.CACHE` directly; they
 * go through `KvCache` with a registry so prefixes cannot collide and TTL/size
 * policy lives in one table.
 */
const KV_KEY_VERSION = 'v1';
const KV_MAX_KEY_LENGTH = 512;
const KV_MIN_TTL_SECONDS = 60;

type KvDomainName = 'session' | 'asset' | 'metadata';

interface KvDomainDef {
  ttlSeconds: number;
  maxValueBytes: number;
  description: string;
}

/**
 * A keyspace's whole policy, closed over its own domain names.
 *
 * `D` is the consumer's union, so `KV_DOMAINS` satisfies `KvDomains<KvDomainName>`
 * and a repo's own table satisfies `KvDomains<'songMeta' | 'albumArt'>` — with
 * both keeping the "this name exists" check that makes a typo a throw rather than
 * a new prefix.
 */
type KvDomains<D extends string = KvDomainName> = Readonly<Record<D, KvDomainDef>>;

const KV_DOMAINS: KvDomains = {
  session: {
    ttlSeconds: 300,
    maxValueBytes: 65_536,
    description: 'Per-user session/profile snapshots; invalidated on any credential change.',
  },
  asset: {
    ttlSeconds: 300,
    maxValueBytes: 10_485_760,
    description: 'Binary payloads (file bodies, sealed secrets) with etag/contentType metadata; invalidated on write.',
  },
  metadata: {
    ttlSeconds: 120,
    maxValueBytes: 1_048_576,
    description: 'Listing/derived snapshots keyed by owner or collection; invalidated on mutation.',
  },
};

/**
 * 128-bit digest built from four independent FNV-1a lanes.
 *
 * Why not a single 32-bit FNV: `buildKvKey` falls back to a digest when a key
 * exceeds the platform's 512-character limit, and the longest keys embed a
 * user-controlled path or name. A 32-bit digest over a shared keyspace is
 * collision-searchable — someone who controls names in their own scope could
 * grind a colliding key and read another tenant's cached bytes. Four lanes over
 * the same bytes with different offsets/primes cost one extra pass and take a
 * birthday collision to ~2^64 work, which is not worth attacking.
 *
 * Synchronous on purpose: `buildKvKey` is called from sync cache-key builders.
 */
function digest128(input: string): string {
  const LANES = 4;
  const offsets = [0x81_1c_9d_c5, 0xc2_b2_ae_35, 0x27_d4_eb_2f, 0x16_56_67_b1];
  let out = '';
  for (let lane = 0; lane < LANES; lane += 1) {
    let hash = offsets[lane];
    const prime = 0x01_00_01_93 + lane * 0x9e_37_79_b9;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.codePointAt(i) ?? 0;
      hash = Math.imul(hash, prime);
    }
    out += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

function sanitizeSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) throw new Error('KV key segment must not be empty.');
  return encodeURIComponent(trimmed);
}

/**
 * The key for a value.
 *
 * `domains` is an optional trailing argument rather than a required one so the
 * common case — the kit's own vocabulary — reads as two arguments. It is the
 * **same registry** a `KvCache` holds: a key built against one table and a TTL
 * resolved against another is a cache that reads and writes under one policy and
 * reports another, which is the failure this threading exists to make impossible
 * rather than to document.
 */
function buildKvKey<D extends string = KvDomainName>(
  domain: D,
  parts: readonly string[],
  domains: KvDomains<D> = KV_DOMAINS as KvDomains<D>,
): string {
  if (!domains[domain]) throw new Error(`Unknown KV domain: ${domain}.`);
  if (parts.length === 0) throw new Error(`KV domain ${domain} requires at least one key part.`);
  const prefix = `${domain}:${KV_KEY_VERSION}:`;
  const joined = parts.map((part) => sanitizeSegment(part)).join(':');
  const full = prefix + joined;
  if (full.length <= KV_MAX_KEY_LENGTH) return full;
  // Deterministic overflow form. Note the consequence for invalidation: an
  // overflowing key does not start with the plain prefix, so `purgePrefix` on
  // the parts will not match it. Callers must therefore bound the key material
  // they cache (path length, identifier length) — the digest is a crash guard,
  // not a caching strategy.
  return `${prefix}h:${digest128(joined)}`;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Resolve a TTL, defaulting to the domain's own. Every domain declares a
 * required `ttlSeconds`, so there is no "no TTL" case to represent.
 */
function clampTtl<D extends string = KvDomainName>(
  ttlSeconds: number | undefined,
  domain: D,
  domains: KvDomains<D> = KV_DOMAINS as KvDomains<D>,
): number {
  const fallback = domains[domain]?.ttlSeconds ?? KV_DOMAINS.session.ttlSeconds;
  const effective = ttlSeconds ?? fallback;
  return Number.isFinite(effective) ? Math.max(KV_MIN_TTL_SECONDS, Math.floor(effective)) : fallback;
}

export {
  KV_DOMAINS,
  KV_KEY_VERSION,
  KV_MAX_KEY_LENGTH,
  KV_MIN_TTL_SECONDS,
  buildKvKey,
  clampTtl,
  digest128,
  sanitizeSegment,
  utf8ByteLength,
};
export type { KvDomainDef, KvDomainName, KvDomains };
