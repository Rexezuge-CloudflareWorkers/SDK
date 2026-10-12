import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 412 — a precondition the caller supplied (e.g. `If-Match`, expected state)
 * did not hold. Retrying unmodified fails by definition.
 */
class PreconditionFailedError extends HttpServiceError<'PreconditionFailed'> {
  constructor(message?: string) {
    super('PreconditionFailed', message);
  }
}

export { PreconditionFailedError };
