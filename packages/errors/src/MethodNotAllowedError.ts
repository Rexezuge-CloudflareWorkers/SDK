import { HttpServiceError } from './HttpServiceError';

/**
 * 405 — the method exists but not on this path.
 */
class MethodNotAllowedError extends HttpServiceError<'methodNotAllowed'> {
  constructor(message?: string) {
    super('methodNotAllowed', message);
  }
}

export { MethodNotAllowedError };
