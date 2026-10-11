import { HttpServiceError } from './HttpServiceError';

/**
 * 403 — the caller is authenticated but the action is not theirs to take.
 */
class ForbiddenError extends HttpServiceError<'Forbidden'> {
  constructor(message?: string) {
    super('Forbidden', message);
  }
}

export { ForbiddenError };
