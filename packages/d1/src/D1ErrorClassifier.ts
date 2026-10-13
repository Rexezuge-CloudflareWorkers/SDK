/**
 * Classify a raw D1 (or DO SQLite) error message as transient or permanent.
 *
 * Converged verbatim from Durable-DAV (and ChordDHT's byte-identical copy,
 * modulo the import scope) — the most-documented variant in the family.
 */

/**
 * Patterns for a transient failure worth retrying.
 *
 * Checked **first**. A message matching both lists is treated as transient: one
 * wasted round trip against a real conflict is cheap, whereas mis-classifying a
 * blip as permanent turns a self-healing condition into a user-visible outage
 * that neither the DAO's retry nor the API's 503 mapping will cover.
 */
const RETRYABLE_PATTERNS: RegExp[] = [
  /busy/i,
  /locked/i,
  /timeout/i,
  /timed?\s*out/i,
  /internal\s+(server\s+)?error/i,
  /connection/i,
  /network/i,
  /unavailable/i,
  /throttl/i,
  /too\s+many/i,
  /retry/i,
  /deadlock/i,
  /serialization/i,
];

/**
 * Patterns for a failure that will not get better on its own.
 *
 * Every entry is deliberately **narrower than its obvious spelling**. This list
 * used to be consulted first and carried bare `/range/i` and `/not\s+found/i`,
 * both of which match transient conditions:
 *
 * - `/range/i` matched `RangeError: Maximum call stack size exceeded` and
 *   `byte range not satisfiable` — neither is a row-level conflict.
 * - `/not\s+found/i` matched `host not found`, i.e. a DNS blip, which
 *   `/connection/i` now correctly claims first.
 */
const NON_RETRYABLE_PATTERNS: RegExp[] = [
  /constraint/i,
  /\bunique\b/i,
  /primary\s+key/i,
  /foreign\s+key/i,
  /not\s+found/i,
  /\bsyntax\b/i,
  /parse\s+error/i,
  /no\s+such\s+(table|column|index)/i,
  /type\s+mismatch/i,
  // Was `/range/i`, which also matched a stack-overflow `RangeError` and
  // "byte range not satisfiable".
  /\bout\s+of\s+range\b/i,
  /invalid\s+argument/i,
  /\bpermission\b/i,
  /\bauthorization\b/i,
  /\bauthentication\b/i,
];

/**
 * A bind-ceiling refusal, checked **before** both lists.
 *
 * `/too\s+many/i` is in the retryable list, and retryable is consulted first by
 * design — so a row in the non-retryable list could never win this one. It has to
 * be its own pre-check for the same reason `DAILY_LIMIT_PATTERN` is: the defect
 * is a query shape, not a fault. `too many SQL variables` fails identically for
 * ever, and retrying it three times with backoff turns a one-line batching fix
 * into a multi-second stall on every page that hits it.
 */
const BIND_CEILING_PATTERN = /too\s+many\s+(?:SQL\s+)?(?:variables|bind\s+parameters|parameters)\b/i;

/**
 * Cloudflare's daily-allowance refusal, as it arrives.
 *
 * Matched on a substring rather than the whole sentence because the message
 * reaches this layer **inside a wrapper** — `executeWithRetry` throws
 * `Failed to <context>: <message>` — and a classifier that required the bare
 * sentence would answer "not a quota" for a quota.
 *
 * The two words that identify it are `exceeded` and `daily`, and both are
 * load-bearing. `too many` is deliberately **absent**, because a row that says
 * "too many SQL variables" is a defect a repo ships guards for, not a spent
 * allowance — treating that as a quota parks the work until midnight over a
 * query one batching change fixes.
 *
 * The apostrophe accepts `’` as well as `'`. A message that arrives with a
 * typographic apostrophe is still a spent allowance, and matching only the
 * straight one answers "transient, retry" for a refusal that cannot change for
 * hours — the failure this detector exists to prevent.
 */
const DAILY_LIMIT_PATTERN = /exceeded\s+D1['’]?s?\s+free\s+tier\s+daily\s+row\s+(read|write)\s+limit/i;

/**
 * Milliseconds in a day. Named so the UTC arithmetic below reads as what it is.
 */
const MS_PER_DAY = 86_400_000;

/**
 * Which daily allowance is spent, and when it comes back.
 *
 * `resetsAt` is epoch milliseconds and is always **strictly in the future** for
 * the clock it was computed from — including at exactly midnight, where the
 * naive subtraction yields a time that has already passed. That case is not a
 * rounding detail: a pause whose reset is in the past is a pause of zero length,
 * and a chunk that returns immediately is a chunk that re-runs its whole failure
 * path at the alarm's rate.
 */
interface D1DailyLimit {
  readonly kind: 'read' | 'write';
  readonly resetsAt: number;
}

/**
 * The next midnight UTC after `nowMs`, in epoch milliseconds.
 *
 * UTC and not local: the reset is UTC, so a local-time calculation is wrong
 * twice a day — once by the offset, and once because the two midnights disagree.
 */
function nextMidnightUtc(nowMs: number): number {
  const dayMs = nowMs - (nowMs % MS_PER_DAY);
  return dayMs + MS_PER_DAY;
}

/**
 * The spent daily allowance, or `null` for any other failure.
 *
 * `null` rather than `false` because the answer carries two facts, and a boolean
 * forces every caller to recompute the reset time — which is exactly the second
 * answer to one question, and the one that decides whether work resumes at
 * midnight or immediately and fails again.
 */
function isD1DailyLimitError(error: unknown, nowMs: number = Date.now()): D1DailyLimit | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = DAILY_LIMIT_PATTERN.exec(message);
  if (!match) return null;
  return { kind: match[1]?.toLowerCase() === 'read' ? 'read' : 'write', resetsAt: nextMidnightUtc(nowMs) };
}

function isD1ErrorRetryable(errorMessage: string): boolean {
  if (!errorMessage) return false;

  // A spent daily allowance is answered **before** both lists, and it is the one
  // reason this function is not the whole answer to "should this be tried
  // again". An account over its row-write limit is refused a message about
  // upgrading, and adding `/exceeded/` to `RETRYABLE_PATTERNS` would turn a
  // refusal that cannot change for hours into three attempts with backoff, per
  // statement, per chunk, per alarm.
  if (DAILY_LIMIT_PATTERN.test(errorMessage)) return false;

  // Same reasoning as the allowance above: `/too\s+many/i` sits in the retryable
  // list, so this has to be answered before that list is consulted rather than
  // inside the non-retryable one. A bind ceiling is a query-shape defect fixed by
  // batching, and no amount of waiting changes it.
  if (BIND_CEILING_PATTERN.test(errorMessage)) return false;

  // Retryable is checked first on purpose. An error can carry both a transient
  // signal and a permanent-sounding word — "connection: host not found",
  // "retry: authentication backend unavailable" — and retrying those is correct,
  // while a bare "row not found" or a UNIQUE/FOREIGN KEY violation still matches
  // nothing in the retryable list and is correctly refused. The ordering is
  // pinned by `hardening-round7.test.ts` in Durable-DAV; the kit carries the
  // equivalent expectations in d1.test.ts.
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return true;
  }

  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return false;
  }

  return false;
}

export {
  BIND_CEILING_PATTERN,
  DAILY_LIMIT_PATTERN,
  isD1DailyLimitError,
  isD1ErrorRetryable,
  nextMidnightUtc,
  RETRYABLE_PATTERNS,
  NON_RETRYABLE_PATTERNS,
};
export type { D1DailyLimit };
