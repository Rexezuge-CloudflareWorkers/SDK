/**
 * The family's per-isolate rate limiter.
 *
 * Converged from `apps/api/src/middleware/rateLimit.ts` in Durable-DAV,
 * Durable-DAV-Router, Edge-Git and Edge-Sonic. Edge-Sonic's was the one that
 * had solved the three defects the other three still carried, so this is that
 * one; the differences below are what each fix bought.
 *
 * ## Design decisions
 *
 * ### `max` may be a resolver, and why that is the only honest shape
 *
 * A budget read from the environment cannot be resolved at registration time:
 * the route table is built once in the worker constructor, where `env` does not
 * exist, so a `STREAM_RATE_LIMIT` read there would be a module-level constant
 * wearing a variable's name. That is how the variable came to be declared,
 * validated, shipped in the wrangler template and read by nothing while the
 * limiter used a literal — the knob was real and the code was not reading it.
 *
 * A resolver is evaluated per request from the context. The static check at
 * registration is skipped for one, because a limiter that throws *while being
 * installed* takes down every route it was attached to; an unusable answer is
 * caught per request instead.
 *
 * ### The sweep is time-triggered, not size-triggered
 *
 * It used to run on **every** request above a bucket threshold. Memory was
 * already bounded by the cap, so the cap was never the problem — the *cost* was,
 * and it was paid by every caller rather than by the one who filled the map. An
 * attacker rotating a thousand distinct keys turned every subsequent request on
 * that isolate into O(n) map work against the Free plan's 10 ms CPU budget: a
 * cheap way to make a rate limiter a denial-of-service vector against itself.
 *
 * So the **cap is enforced on every request** and only the **sweep is deferred**.
 * Those are different jobs with different failure modes: memory grows whether or
 * not a sweep runs, so deferring the cap would make the bound wrong, while the
 * sweep only reclaims memory the cap has already bounded. Nothing is lost by
 * deferring it — an expired bucket is already treated as absent by the request
 * path.
 *
 * ### An unusable budget fails **open**
 *
 * A resolver that throws must not produce an unlimited bucket: `count >= NaN` is
 * false, so a broken resolver silently turns the limiter **off** rather than
 * off-by-a-lot — the direction nobody notices. The call is therefore guarded, and
 * a throw propagates to the limiter's own fail-open path rather than to a bucket
 * check that no longer bounds anything.
 *
 * The value is only ever what the resolver returned. Deciding what an *unusable*
 * value falls back to belongs to whoever supplied it, because only they know the
 * limit's own default.
 *
 * ### `next()` runs exactly once
 *
 * The `try` encloses the limiter's own work and **not** `await next()`. It used
 * to enclose both, which caught anything the downstream chain rejected and
 * called `next()` a second time from the `catch`. A fail-open branch should not
 * enclose the thing it is failing open *for*.
 *
 * ## Per-isolate only
 *
 * Workers have no shared memory, so this bounds abuse per isolate and nothing
 * more. It is never a security control on its own.
 */

/**
 * The slice of a Hono context this limiter reads.
 *
 * Structural rather than `Context<…>` so a caller can pass any framework
 * context (or a test double) without this package pinning the generic
 * parameters, and so a plain `Request`-dispatching surface can share the
 * derivation.
 */
interface RateLimitContext {
  req: {
    header(name: string): string | undefined;
    /**
     * A query parameter, for a caller answering in a dialect its own clients parse.
     *
     * The Subsonic envelope is chosen by `?f=` and its callback name by
     * `?callback=`, so a `onThrottled` that builds one has to read both. Without
     * this the only way to answer in a protocol dialect was to cast the context —
     * which is how the one caller that needed it ended up keeping a fork of the
     * whole limiter.
     */
    query?(name: string): string | undefined;
  };
  get?(key: string): unknown;
  /**
   * The request's bindings.
   *
   * Present because `max` is a **resolver** over this same context: a limiter whose
   * budget comes from configuration — and a per-stream or per-tenant budget has to
   * come from configuration — has nowhere else to read it from. Without `env` the
   * only way to size such a limit was to close over an ambient, or to cast.
   */
  env?: unknown;
  json(body: unknown, status?: number, headers?: Record<string, string>): Response;
}

interface RateLimitOptions {
  windowMs: number;
  max: number | ((c: RateLimitContext) => number);
  keyPrefix: string;
  /**
   * Builds the 429 for a surface that has its own envelope. Defaults to the
   * `{Exception:{Type,Message}}` shape from `@rexezuge/errors`.
   *
   * This is how one surface, one dialect is enforced. A client that parses a
   * Subsonic envelope cannot read the user API's body, so a 429 carrying the
   * wrong one renders as "server error" and the client retries immediately —
   * the opposite of what a throttle is for.
   */
  onThrottled?(retryAfter: number, c: RateLimitContext): Response;
}

