import { HttpServiceError } from './HttpServiceError.ts';

/**
 * 429 — the caller exceeded its rate budget. Retrying is not just futile but
 * punished; honor `retryAfter`-style backoff at the caller.
 */
class RateLimitedError extends HttpServiceError<'RateLimited'> {
  constructor(message?: string) {
    super('RateLimited', message);
  }
}

export { RateLimitedError };
