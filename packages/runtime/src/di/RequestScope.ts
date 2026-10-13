import type { Container } from './Container.ts';

/**
 * Single-scope-per-request helper.
 *
 * Converged verbatim from `backend-runtime/src/di/RequestScope.ts` (identical in
 * all nine repos). Middleware creates one `Container` per request and stores it
 * on the request context; handlers resolve via `getRequestScope(c)` instead of
 * building a scope per handler — which minted N scopes per request and broke
 * singleton memoization.
 */
interface ScopedContext {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  readonly env: unknown;
}

const SCOPE_KEY = '__kitScope';

/**
 * What {@link getRequestScope} throws when no scope is installed.
 *
 * Exported because a caller that wants to *react* to the absence — rather than
 * let it propagate — has no other option than copying this sentence out of the
 * throw and comparing against it. That is a string comparison across a package
 * boundary: reword the message and the consumer's branch silently stops
 * matching, which is the one direction that produces no error anywhere.
 *
 * Prefer {@link tryGetRequestScope}, which is checked by construction. This
 * constant is for a caller that must react to the *specific* failure rather than
 * to "no scope" in general — a route that answers a scoped JSON error instead of
 * propagating, for instance.
 */
const SCOPE_MISSING_MESSAGE = 'Request scope is not set. Register the scope middleware before routes.';

function setRequestScope(c: ScopedContext, scope: Container): void {
  c.set(SCOPE_KEY, scope);
}

/**
 * Structural adapter for framework contexts.
 *
 * Hono's `Context.get` overloads are not assignable to `ScopedContext['get']`,
 * so call sites used `c as never`. Centralize that single unsafe cast here —
 * one audited location instead of many scattered ones.
 */
function asScopedContext(c: { get(key: string): unknown; set?(key: string, value: unknown): void; readonly env: unknown }): ScopedContext {
  return c as unknown as ScopedContext;
}

function getRequestScope(c: ScopedContext): Container {
  const scope = tryGetRequestScope(c);
  if (!scope) throw new Error(SCOPE_MISSING_MESSAGE);
  return scope;
}

/**
 * The installed scope, or `null`.
 *
 * The way to ask without throwing. `getRequestScope` is right where a missing
 * scope is a bug that should surface; this is right where it is an expected
 * branch — and it is checked by construction, so it cannot drift from the
 * message the throwing form uses.
 */
function tryGetRequestScope(c: ScopedContext): Container | null {
  return (c.get(SCOPE_KEY) as Container | undefined) ?? null;
}

export { setRequestScope, getRequestScope, tryGetRequestScope, asScopedContext, SCOPE_MISSING_MESSAGE };
export type { ScopedContext };
