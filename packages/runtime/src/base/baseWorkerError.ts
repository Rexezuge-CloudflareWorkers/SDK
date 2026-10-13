/**
 * The error-reporting seam shared by every worker base.
 *
 * Each base catches an unhandled rejection, reports it, and (for the
 * request-shaped ones) answers 500. What it must *not* do is decide what the
 * caught value is safe to write, because that is not the base's knowledge: the
 * base cannot know whether the value transitively carries a credential, and
 * every consumer's token-adjacent boundaries redact differently.
 *
 * So the base owns the message and the consumer owns the sink. `message` is
 * always one of the literals in `BASE_WORKER_MESSAGES` — never an interpolated
 * value — so an override can forward it without itself becoming a place where
 * untrusted text reaches a log line.
 */

/**
 * Every boundary that reports an unhandled rejection.
 *
 * A member per base rather than a free-form string, because the message table
 * is keyed on it: a base that grows a new entry point cannot pick a message the
 * table does not have.
 */
type BaseWorkerOperation = 'fetch' | 'scheduled' | 'queue' | 'workflow' | 'durableObjectFetch';

/**
 * Operator-facing text per boundary, in the shape a log line wants: a constant
 * prefix, with the caught value following it.
 *
 * Static by construction. A base interpolating anything into these is the exact
 * pattern consumer codebases are told to avoid, and it would be the kit
 * introducing it.
 */
const BASE_WORKER_MESSAGES: Readonly<Record<BaseWorkerOperation, string>> = {
  fetch: 'Unhandled error in fetch():',
  scheduled: 'Unhandled error in scheduled():',
  queue: 'Unhandled error in queue():',
  workflow: 'Unhandled error in workflow run():',
  durableObjectFetch: 'Unhandled error in durable object fetch():',
};

export { BASE_WORKER_MESSAGES };
export type { BaseWorkerOperation };
