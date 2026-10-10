/**
 * The Cloudflare Pages catch-all proxy.
 *
 * Provenance: the `functions/[[path]].ts` shim duplicated in Durable-DAV,
 * Mail-Meow and Edge-Git (and present in nine repos in total). Each copy is an
 * `onRequest` handler that forwards the request to the API worker through a
 * service binding, rewriting the three headers the worker routes on.
 *
 * What each source contributes:
 *
 * - **Durable-DAV / Edge-Git** — the core shape: set `X-Forwarded-Host`,
 *   `X-Forwarded-Proto` and `X-Forwarded-Uri` from the original URL, forward the
 *   body for non-GET/HEAD methods, and hand the request to `env.API_WORKER`.
 * - **Mail-Meow** — the hop-by-hop header strip, and the decision to *always*
 *   delete `X-Forwarded-For` before conditionally setting it from
 *   `CF-Connecting-IP`. Setting it only when the header was present left a
 *   caller-supplied value intact on any request that reached Pages without
 *   `CF-Connecting-IP`, so the origin would trust an attacker-chosen client IP.
 * - **Durable-DAV-Router** — `duplex: 'half'`, required whenever the forwarded
 *   body is a stream. Without it this threw a `TypeError` on every non-GET
 *   request rather than proxying it.
 * - **Edge-Sonic** — the client-forwarding-header strip list, which additionally
 *   removes `Forwarded`, `True-Client-IP` and `X-Real-Ip`.
 *
 * The result is a handler factory, so a consumer's `functions/[[path]].ts` is a
 * one-line re-export. Structural `Fetcher` and `PagesFunction` types are declared
 * here rather than imported from `@cloudflare/workers-types`, so the kit stays
 * zero-dependency and this module typechecks without the generated
 * `worker-configuration.d.ts`.
 */

/**
 * The subset of Cloudflare's `Fetcher` this proxy uses.
 *
 * Structural, not imported: the shim only ever calls `fetch`, and requiring
 * `@cloudflare/workers-types` for one method would couple the kit to a generated
 * types file that only exists inside a Wrangler project.
 */
export interface Fetcher {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/**
 * The environment a Pages Function is invoked with.
 */
export interface PagesProxyEnv {
  readonly API_WORKER: Fetcher;
}

/**
 * The context Cloudflare passes to `onRequest`.
 *
 * Only the fields this proxy reads are declared. `params` and `waitUntil` are
 * omitted because the catch-all does not use them — a shim that named them would
 * be claiming a contract it does not exercise.
 */
export interface PagesFunctionContext {
  readonly request: Request;
  readonly env: PagesProxyEnv;
}

/**
 * A Pages Function handler.
 */
export type PagesFunction = (context: PagesFunctionContext) => Promise<Response>;

/**
 * Headers a *client* may have set, stripped before the request crosses the
 * binding.
 *
 * These describe the connection between the client and the proxy. Forwarding
 * them would let the origin believe the proxy's view of the client is the
 * client's own claim about itself. The three the proxy sets itself are set from
 * values it reads off the request, not from the client's headers.
 */
const CLIENT_FORWARDING_HEADERS: readonly string[] = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Forwarded-Uri',
  'Forwarded',
  'True-Client-IP',
  'X-Real-Ip',
];
