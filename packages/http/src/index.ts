/**
 * `@rexezuge/http` — the family's HTTP layer.
 *
 * ## Why this package exists
 *
 * Eight other packages in the kit are framework-free on purpose, and that is
 * what lets a repo adopt `shared` / `errors` / `runtime` without adopting a web
 * framework. The rate limiter, the security headers, the route bases and the
 * Access auth service cannot be framework-free: they are Hono- and
 * chanfana-shaped, and four repos shipped four copies of each while the kit's
 * zero-dependency rule silently prevented the fix.
 *
 * So this is the one package that breaks the rule, deliberately. It is also the
 * only one a repo can choose to skip — nothing in the other eight imports it.
 *
 * ## What converged here
 *
 * | Module            | From                                                                  |
 * | ----------------- | --------------------------------------------------------------------- |
 * | `rateLimit`       | Edge-Sonic's — the copy that fixed the per-request sweep, the resolver `max`, and the `Retry-After` header |
 * | `securityHeaders` | Four byte-identical copies, with the `no-store` predicate made a **required** argument |
 * | `accessAuth`      | Edge-Sonic's — the copy that replaced a `ctx.access` branch that could never execute |
 * | `ErrorMapper`     | Edge-Sonic's — split by surface, not by convenience                    |
 * | `routeBase`       | All three incompatible shapes, with their shared parts converged       |
 *
 * ## The null rule
 *
 * `null` means absent, `undefined` means not supplied — see the kit's `AGENTS.md`.
 * The middleware in this package takes *structural* context types rather than
 * Hono's `Context<…>`, which keeps a `Request`-dispatching surface and a test
 * double usable without a framework import.
 */

export { clientIp, rateLimit } from './rateLimit';
export type { RateLimitContext, RateLimitHandler, RateLimitOptions, RateLimitSurface } from './rateLimit';

export {
  applySecurityHeaders,
  securityHeaders,
  sensitivePaths,
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY,
} from './securityHeaders';
export type { HeaderContext } from './securityHeaders';

export { AccessAuthError, authenticateAccess, identityFromBinding, verifyAccessJwt } from './accessAuth';
export type { AccessAuthOptions, AccessBinding, AccessIdentity, AccessJwtVerifier } from './accessAuth';

export { errorBody, toErrorResponse, toServiceError, INTERNAL_SERVER_MESSAGE } from './ErrorMapper';
export type { ErrorMapperOptions } from './ErrorMapper';

export { BaseRoute, createRouteHandler } from './routeBase';
export type { RouteContext, RouteHandler, RouteHandlerOptions } from './routeBase';
