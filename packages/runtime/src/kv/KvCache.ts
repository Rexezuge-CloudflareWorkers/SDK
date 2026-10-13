/**
 * `KvCache` — typed facade over the single `CACHE` KV binding.
 *
 * Converged from `backend-runtime/src/kv/KvCache.ts`, identical in the four
 * repos that cache through KV. Semantics are fail-soft by design: reads return
 * `null` on miss, missing binding, or backend error; writes return `false`
 * when skipped (no binding, oversize value, backend error) and `true` when
 * stored. Callers treat KV as a pure optimization — D1/DO stay authoritative.
 *
 * ### The circuit breaker is not optional
 *
 * A fail-soft wrapper alone is not enough. "Fail soft" protects correctness, but
 * if the namespace is *hanging* rather than erroring, every read still pays a
 * timeout — burning the request's subrequest budget and wall clock, and making
 * the server slower precisely when it is already degraded. The breaker opens
 * after {@link FAILURE_THRESHOLD} consecutive failures, fails fast while open,
 * and half-opens after {@link COOLDOWN_MS} so a recovered namespace is picked up
 * without a restart. Both halves came from Edge-Sonic's copy, which measured
 * the degradation before writing the breaker; two of the family repos that
 * lacked it had this file shorter by a third.
 *
 * ### Every issued operation is charged
 *
 * A KV `get`/`put`/`delete` is a subrequest like any other — D1's limits page
 * counts *queries* per invocation and the Workers page counts subrequests to KV —
 * so a cache that is invisible to the ceiling makes every number that budgets
 * work wrong. The counter is a constructor dependency rather than a module
 * singleton so the composition root hands this facade the same one the rest of
 * the invocation holds; a default of {@link UNMETERED} keeps the
 * no-DI case honest rather than silently unmetered.
 */
import { UNMETERED } from './SubrequestMeterLike.ts';
import type { SubrequestMeterLike } from './SubrequestMeterLike.ts';
import { createLogger } from '../logger.ts';
import { KV_DOMAINS, buildKvKey, clampTtl, utf8ByteLength } from './KvDomains.ts';
import type { KvDomainName, KvDomains } from './KvDomains.ts';

const logger = createLogger('KvCache');

/**
 * Log that a skipped write was skipped, at the level the caller can act on.
 *
 * A size or metadata refusal is a code or cache-shape problem, not a namespace
 * fault, so it is debug: the write simply did not happen and the caller reads
 * `false` as "not stored", which is what a cache means by that.
 */
function skipReason(domain: string, reason: string): void {
  logger.debug(`KV write skipped for ${domain}: ${reason}.`);
}

/**
Consecutive failures before the breaker opens.
*/
const FAILURE_THRESHOLD = 3;

/**
How long the breaker stays open before a half-open probe.
*/
const COOLDOWN_MS = 5000;

interface KvListPage {
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
}

interface KvGetWithMetadataResult {
  value: string | ArrayBuffer | null;
  metadata: unknown;
}

interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  getWithMetadata?(key: string, type: 'arrayBuffer'): Promise<KvGetWithMetadataResult>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<unknown>;
  list(options: { prefix: string; limit?: number; cursor?: string }): Promise<KvListPage>;
}

interface KvPutOptions {
  ttlSeconds?: number;
}

interface KvFileMetadata {
  etag: string;
  contentType: string | null;
}

interface KvBinaryEntry {
  bytes: Uint8Array;
  metadata: KvFileMetadata;
}

const PURGE_LIST_LIMIT = 1000;
const PURGE_MAX_PAGES = 10;

/**
Per-isolate breaker state.

Module-level rather than per-instance on purpose: the binding is process-wide,
so a namespace that is down for one `KvCache` is down for all of them, and a
per-instance breaker would give every request scope its own three failures to
get through before the fast path engaged.
*/
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

/**
Test seam: force the breaker closed and forget the failure count.
*/
function resetBreakerForTests(): void {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
}

