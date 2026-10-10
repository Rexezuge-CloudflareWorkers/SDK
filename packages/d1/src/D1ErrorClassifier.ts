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

function isD1ErrorRetryable(errorMessage: string): boolean {
  if (!errorMessage) return false;

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

export { isD1ErrorRetryable, RETRYABLE_PATTERNS, NON_RETRYABLE_PATTERNS };
