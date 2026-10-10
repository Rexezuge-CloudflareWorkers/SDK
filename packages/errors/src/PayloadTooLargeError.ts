import { HttpServiceError } from './HttpServiceError';

/**
 * 413 — the payload exceeds the server's limits (request body, file, batch).
 */
class PayloadTooLargeError extends HttpServiceError<'payloadTooLarge'> {
  constructor(message?: string) {
    super('payloadTooLarge', message);
  }
}

export { PayloadTooLargeError };
