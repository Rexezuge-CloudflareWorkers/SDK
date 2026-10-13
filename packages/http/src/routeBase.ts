/**
 * Shared statics for Hono route handlers.
 *
 * Converged from `endpoints/IBaseRoute.ts` / `endpoints/BaseRoute.ts` in the
 * nine full-framework repos, which hold **two incompatible shapes**: a Hono
 * `Response`-returning base class, and a namespace of statics. Both survive here,
 * because the decision of which to use is genuinely per-repo — but the *parts*
 * they share no longer do.
 *
 * ## Why a namespace and not a base class
 *
 * Durable-DAV's Template Method (`abstract handleRequest` + `handle()` owning the
 * try/catch) had **zero** subclasses — `VolumeScopedRoute` reimplements the same
 * try/catch against the same `toErrorResponse` — so it advertised an inheritance
 * contract nothing was using, while its own doc comment claimed handlers "stop
 * duplicating" error mapping.
 *
 * So the shared surface is a namespace of statics. A repo that wants the Template
 * Method takes {@link createRouteHandler}; a repo that does not takes the statics
 * directly. Neither pays for the other's abstraction.
 *
 * ## What this does not ship, and why that is not a gap
 *
 * Six of the nine repos build routes as chanfana `OpenAPIRoute` subclasses with
 * file-based routing and a zod schema registry. This header used to claim
 * "both are here — `IBaseRoute` is the chanfana shape". There is no
 * `IBaseRoute` in this package: not exported, not defined, not in the barrel.
 * Nothing chanfana-shaped was ever converged, so the paragraph named a symbol a
 * consumer could not import and would have spent an afternoon looking for.
 *
 * It is recorded here rather than dropped so the next repo to read this knows the
 * chanfana half is genuinely **unconverged** and not something it missed. A
 * shared statics block genuinely can be adopted underneath an `OpenAPIRoute`
 * subclass — `readJson`/`requireString` are framework-free — so the shape is
 * available to those six repos without a base class they would have to extend.
 */
import { BadRequestError } from '@rexezuge/errors';
import { toErrorResponse } from './ErrorMapper.ts';

/**
The slice of a Hono context a route handler reads.
*/
interface RouteContext {
  req: { json(): Promise<unknown>; raw: Request };
  env: unknown;
  json(body: unknown, status?: number, headers?: Record<string, string>): Response;
  /**
  Optional request scope, when the repo uses DI.
  */
  get?(key: string): unknown;
}

type RouteHandler = (c: RouteContext) => Promise<Response>;

interface RouteHandlerOptions {
  /**
  A repo-specific mapper. Defaults to the canonical `{Exception:{…}}` dialect.
  */
  onError?(error: unknown, c: RouteContext): Response;
}

function defaultOnError(error: unknown, c: RouteContext): Response {
  return toErrorResponse(error, c.json.bind(c));
}

/**
 * The shared statics.
 *
 * `readJson` is deliberately total: a malformed body yields `{}` rather than
 * throwing, because a handler that wants to reject a malformed body validates it
 * and gets a 400 through the normal path. A parse error thrown from here would
 * bypass whatever validation error message the repo has.
 */
const BaseRoute = {
  /**
   * Read the JSON body, or `{}`.
   *
   * Bounded by the caller's schema, not here: an unbounded `req.json()` on a
   * worker is a memory ceiling, and each repo's limit is its own
   * `MAX_JSON_BODY_BYTES`.
   */
  async readJson(c: RouteContext): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return {};
    }
  },

  /**
  A required string field, or the error that says which field was missing.
  */
  requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestError(`\`${field}\` is required and must be a non-empty string.`);
    }
    return value;
  },

  /**
  Map a caught value to a response, using the repo's dialect if it declared one.
  */
  toErrorResponse(error: unknown, c: RouteContext, options?: RouteHandlerOptions): Response {
    return (options?.onError ?? defaultOnError)(error, c);
  },
} as const;

/**
 * Build a Template-Method route handler.
 *
 * The shape Edge-Git and Edge-Sonic converged on: the handler owns only its
 * domain work, and the base owns the try/catch so a private repo's existence and
 * a 5xx's message are decided in exactly one place per app.
 */
function createRouteHandler(handle: RouteHandler, options: RouteHandlerOptions = {}): (c: RouteContext) => Promise<Response> {
  return async (c: RouteContext): Promise<Response> => {
    try {
      return await handle(c);
    } catch (error: unknown) {
      return (options.onError ?? defaultOnError)(error, c);
    }
  };
}

export { BaseRoute, createRouteHandler };
export type { RouteContext, RouteHandler, RouteHandlerOptions };