/**
True while the breaker is open, i.e. calls should be skipped entirely.
*/
function isCircuitOpen(now: number): boolean {
  if (breakerOpenedAt === 0) return false;
  if (now - breakerOpenedAt < COOLDOWN_MS) return true;
  // Cooldown elapsed: allow exactly one probe through by reopening the window.
  breakerOpenedAt = 0;
  consecutiveFailures = FAILURE_THRESHOLD - 1;
  return false;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (!(consecutiveFailures >= FAILURE_THRESHOLD && breakerOpenedAt === 0)) {
    return;
  }

  breakerOpenedAt = Date.now();
  logger.warn(`KV circuit opened after ${FAILURE_THRESHOLD} consecutive failures; serving from the source of truth until it recovers.`);
}

class KvCache<D extends string = KvDomainName> {
  /**
   * @param namespace The binding, or `null` for a deployment without one.
   * @param meter The invocation's subrequest counter, or an unmetered default.
   * @param domains The keyspace's own domain table. Defaults to the kit's; supply
   *   one whose names and lifetimes are yours, because the TTL and size policy is
   *   per-repo by definition.
   */
  public constructor(
    private readonly namespace?: KvNamespaceLike | null,
    private readonly meter: SubrequestMeterLike = UNMETERED,
    private readonly domains: KvDomains<D> = KV_DOMAINS as unknown as KvDomains<D>,
  ) {}

  /**
   * The keyspace's policy table, for a caller building a key beside a read.
   */
  public get keyspaces(): KvDomains<D> {
    return this.domains;
  }

  /**
   * Whether the binding is present.
   *
   * Distinct from "healthy": a present binding can still be failing, and that is
   * the case the breaker exists for. Callers must not branch on this to decide
   * whether they may read the source of truth — they read it regardless.
   */
  public get available(): boolean {
    return !!this.namespace;
  }

