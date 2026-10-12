/**
 * Single-KV keyspace: one `CACHE` binding, domains separated by key prefix.
 *
 * Converged from `backend-runtime/src/kv/KvDomains.ts` (Durable-DAV,
 * Durable-DAV-Router, Edge-Sonic, Mail-Otter — the same table under four sets
 * of names). The domains are generalized to the three the whole family shares;
 * a consumer with a different cache vocabulary renames its call sites (clients
 * adapt) rather than extending the registry, because an open registry is how
 * prefix collisions start.
 *
 * Rationale: D1 and the Durable Object stay the source of truth. KV is a
 * loss-tolerant, read-heavy cache only — a miss or eviction must always be
 * recoverable by recompute. Call sites never touch `env.CACHE` directly; they
 * go through `KvCache` with a closed `KvDomainName` registry so prefixes cannot
 * collide and TTL/size policy lives in one table.
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

const KV_DOMAINS: Record<KvDomainName, KvDomainDef> = {
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

function buildKvKey(domain: KvDomainName, parts: readonly string[]): string {
  const def = KV_DOMAINS[domain];
  if (!def) throw new Error(`Unknown KV domain: ${domain}.`);
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
function clampTtl(ttlSeconds: number | undefined, domain: KvDomainName): number {
  const effective = ttlSeconds ?? KV_DOMAINS[domain].ttlSeconds;
  return Number.isFinite(effective) ? Math.max(KV_MIN_TTL_SECONDS, Math.floor(effective)) : KV_DOMAINS[domain].ttlSeconds;
}

export { KV_DOMAINS, KV_MAX_KEY_LENGTH, KV_MIN_TTL_SECONDS, buildKvKey, clampTtl, digest128, sanitizeSegment, utf8ByteLength };
export type { KvDomainDef, KvDomainName };
