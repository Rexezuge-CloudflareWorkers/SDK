import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 413 — the payload exceeds the server's limits (request body, file, batch).
 */
class PayloadTooLargeError extends HttpServiceError<'PayloadTooLarge'> {
  constructor(message?: string) {
    super('PayloadTooLarge', message);
  }
}

export { PayloadTooLargeError };
