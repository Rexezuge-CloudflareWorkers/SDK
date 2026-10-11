import { HttpServiceError } from './HttpServiceError';

/**
 * 501 — the functionality exists in the protocol but not on this deployment.
 */
class NotImplementedError extends HttpServiceError<'NotImplemented'> {
  constructor(message?: string) {
    super('NotImplemented', message);
  }
}

export { NotImplementedError };
