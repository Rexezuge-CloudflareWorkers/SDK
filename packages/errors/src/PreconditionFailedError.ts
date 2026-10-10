import { HttpServiceError } from './HttpServiceError';

/**
 * 412 — a precondition the caller supplied (e.g. `If-Match`, expected state)
 * did not hold. Retrying unmodified fails by definition.
 */
class PreconditionFailedError extends HttpServiceError<'preconditionFailed'> {
  constructor(message?: string) {
    super('preconditionFailed', message);
  }
}

export { PreconditionFailedError };