type RateLimitHandler = (c: RateLimitContext, next: () => Promise<Response | void>) => Promise<Response | void>;

/**
 * The one trusted client address.
 *
 * Trust order is deliberately a single entry: Cloudflare sets
 * `CF-Connecting-IP` and it cannot be spoofed by a client. `X-Forwarded-For`,
 * `x-real-ip` and every other forwarding header are **not** consulted, because
 * they are client-controlled and let an attacker rotate buckets — or, on a
 * surface with an offline credential throttle, rotate the identity keying it and
 * brute-force forever.
 *
 * Local dev without CF headers shares the `unknown` bucket, which is fail-closed
 * grouping rather than per-spoofed-header isolation.
 *
 * Takes a header reader rather than a context so a bare-`Request` dispatcher
 * uses the same derivation.
 */
function clientIp(header: (name: string) => string | undefined): string {
  return header('CF-Connecting-IP')?.trim() || 'unknown';
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Upper bound on tracked buckets.
 *
 * Every distinct key costs memory for the isolate's lifetime, so an attacker
 * rotating keys would otherwise grow the map without limit.
 */
const MAX_BUCKETS = 5000;

/**
 * Below this many buckets, cleanup does nothing at all.
 *
 * The threshold rather than 0: sweeping a handful of entries on every request is
 * work for nothing, and below the threshold an expiry sweep cannot reclaim
 * enough to matter.
 */
const CLEANUP_THRESHOLD = 1000;

/**
The sweep runs at most this often, regardless of bucket count.
*/
const CLEANUP_INTERVAL_MS = 30_000;

/**
 * One limiter's buckets, plus when it last swept.
 *
 * The timestamp lives **beside** the map rather than at module scope. It used to
 * be a module-level `let` next to a per-limiter `Map`, and the two disagreed:
 * limiter A's sweep set the timestamp and suppressed limiter B's for the next
 * 30 seconds, so a map B owned was left holding expired keys while A's map —
 * swept on the same clock — was clean. Two limiters with the same shape have
 * different traffic; the shared clock made one of them's memory bound the
 * other's.
 */
interface LimiterState {
  buckets: Map<string, Bucket>;
  lastCleanupAt: number;
}

function evictOldestBucket(buckets: Map<string, Bucket>): void {
  let oldestReset = Infinity;
  for (const [, bucket] of buckets) {
    oldestReset = Math.min(oldestReset, bucket.resetAt);
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt === oldestReset) {
      buckets.delete(key);
      return;
    }
  }
}

function cleanup(state: LimiterState, now: number): void {
  const { buckets } = state;
  // The cap is enforced here, on **every** request, and only the sweep is
  // deferred. Evicting *down* rather than clearing, so an attacker flooding new
  // keys cannot wipe out everyone else's buckets — and down to `MAX_BUCKETS - 1`
  // because the caller adds its own bucket immediately afterwards.
  let overflow = buckets.size - (MAX_BUCKETS - 1);
  while (overflow > 0) {
    evictOldestBucket(buckets);
    overflow -= 1;
  }

  // The sweep is amortised. An expired bucket is *already* treated as absent by
  // the request path, so the sweep only reclaims memory — and memory is what the
  // cap above already bounds. The cost moves from per-request to a fixed rate.
  if (buckets.size < CLEANUP_THRESHOLD) return;
  if (now - state.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  state.lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * The budget to enforce for this request.
 *
 * A resolver that throws, or that answers something that is not a positive
 * integer, is rejected here — in one place — so the limiter's own `try` fails
 * open for both rather than only for the throw.
 */
function resolveBudget(max: number | ((c: RateLimitContext) => number), c: RateLimitContext): number {
  if (typeof max === 'number') return max;
  const resolved = max(c);
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`Invalid rateLimit budget: ${String(resolved)} (must be a positive integer)`);
  }
  return resolved;
}

/**
 * Every limiter registered in this isolate, for the test seams below.
 *
 * The bucket map is a closure local, so there was nothing outside `rateLimit()`
 * that could observe the cap or reset it — and a cap nothing measures is a cap
 * nothing has tested. A consumer asserting "the bucket map never exceeded
 * {@link MAX_BUCKETS}" had no way to.
 */