  /**
   * Run a KV operation under the breaker.
   *
   * Never throws and never returns a rejection: every failure path is a `null`
   * or `false`, which callers read as "miss" or "not stored".
   *
   * `charge: false` is for the one caller that issues a *loop* of operations
   * inside one `guard` ({@link purgePrefix}), where charging once here would
   * report a 10,000-key purge as a single subrequest. It charges per call instead.
   */
  private async guard<T>(operation: string, run: () => Promise<T>, fallback: T, options?: { charge?: boolean }): Promise<T> {
    const ns = this.namespace;
    if (!ns) return fallback;
    if (isCircuitOpen(Date.now())) return fallback;
    // Charged here, not at the call site: this is the point at which a request is
    // *about to be issued*, and it is reached only when there is a namespace and
    // the breaker is closed. A miss caused by no binding, or by a namespace that
    // is down, spends no subrequest — which is the whole point of failing soft,
    // and charging before this line would have counted a request that was never
    // made.
    if (options?.charge !== false) this.meter.charge(1, 'kv');
    try {
      const result = await run();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure();
      logger.debug(`KV ${operation} failed, serving from the source of truth: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  }

  public async getText(domain: D, parts: readonly string[]): Promise<string | null> {
    return await this.guard(
      'get',
      async () => {
        // `'text'` stated rather than relied upon: a reader that does not say what it
        // wants is given the platform's default, and the two defaults are not the
        // same. Only reachable-as-bytes is decoded rather than thrown on, because the
        // caller reads this as a cache and a corrupt entry should cost a recompute.
        const raw = await this.namespace!.get(buildKvKey(domain, parts, this.domains), 'text');
        if (raw === null || raw === undefined) return null;
        return typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      },
      null,
    );
  }

  public async putText(domain: D, parts: readonly string[], value: string, options?: KvPutOptions): Promise<boolean> {
    // No unknown-domain check: `buildKvKey` below throws for one, and the
    // return type has never been able to express that. A silent `false` here
    // would have made an unknown domain look like a namespace miss.
    const def = this.domains[domain];
    if (utf8ByteLength(value) > def.maxValueBytes) {
      skipReason(domain, `value exceeds ${def.maxValueBytes} bytes`);
      return false;
    }
    return await this.guard(
      'put',
      async () => {
        const ttl = clampTtl(options?.ttlSeconds, domain, this.domains);
        await this.namespace!.put(buildKvKey(domain, parts, this.domains), value, { expirationTtl: ttl });
        return true;
      },
      false,
    );
  }

  public async getJson<T>(domain: D, parts: readonly string[]): Promise<T | null> {
    const raw = await this.getText(domain, parts);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  public async putJson(domain: D, parts: readonly string[], value: unknown, options?: KvPutOptions): Promise<boolean> {
    let raw: string;
    try {
      raw = JSON.stringify(value);
    } catch {
      return false;
    }
    return await this.putText(domain, parts, raw, options);
  }

  /**
   * Binary read for the `asset` domain: value bytes plus `{etag, contentType}`
   * KV metadata in a single entry. Legacy base64-JSON entries carry no metadata
   * and read as a miss here — the caller falls back to `getJson` for one TTL
   * window rather than this layer knowing the legacy shape.
   */
  public async getBinary(domain: D, parts: readonly string[]): Promise<KvBinaryEntry | null> {
    const ns = this.namespace;
    if (!ns || typeof ns.getWithMetadata !== 'function') return null;
    return await this.guard(
      'getBinary',
      async () => {
        const res = await this.namespace!.getWithMetadata!(buildKvKey(domain, parts, this.domains), 'arrayBuffer');
        if (!res || res.value == null) return null;
        const value: unknown = res.value;
        let bytes: Uint8Array | null = null;
        if (value instanceof ArrayBuffer) {
          bytes = new Uint8Array(value.slice(0));
        } else if (value instanceof Uint8Array) {
          bytes = value.slice();
        } else if (typeof value === 'string') {
          bytes = new TextEncoder().encode(value);
        }
        if (!bytes) return null;
        const meta = res.metadata as { etag?: unknown; contentType?: unknown } | null | undefined;
        if (typeof meta !== 'object' || meta === null || typeof meta.etag !== 'string' || meta.etag === '') return null;
        return { bytes, metadata: { etag: meta.etag, contentType: typeof meta.contentType === 'string' ? meta.contentType : null } };
      },
      null,
    );
  }

  /**
   * Binary write for the `asset` domain. Size is enforced on raw bytes (no
   * base64 inflation) and failures stay fail-soft like `putText`.
   */
  public async putBinary(
    domain: D,
    parts: readonly string[],
    bytes: Uint8Array,
    metadata: { etag: string; contentType: string | null },
    options?: KvPutOptions,
  ): Promise<boolean> {
    if (!(bytes instanceof Uint8Array)) {
      skipReason(domain, 'value is not bytes');
      return false;
    }
    const def = this.domains[domain];
    if (bytes.byteLength > def.maxValueBytes) {
      skipReason(domain, `value exceeds ${def.maxValueBytes} bytes`);
      return false;
    }
    if (typeof metadata?.etag !== 'string' || metadata.etag === '') {
      skipReason(domain, 'missing etag metadata');
      return false;
    }
    return await this.guard(
      'putBinary',
      async () => {
        const ttl = clampTtl(options?.ttlSeconds, domain, this.domains);
        const contentType = typeof metadata.contentType === 'string' ? metadata.contentType : null;
        await this.namespace!.put(buildKvKey(domain, parts, this.domains), bytes.slice().buffer, {
          expirationTtl: ttl,
          metadata: { etag: metadata.etag, contentType },
        });
        return true;
      },
      false,
    );
  }

  public async del(domain: D, parts: readonly string[]): Promise<void> {
    await this.guard(
      'delete',
      async () => {
        await this.namespace!.delete(buildKvKey(domain, parts, this.domains));
      },
      undefined,
    );
  }

  /**
   * A cached binary value, or `null` — the metadata-free binary path.
   *
   * Distinct from {@link getBinary} because a KV entry may or may not carry
   * metadata, and making every binary cache carry an etag to satisfy the reader
   * means inventing one where there is nothing to validate against. A cache of
   * derived bytes — an extracted image, a rendered thumbnail — has no upstream
   * entity whose etag it could quote, so its entries legitimately carry none,
   * and `getBinary` answers `null` for all of them.
   *
   * `'arrayBuffer'` is stated rather than relied upon: `get`'s default type is
   * **`text`**, and a reader that does not say what it wants is handed the
   * platform's default. Getting that wrong is invisible in every layer above —
   * the bytes arrive, they are the wrong bytes, and nothing throws. UTF-8 is not
   * byte-preserving: a JPEG read as text is lossy-decoded and every invalid
   * sequence re-encodes as three `U+FFFD`.
   */
  public async getBytes(domain: D, parts: readonly string[]): Promise<Uint8Array | null> {
    const ns = this.namespace;
    if (!ns) return null;
    return await this.guard(
      'get',
      async () => {
        const raw = await this.namespace!.get(buildKvKey(domain, parts, this.domains), 'arrayBuffer');
        if (raw === null || raw === undefined) return null;
        // Kept for a caller or a double that hands back text. Assert the requested
        // type rather than trusting the returned one.
        return typeof raw === 'string' ? new TextEncoder().encode(raw) : new Uint8Array(raw);
      },
      null,
    );
  }

  /**
   * Cache a binary value under no metadata.
   *
   * @returns `false` when it was not stored — no binding, an open circuit, or a
   *   value over the domain's `maxValueBytes`. Never throws, and a `false` is a
   *   miss the next read re-derives from the source of truth.
   *
   * A **copy**, not a `subarray` view: the caller almost always passes a slice of
   * a much larger read buffer, and handing KV a view pins that whole buffer for
   * as long as the entry lives.
   */
  public async putBytes(domain: D, parts: readonly string[], value: Uint8Array, options?: KvPutOptions): Promise<boolean> {
    if (!(value instanceof Uint8Array)) {
      skipReason(domain, 'value is not bytes');
      return false;
    }
    const def = this.domains[domain];
    if (value.byteLength > def.maxValueBytes) {
      skipReason(domain, `value exceeds ${def.maxValueBytes} bytes`);
      return false;
    }
    return await this.guard(
      'put',
      async () => {
        const ttl = clampTtl(options?.ttlSeconds, domain, this.domains);
        await this.namespace!.put(buildKvKey(domain, parts, this.domains), value.slice().buffer, { expirationTtl: ttl });
        return true;
      },
      false,
    );
  }

  /**
   * Delete every key under a prefix, page-capped. Restarts from the start after
   * each page: deleting while a positional cursor advances would skip keys.
   */
  public async purgePrefix(domain: D, parts: readonly string[] = []): Promise<number> {
    const ns = this.namespace;
    if (!ns || isCircuitOpen(Date.now())) return 0;
    const prefix = parts.length === 0 ? `${domain}:` : buildKvKey(domain, parts, this.domains);
    let deleted = 0;
    try {
      for (let page = 0; page < PURGE_MAX_PAGES; page += 1) {
        // Charged per key rather than once for the loop: this issues up to
        // PURGE_MAX_PAGES * PURGE_LIST_LIMIT requests, and a caller budgeting
        // an invalidation needs to see that many, not one.
        this.meter.charge(1, 'kv');
        const result = await ns.list({ prefix, limit: PURGE_LIST_LIMIT });
        if (result.keys.length === 0) return deleted;
        for (const key of result.keys) {
          this.meter.charge(1, 'kv');
          await ns.delete(key.name);
          deleted += 1;
        }
        if (result.keys.length < PURGE_LIST_LIMIT) return deleted;
      }
      // The cap was hit with a full page still coming back, so keys remain and
      // the caller sees a count indistinguishable from a complete purge. A
      // write-invalidation that silently under-purges serves pre-write bytes
      // for a whole TTL while reporting success, so this is never silent.
      logger.warn(
        `KV purge for ${domain} hit the ${PURGE_MAX_PAGES * PURGE_LIST_LIMIT}-key page cap; at least one key may survive invalidation`,
      );
      return deleted;
    } catch (error) {
      recordFailure();
      logger.warn(`KV purge for ${domain} failed: ${error instanceof Error ? error.message : String(error)}`);
      return deleted;
    }
  }
}

export { FAILURE_THRESHOLD, COOLDOWN_MS, KvCache, PURGE_LIST_LIMIT, PURGE_MAX_PAGES, resetBreakerForTests };
export type { KvBinaryEntry, KvFileMetadata, KvNamespaceLike, KvPutOptions };
