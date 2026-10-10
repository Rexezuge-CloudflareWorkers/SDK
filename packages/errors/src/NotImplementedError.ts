import { HttpServiceError } from './HttpServiceError';

/**
 * 501 — the functionality exists in the protocol but not on this deployment.
 */
class NotImplementedError extends HttpServiceError<'notImplemented'> {
  constructor(message?: string) {
    super('notImplemented', message);
  }
}

export { NotImplementedError };
