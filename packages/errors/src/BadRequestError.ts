import { HttpServiceError } from './HttpServiceError';

/**
 * 400 — malformed or missing input. Retrying without a change always fails.
 */
class BadRequestError extends HttpServiceError<'badRequest'> {
  constructor(message?: string) {
    super('badRequest', message);
  }
}

export { BadRequestError };