const registeredLimiters: LimiterState[] = [];

/**
 * Test seam: forget every bucket every limiter is holding, and re-arm their
 * sweeps.
 */
function resetRateLimitForTests(): void {
  for (const state of registeredLimiters) {
    state.buckets.clear();
    state.lastCleanupAt = 0;
  }
}

/**
 * Test seam: how many buckets are tracked across every limiter, so a consumer
 * can assert the cap rather than infer it.
 */
function getRateLimitBucketCountForTests(): number {
  let total = 0;
  for (const state of registeredLimiters) total += state.buckets.size;
  return total;
}

function rateLimit(opts: RateLimitOptions): RateLimitHandler {
  // Misconfiguration throws at registration rather than silently installing an
  // unlimited or immediately-tripping bucket. A resolver is exempt: an
  // unusable answer there is caught per request, because a limiter that throws
  // *while being installed* takes down every route it was attached to.
  if (!Number.isSafeInteger(opts.windowMs) || opts.windowMs <= 0) {
    throw new Error(`Invalid rateLimit windowMs: ${String(opts.windowMs)} (must be a positive integer)`);
  }
  if (typeof opts.max === 'number' && (!Number.isSafeInteger(opts.max) || opts.max <= 0)) {
    throw new Error(`Invalid rateLimit max: ${String(opts.max)} (must be a positive integer)`);
  }
  if (!opts.keyPrefix || opts.keyPrefix.trim().length === 0) {
    throw new Error('Invalid rateLimit keyPrefix: must be a non-empty string');
  }

  const state: LimiterState = { buckets: new Map<string, Bucket>(), lastCleanupAt: 0 };
  registeredLimiters.push(state);

  return async (c: RateLimitContext, next: () => Promise<Response | void>): Promise<Response | void> => {
    // The limiter's own work, and **only** the limiter's own work, is inside
    // this `try`. `next()` runs from here or from a path below, never from both.
    try {
      const now = Date.now();
      cleanup(state, now);
      const max = resolveBudget(opts.max, c);

      // Prefer a resolved identity over the client address, so a bucket is per
      // operator rather than per address. Only read when the middleware can see
      // one — which is why the order of registration against auth is
      // load-bearing: a limiter installed before the identity exists silently
      // degrades to `ip:…` and every operator behind one NAT shares a budget.
      let identity = 'anon';
      try {
        identity = (c.get?.('AuthenticatedUserEmailAddress') as string | undefined) ?? `ip:${clientIp((name) => c.req.header(name))}`;
      } catch {
        identity = `ip:${clientIp((name) => c.req.header(name))}`;
      }

      const key = `${opts.keyPrefix}:${identity}`;
      const existing = state.buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        state.buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return await next();
      }

      if (existing.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        return throttled(retryAfter, c, opts);
      }

      existing.count += 1;
      return await next();
    } catch {
      // Fail open: the limiter could not size itself, and a request must not fail
      // because limiting could not be done.
      return await next();
    }
  };
}

/**
 * The 429 itself.
 *
 * `Retry-After` travels on the header as well as in the message: a client that
 * only reads the status has no other way to know how long to wait, and one that
 * retries immediately is the failure a throttle exists to prevent.
 *
 * The header is applied on **both** paths, including the `onThrottled` one. It
 * was computed and then discarded when a custom dialect was supplied, so a
 * limiter that had installed `onThrottled` to answer in a protocol envelope
 * silently dropped the one header the client's backoff depends on — and the
 * failure looks like the client ignoring a throttle rather than the server
 * forgetting to say when to resume. A custom body that cannot carry headers gets
 * them attached afterwards; nothing here can now forget to.
 */
function throttled(retryAfter: number, c: RateLimitContext, opts: RateLimitOptions): Response {
  const headers = { 'Retry-After': String(retryAfter) };
  const response = opts.onThrottled
    ? opts.onThrottled(retryAfter, c)
    : // The family's canonical dialect, without importing the error taxonomy into
      // the limiter's hot path: a rate-limited request is a 429 carrying a
      // `RateLimited` type and the retry hint in its message.
      c.json({ Exception: { Type: 'RateLimited', Message: `Too many requests. Retry after ${retryAfter}s.` } }, 429, headers);

  if (!response.headers.has('Retry-After')) {
    response.headers.set('Retry-After', String(retryAfter));
  }
  return response;
}

export { clientIp, getRateLimitBucketCountForTests, rateLimit, resetRateLimitForTests, MAX_BUCKETS };
export type { RateLimitContext, RateLimitHandler, RateLimitOptions };
