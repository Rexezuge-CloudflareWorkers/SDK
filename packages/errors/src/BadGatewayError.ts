import { HttpServiceError } from './HttpServiceError';

/**
 * 502 — an upstream dependency answered invalidly. Pair with `retryable: true`
 * when the upstream is known to recover on its own.
 */
class BadGatewayError extends HttpServiceError<'badGateway'> {
  constructor(message?: string) {
    super('badGateway', message);
  }
}

export { BadGatewayError };
