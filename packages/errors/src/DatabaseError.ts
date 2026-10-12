import { InternalServerError } from './InternalServerError.ts';

/**
 * 500 for data-layer failures.
 *
 * Carries `retryable` because the difference between a transient D1 lock and a
 * constraint violation is invisible in the message — the caller's retry
 * decision (the DAO's) is encoded here as a flag instead of re-parsed at every
 * boundary.
 */
class DatabaseError extends InternalServerError {
  constructor(message?: string, retryable: boolean = false, options?: { cause?: unknown }) {
    super(message ?? 'The system encountered an unexpected problem while accessing the database.', options);
    this.retryable = retryable;
    this.type = 'DatabaseError';
  }
}

export { DatabaseError };
