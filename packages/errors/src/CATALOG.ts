/**
 * The single source of truth for HTTP-semantic errors.
 *
 * Eight repos carried this table as fourteen copy-pasted classes; the status,
 * machine code, and default message could drift per file. The catalog keeps all
 * three fields adjacent, so adding a status is one row, and a status can never
 * disagree with its code.
 *
 * `expose` marks whether the raw message may reach a client. Every 4xx is
 * trusted; every 5xx is not — a 5xx message is for operators, and
 * `toErrorResponse()` substitutes a generic one.
 */
interface HttpErrorDefinition {
  status: number;
  code: string;
  defaultMessage: string;
  expose: boolean;
}

const CATALOG = {
  BadRequest: {
    status: 400,
    code: 'BAD_REQUEST',
    defaultMessage: 'The request could not be understood or was missing required parameters.',
    expose: true,
  },
  Unauthorized: {
    status: 401,
    code: 'UNAUTHORIZED',
    defaultMessage: 'Authentication is required and has failed or has not yet been provided.',
    expose: true,
  },
  Forbidden: {
    status: 403,
    code: 'FORBIDDEN',
    defaultMessage: 'You do not have permission to perform this action.',
    expose: true,
  },
  NotFound: {
    status: 404,
    code: 'NOT_FOUND',
    defaultMessage: 'The requested resource was not found.',
    expose: true,
  },
  MethodNotAllowed: {
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
    defaultMessage: 'The requested method is not allowed for this resource.',
    expose: true,
  },
  Conflict: {
    // Distinct from `BadRequest` so callers can tell "invalid input" from
    // "that value is taken" — the latter never succeeds without a change.
    status: 409,
    code: 'CONFLICT',
    defaultMessage: 'The request conflicts with the current state of the resource.',
    expose: true,
  },
  PreconditionFailed: {
    status: 412,
    code: 'PRECONDITION_FAILED',
    defaultMessage: 'A precondition for this request failed.',
    expose: true,
  },
  PayloadTooLarge: {
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    defaultMessage: 'The request payload is larger than the server is willing to process.',
    expose: true,
  },
  UnsupportedMediaType: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    defaultMessage: 'The request payload format is not supported by this resource.',
    expose: true,
  },
  RateLimited: {
    status: 429,
    code: 'RATE_LIMITED',
    defaultMessage: 'Too many requests — slow down and retry later.',
    expose: true,
  },
  InternalServerError: {
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    defaultMessage: 'The server encountered an internal error and was unable to complete your request.',
    expose: false,
  },
  NotImplemented: {
    status: 501,
    code: 'NOT_IMPLEMENTED',
    defaultMessage: 'The server does not support the functionality required to fulfil this request.',
    expose: false,
  },
  // Upstream dependency failures: 502 is the honest status here, and the
  // retryable marker (not the status) is what schedules a retry.
  BadGateway: {
    status: 502,
    code: 'BAD_GATEWAY',
    defaultMessage: 'The server received an invalid response from an upstream service.',
    expose: false,
  },
  ServiceUnavailable: {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    defaultMessage: 'The server is currently unable to handle the request — retry after a delay.',
    expose: true,
  },
} as const satisfies Record<string, HttpErrorDefinition>;

type HttpErrorType = keyof typeof CATALOG;

export { CATALOG };
export type { HttpErrorDefinition, HttpErrorType };
