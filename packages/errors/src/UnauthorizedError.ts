import { HttpServiceError } from './HttpServiceError';

/**
 * 401 — credentials missing, expired, or rejected. Distinct from `Forbidden`:
 * re-authenticating may help; `Forbidden` it will not.
 */
class UnauthorizedError extends HttpServiceError<'unauthorized'> {
  constructor(message?: string) {
    super('unauthorized', message);
  }
}

export { UnauthorizedError };
