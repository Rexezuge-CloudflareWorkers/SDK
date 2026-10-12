import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 400 — malformed or missing input. Retrying without a change always fails.
 */
class BadRequestError extends HttpServiceError<'BadRequest'> {
  constructor(message?: string) {
    super('BadRequest', message);
  }
}

export { BadRequestError };
