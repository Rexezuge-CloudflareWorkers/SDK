import { HttpServiceError } from './HttpServiceError';

/**
 * 409 — well-formed but the resource state forbids it: a taken email, a
 * duplicate name, a stale precondition. Not retryable without a change.
 */
class ConflictError extends HttpServiceError<'conflict'> {
  constructor(message?: string) {
    super('conflict', message);
  }
}

export { ConflictError };
