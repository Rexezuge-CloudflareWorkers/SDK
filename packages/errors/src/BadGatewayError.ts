import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 502 — an upstream dependency answered invalidly. Pair with `retryable: true`
 * when the upstream is known to recover on its own.
 */
class BadGatewayError extends HttpServiceError<'BadGateway'> {
  constructor(message?: string) {
    super('BadGateway', message);
  }
}

export { BadGatewayError };
