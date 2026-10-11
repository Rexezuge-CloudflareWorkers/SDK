import { HttpServiceError } from './HttpServiceError';

/**
 * 401 — credentials missing, expired, or rejected. Distinct from `Forbidden`:
 * re-authenticating may help; `Forbidden` it will not.
 */
class UnauthorizedError extends HttpServiceError<'Unauthorized'> {
  constructor(message?: string) {
    super('Unauthorized', message);
  }
}

export { UnauthorizedError };
