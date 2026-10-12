import { ServiceError } from './ServiceError.ts';
import type { ServiceErrorOptions } from './ServiceError.ts';

/**
 * An error whose retryability is decided by the thrower, not deduced.
 *
 * Durable-DAV's `D1ErrorClassifier` can classify a raw D1 message, but a
 * provider-level failure (OAuth2 grant revoked, upstream API rejecting a
 * payload) carries no such signal — only the code that made the call knows.
 * This taxonomy lets that code say so explicitly, and the status defaults
 * follow the retry flag rather than a name-lookup table that could disagree.
 */
class OutcomeError extends ServiceError {
  constructor(message: string, options: ServiceErrorOptions & { retryable: boolean }) {
    super(options.retryable ? 502 : 400, new.target.name, message, options);
  }
}

/**
 * Transient upstream failure: a later attempt may succeed (throttling, 5xx
 * from the provider, token refresh race). Status 502 by default.
 */
class RetryableError extends OutcomeError {
  constructor(message: string, status?: number) {
    super(message, { retryable: true, ...(status !== undefined && { expose: status < 500 }) });
    if (status !== undefined) {
      this.status = status;
    }
  }
}

/**
 * Permanent failure: retrying repeats the failure forever. A revoked grant
 * retried every ten minutes told the caller the request was a server fault;
 * this class exists so that never reads as retryable again. Status 400.
 */
class NonRetryableError extends OutcomeError {
  constructor(message: string, status?: number) {
    super(message, { retryable: false, ...(status !== undefined && { expose: status < 500 }) });
    if (status !== undefined) {
      this.status = status;
    }
  }
}

class ProviderApiRetryableError extends RetryableError {}
class ProviderApiNonRetryableError extends NonRetryableError {}
class OAuth2TokenRetryableError extends RetryableError {}
class OAuth2TokenNonRetryableError extends NonRetryableError {}

export {
  NonRetryableError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  OutcomeError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
};
