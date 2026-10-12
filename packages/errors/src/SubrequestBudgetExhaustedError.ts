import { PayloadTooLargeError } from './PayloadTooLargeError.ts';

/**
 * 413 for invocations that asked for more work than one Worker invocation can issue.
 *
 * Converged from Edge-Sonic's `SubrequestBudgetExhaustedError`: a scan's index
 * write is resumable (the folder stays on the frontier, so a truncated batch is
 * reported rather than raised), but a play queue is all-or-nothing — half a
 * queue is a shorter queue, which is a wrong answer rather than an unfinished
 * one. Those writes refuse to start rather than starting and stopping.
 *
 * Shares `PayloadTooLarge`'s status (the request is well-formed; only its size
 * exceeds what this plan serves in one invocation) with a distinct `type`,
 * following the `DatabaseError` precedent: the catalog keeps one row per
 * status, and the specialization overrides `type` rather than adding a second
 * 413 row that would break the catalog's unique-status invariant. The remedy is
 * the same shape as `PayloadTooLargeError` — ask for less in one request.
 */
class SubrequestBudgetExhaustedError extends PayloadTooLargeError {
  constructor(message?: string) {
    super(message ?? 'This request asks for more database work than one invocation can issue. Send fewer items at once.');
    this.type = 'SubrequestBudgetExhausted';
  }
}

export { SubrequestBudgetExhaustedError };
