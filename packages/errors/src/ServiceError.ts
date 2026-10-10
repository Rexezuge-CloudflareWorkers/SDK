import type { ErrorResponse } from './ErrorResponse';

interface ServiceErrorOptions {
  /** Marks a transient failure: a caller retrying is meaningful. */
  retryable?: boolean;
  /** Whether the raw message may reach a client. Defaults to `status < 500`. */
  expose?: boolean;
  /** Underlying cause, preserved for operator-facing logs. */
  cause?: unknown;
}

interface ErrorHttpPayload {
  status: number;
  body: ErrorResponse;
}

const INTERNAL_SERVER_MESSAGE = 'The server encountered an internal error and was unable to complete your request.';

/**
 * Root of the error taxonomy.
 *
 * Every boundary in the family (route handlers, middleware, background tasks)
 * branches on `instanceof ServiceError`, so every concrete error must genuinely
 * extend it — an `implements` leaves the prototype chain broken and silently
 * masks typed errors as generic 500s.
 *
 * Status/type/retryable/expose are public fields, not methods: the values are
 * fixed at construction, and callers in all nine repos read them far more often
 * than they were ever written.
 */
abstract class ServiceError extends Error {
  /** The HTTP status. Defaults from the catalog; a subclass may refine it. */
  public status: number;

  /** Overridable by subclasses whose identity differs from the HTTP class name. */
  public type: string;

  /** False by default: retrying is the exception, not the rule. */
  public retryable: boolean;

  /** Whether the raw message may reach a client. Defaults to `status < 500`. */
  public expose: boolean;

  constructor(status: number, type: string, message: string, options?: ServiceErrorOptions) {
    super(message);
    // `new.target.name` rather than the passed type: a subclass reports itself
    // even if its author forgot to name it, so log lines and client payloads
    // never disagree about what failed.
    this.name = new.target.name;
    this.status = status;
    this.type = type;
    this.retryable = options?.retryable ?? false;
    this.expose = options?.expose ?? status < 500;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  /**
   * The wire form: status plus the family's `ErrorResponse` envelope.
   *
   * A non-exposing error (5xx) has its message substituted — `message` is for
   * operators, and pushing it to clients leaks internals. The substitution
   * lives here, once, rather than in nine boundary mappers.
   */
  public toErrorResponse(): ErrorHttpPayload {
    const message: string = this.expose ? this.message : INTERNAL_SERVER_MESSAGE;
    return {
      status: this.status,
      body: {
        Exception: {
          Type: this.type,
          Message: message,
        },
      },
    };
  }

  /**
   * Normalize an unknown catch-block value into the taxonomy.
   *
   * A `ServiceError` passes through untouched (re-wrapping would bury its
   * context); anything else becomes a non-retryable 500 carrying the original
   * message and cause. Boundary code should call this before mapping an error
   * to a response, so `error instanceof ServiceError` is guaranteed downstream.
   */
  public static from(error: unknown): ServiceError {
    if (error instanceof ServiceError) {
      return error;
    }
    if (error instanceof Error) {
      return new InternalServiceError(error.message, { cause: error });
    }
    return new InternalServiceError(String(error), { cause: error });
  }
}

/**
 * Private throwable used by `ServiceError.from` for pass-through wrapping.
 * Not exported: reach `InternalServerError` for the public 500.
 */
class InternalServiceError extends ServiceError {
  constructor(message: string, options?: ServiceErrorOptions) {
    super(500, 'InternalError', message, options);
  }
}

export { ServiceError, InternalServiceError };
export type { ServiceErrorOptions, ErrorHttpPayload };
