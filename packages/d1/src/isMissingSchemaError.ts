/**
 * Distinguishes "the table or column isn't there" from every other way a SQL
 * statement can fail.
 *
 * Provenance: `shared/src/utils/SqlSchemaError.ts` in Durable-DAV (re-exported
 * from `backend-data`), Byte-comparable copies in Edge-Git, Edge-Sonic and
 * ChordDHT-Tracker. Durable-DAV's own note is the canonical home decision: both
 * SQL surfaces the family uses (D1 and DO SQLite) report a missing relation the
 * same way, so the predicate lives below the layers that degrade on it —
 * in this kit, that layer is `d1`.
 *
 * The rule it exists to enforce is fail-closed: a caller may degrade to `[]` or
 * a fallback query **only** on `true` here, and must rethrow everything else.
 * Catching broadly is how "this resource has no dead properties" comes to mean
 * "the database is corrupt" — a silent data-loss report, which is worse than an
 * error.
 */
const MISSING_SCHEMA_PATTERN = /no\s+such\s+(?:table|column|index)/i;

function isMissingSchemaError(error: unknown): boolean {
  if (error instanceof Error) return MISSING_SCHEMA_PATTERN.test(error.message);
  // A thrown string is legal; anything else (a number, an object, `undefined`)
  // carries no message to match against.
  return typeof error === 'string' && MISSING_SCHEMA_PATTERN.test(error);
}

export { isMissingSchemaError, MISSING_SCHEMA_PATTERN };
