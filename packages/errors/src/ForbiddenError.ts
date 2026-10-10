import { HttpServiceError } from './HttpServiceError';

/**
 * 403 — the caller is authenticated but the action is not theirs to take.
 */
class ForbiddenError extends HttpServiceError<'forbidden'> {
  constructor(message?: string) {
    super('forbidden', message);
  }
}

export { ForbiddenError };
