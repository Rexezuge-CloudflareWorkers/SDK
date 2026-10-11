import { HttpServiceError } from './HttpServiceError';

/**
 * 503 — unavailable now, healthy later. The natural status for retryable
 * infrastructure failures (a locked D1, an overloaded upstream).
 */
class ServiceUnavailableError extends HttpServiceError<'ServiceUnavailable'> {
  constructor(message?: string) {
    super('ServiceUnavailable', message);
  }
}

export { ServiceUnavailableError };
