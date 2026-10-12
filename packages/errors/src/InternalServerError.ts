import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 500 — the catch-all server fault.
 */
class InternalServerError extends HttpServiceError<'InternalServerError'> {
  constructor(message?: string, options?: { cause?: unknown }) {
    super('InternalServerError', message, options);
  }
}

/**
 * The instance returned to callers when the real cause must not be disclosed:
 * same stable type, generic message, regardless of what failed.
 */
const DefaultInternalServerError = new InternalServerError();

export { InternalServerError, DefaultInternalServerError };
