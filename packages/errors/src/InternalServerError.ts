import { HttpServiceError } from './HttpServiceError';

/**
 * 500 — the catch-all server fault.
 */
class InternalServerError extends HttpServiceError<'internalServerError'> {
  constructor(message?: string, options?: { cause?: unknown }) {
    super('internalServerError', message, options);
  }
}

/**
 * The instance returned to callers when the real cause must not be disclosed:
 * same stable type, generic message, regardless of what failed.
 */
const DefaultInternalServerError = new InternalServerError();

export { InternalServerError, DefaultInternalServerError };
