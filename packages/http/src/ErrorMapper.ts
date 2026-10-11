/**
 * Error → response mapping at the HTTP boundary.
 *
 * Converged from `errors/ErrorMapper.ts` in Durable-DAV-Router, Edge-Git and
 * Edge-Sonic. Edge-Sonic's split is the one that survived, because it is the
 * only one that states **why** it splits: by surface, not by convenience.
 *
 * ## One surface, one dialect
 *
 * The `{Exception:{Type,Message}}` envelope is the family's established wire
 * format and the one the SPAs decode. A protocol surface with its own envelope —
 * Subsonic, WebDAV, CalDAV — must answer in *that* envelope, because a client
 * parsing that surface has no way to interpret anything else: a 401 carrying an
 * unrecognized body renders as "server error" and the client retries.
 *
 * So the split is by surface, and a caller declares which one it is on rather
 * than each handler deciding for itself. A surface that has its own dialect
 * supplies {@link ErrorMapperOptions.toResponse}; everything else gets the
 * canonical envelope.
 *
 * ## A 5xx never carries its own message
 *
 * `expose` in `@rexezuge/errors` already decides this, and this mapper is where
 * that decision becomes bytes. A D1 error names tables and columns; an upstream
 * body can carry a stack. The substitution lives here once rather than in every
 * boundary mapper.
 *
 * ## A 404 is a 404
 *
 * `NotFoundError` maps to 404 and stays 404. A surface that needs a protocol code
 * for absence (Subsonic's `code=70`) supplies its own mapper; this one does not
 * second-guess the taxonomy into something a client can misread.
 */
import { ServiceError } from '@rexezuge/errors';

interface ErrorMapperOptions {
  /**
   * The HTTP status when the error carries none it should publish. Defaults to
   * 500 — a non-`ServiceError` that reached the boundary is an unknown failure.
   */
  fallbackStatus?: number;
  /** A surface-specific dialect. Returns `undefined` to fall through to the default. */
  toResponse?(error: ServiceError, status: number): Response | undefined;
  /** Adds headers to the response (e.g. `Retry-After` on a 429). */
  headers?(status: number, error: ServiceError): Record<string, string>;
}

const INTERNAL_SERVER_MESSAGE = 'The server encountered an internal error and was unable to complete your request.';

/**
 * Normalize an unknown catch value into the taxonomy.
 *
 * Re-wrapping a `ServiceError` would bury its context, so it passes through
 * untouched and the caller can rely on `instanceof` downstream.
 */
function toServiceError(error: unknown): ServiceError {
  return error instanceof ServiceError ? error : ServiceError.from(error);
}

/**
 * The canonical wire body.
 *
 * A 4xx keeps its message; a 5xx is masked. This is the `{Exception:{…}}`
 * envelope every SPA in the family decodes, and the one a surface with no
 * dialect of its own should answer in.
 */
function errorBody(error: ServiceError): { Exception: { Type: string; Message: string } } {
  return {
    Exception: {
      Type: error.type,
      Message: error.expose ? error.message : INTERNAL_SERVER_MESSAGE,
    },
  };
}

/**
 * Map a caught value to a `Response`.
 *
 * The `json`-shaped callback is injected rather than imported from Hono so this
 * module stays free of the `Context` generic: a caller passes its own `c.json`,
 * which is what makes it usable from a bare-`Request` dispatcher as well.
 */
function toErrorResponse(
  error: unknown,
  json: (body: unknown, status: number, headers?: Record<string, string>) => Response,
  options: ErrorMapperOptions = {},
): Response {
  const serviceError = toServiceError(error);
  const status = serviceError.status || options.fallbackStatus || 500;

  const custom = options.toResponse?.(serviceError, status);
  if (custom) return custom;

  const headers = options.headers?.(status, serviceError) ?? {};
  return json(errorBody(serviceError), status, headers);
}

export { errorBody, toErrorResponse, toServiceError, INTERNAL_SERVER_MESSAGE };
export type { ErrorMapperOptions };
