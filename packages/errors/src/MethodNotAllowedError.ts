import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 405 — the method exists but not on this path.
 */
class MethodNotAllowedError extends HttpServiceError<'MethodNotAllowed'> {
  constructor(message?: string) {
    super('MethodNotAllowed', message);
  }
}

export { MethodNotAllowedError };
