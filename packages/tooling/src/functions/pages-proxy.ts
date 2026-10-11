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
 *   removes `Forwarded`, `True-Client-IP` and `X-Real-Ip`. Edge-Sonic goes
 *   further and *never* sets `X-Forwarded-For` at all, because its worker keys
 *   the rate limiter on `CF-Connecting-IP` and refuses `X-Forwarded-For` on
 *   purpose.
 *
 * ### The convergence decision on `X-Forwarded-For`
 *
 * The two families disagree, and the disagreement is about which worker is
 * behind the binding. Mail-Meow's behaviour is kept as the default because it is
 * the only one that preserves the client IP for the audit trail, which five repos
 * read. A repo whose worker refuses the header — Edge-Sonic's — passes
 * `forwardClientIp: false`, which deletes it and sets nothing. What is *not*
 * available is the source repos' conditional `if (clientIp) set(...)`: that is
 * the defect Mail-Meow recorded fixing, and a factory that could reintroduce it
 * would be a factory that carries the bug forward.
 *
 * ### `duplex: 'half'` rides with the body
 *
 * Required by the Fetch spec whenever a `Request` is constructed with a **stream**
 * body. workerd does not throw without it, which is why the line was absent from
 * every Pages copy — and Node does, which is why `test/pages-proxy.test.ts` in
 * Edge-Sonic could not drive the handler at all. It is spread only where a body
 * is forwarded, because a `RequestInit` carrying `duplex` and no body is a shape
 * no runtime documents; the cast is `as RequestInit` either way, since `duplex`
 * is not in the DOM lib's type.
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

/** The header Cloudflare sets with the socket's peer address. */
const CF_CONNECTING_IP_HEADER = 'CF-Connecting-IP';

/**
 * What `createPagesProxy` accepts.
 */
export interface PagesProxyOptions {
  /**
   * Set `X-Forwarded-For` from `CF-Connecting-IP`.
   *
   * Default `true` — Mail-Meow's behaviour, which five repos rely on for their
   * audit trail. Pass `false` for a worker that refuses the header outright
   * (Edge-Sonic's does), and the header is deleted and nothing set.
   */
  readonly forwardClientIp?: boolean;
}

/**
 * The `onRequest` handler for `functions/[[path]].ts`.
 *
 * Usage — the consumer's `functions/[[path]].ts` becomes two lines:
 *
 * ```ts
 * import { createPagesProxy } from '@rexezuge/tooling/functions/pages-proxy';
 * export const onRequest = createPagesProxy();
 * ```
 *
 * @param options see {@link PagesProxyOptions}. Omitted gives the family's
 *   majority behaviour.
 */
export function createPagesProxy(options: PagesProxyOptions = {}): PagesFunction {
  const forwardClientIp = options.forwardClientIp ?? true;

  return async ({ request, env }: PagesFunctionContext): Promise<Response> => {
    const originalUrl: URL = new URL(request.url);

    const headers: Headers = new Headers(request.headers);
    for (const header of CLIENT_FORWARDING_HEADERS) headers.delete(header);

    // Set from values read off the request rather than from the client: only the
    // proxy knows which host it served, and a service binding hands over a
    // rewritten URL, so the original path is what has to be carried across.
    headers.set('X-Forwarded-Host', originalUrl.host);
    headers.set('X-Forwarded-Proto', originalUrl.protocol.replace(':', ''));
    headers.set('X-Forwarded-Uri', `${originalUrl.pathname}${originalUrl.search}`);

    if (forwardClientIp) {
      const clientIp: string | null = request.headers.get(CF_CONNECTING_IP_HEADER);
      if (clientIp) headers.set('X-Forwarded-For', clientIp);
    }

    // `GET`/`HEAD` carry no body, and a `Request` with one is rejected outright
    // for those methods. The body is forwarded as a *stream*, so a large upload
    // does not have to fit in memory on the Pages side.
    const hasBody: boolean = request.method !== 'GET' && request.method !== 'HEAD';

    const proxyRequest: Request = new Request(originalUrl.href, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // See the header: `duplex` is not in the DOM lib's `RequestInit` type, and
      // removing the cast would mean not forwarding bodies at all, which is a
      // worse answer than one assertion.
      ...(hasBody && { duplex: 'half' }),
      redirect: request.redirect,
    } as RequestInit);

    return env.API_WORKER.fetch(proxyRequest);
  };
}
