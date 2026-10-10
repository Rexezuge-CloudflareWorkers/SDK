import { DatabaseError } from '@rexezuge/errors';
import { D1_RETRY_DEFAULTS, executeWithRetry } from './D1Retry';
import type { D1PreparedStatement, D1Queryable, D1Result } from './D1Types';

/**
 * A statement result plus the payload it produced, so the retry engine (which
 * inspects `success`) also handles wrapped results like batch arrays.
 */
interface StatementEnvelope<T> extends D1Result {
  value: T;
}

/**
 * Canonical DAO base: retry is a policy, methods are a promise.
 *
 * Converged from the nine consumer repos' `BaseDAO`s, which had drifted into
 * seven spellings of the same idea (`withRetry`, `runWithRetry`,
 * `runWriteStatement`, `firstWithRetry`, `allWithRetry`, `runWriteBatch`, plus
 * Mail-Meow's static `findById`). The kit ships one straight-line surface —
 * **clients adapt to these names** — with the non-DAO concerns extracted:
 *
 * - cursor pagination moved to `@rexezuge/shared`'s `CursorCodec` (it is a
 *   codec, not a DAO method);
 * - subrequest accounting became an injected concern, so the seven repos that
 *   never needed it do not inherit it;
 * - retry policy lives in `D1Retry` — one schedule, one classifier, one place
 *   the `Failed to <context>` prefix is added.
 *
 * Identifier safety: `table`/`column` names cannot be bound, so the two methods
 * that interpolate them (`deleteOlderThan`) allow-list each segment against
 * `/^[A-Za-z_][A-Za-z0-9_]*$/`. Everything else in a statement goes through
 * `.bind()`.
 */
abstract class BaseDAO {
  protected constructor(protected readonly database: D1Queryable) {}

  /**
   * A mutating statement with retry and a guaranteed `DatabaseError` on
   * failure. Every write in this layer goes through here: hand-rolling
   * `.run()` plus `if (!result.success) throw` silently produced
   * `retryable: false` and skipped the retry entirely — which left the most
   * failure-sensitive writes with no recovery from a transient D1 lock.
   */
  protected async run(statement: () => Promise<D1Result>, context: string): Promise<D1Result> {
    return executeWithRetry(statement, context);
  }

  /**
   * A point read. `first()` resolving to `null` is "no row", a success, not an
   * error — only a rejected statement is retried and normalized.
   */
  protected async first<T>(statement: () => Promise<T | null>, context: string): Promise<T | null> {
    const envelope: StatementEnvelope<T | null> = await executeWithRetry(async (): Promise<StatementEnvelope<T | null>> => {
      const value: T | null = await statement();
      return { success: true, value };
    }, context);
    return envelope.value;
  }

  /**
   * A list read. `.all()` returning `[]` is a success like `first()`'s `null`.
   * Separate from `run` because that one is typed for a write's `D1Result`;
   * a list read had no retry at all in the drifted copies.
   */
  protected async all<T>(statement: () => Promise<{ results?: T[] }>, context: string): Promise<T[]> {
    const envelope: StatementEnvelope<T[]> = await executeWithRetry(async (): Promise<StatementEnvelope<T[]>> => {
      const rows = await statement();
      return { success: true, value: rows.results ?? [] };
    }, context);
    return envelope.value;
  }

  /** A scalar count from a `SELECT count(*) AS count` row; 0 when absent. */
  protected async count(
    statement: () => Promise<{ count: number } | null>,
    context: string,
  ): Promise<number> {
    const row: { count: number } | null = await this.first(statement, context);
    return row?.count ?? 0;
  }

  /**
   * A batch of prepared statements, retried as a unit and unwrapped to the
   * per-statement results D1 returns. A single non-success result inside the
   * batch is what the engine classifies and retries.
   */
  protected async batch(statements: D1PreparedStatement[], context: string): Promise<D1Result[]> {
    if (this.database.batch === undefined) {
      throw new DatabaseError(`Batch is not supported for ${context}: the D1 binding exposes no batch()`);
    }
    const envelope: StatementEnvelope<D1Result[]> = await executeWithRetry(async (): Promise<StatementEnvelope<D1Result[]>> => {
      const results: D1Result[] = await (this.database.batch as NonNullable<D1Queryable['batch']>)(statements);
      const failed: D1Result | undefined = results.find((result): boolean => !result.success);
      return {
        success: failed === undefined,
        error: failed?.error,
        value: results,
      };
    }, context);
    return envelope.value;
  }

  /**
   * Generic batched delete of rows older than a cutoff, in ID order, with
   * retry. Mirrors the per-DAO `DELETE ... WHERE id IN (SELECT ... LIMIT ?)`
   * pattern that every repo re-implemented per table.
   *
   * `timeColumn` is compared against `<` — the cutoff is exclusive, so a
   * delete never touches a row at exactly the boundary timestamp.
   */
  protected static async deleteOlderThan(
    db: D1Queryable,
    table: string,
    timeColumn: string,
    cutoff: number | string,
    limit: number,
    idColumn: string,
  ): Promise<number> {
    assertSqlIdentifier(table, 'table');
    assertSqlIdentifier(timeColumn, 'timeColumn');
    assertSqlIdentifier(idColumn, 'idColumn');
    const result: D1Result = await executeWithRetry(
      (): Promise<D1Result> =>
        db
          .prepare(
            `DELETE FROM ${table}
             WHERE ${idColumn} IN (
               SELECT ${idColumn} FROM ${table}
               WHERE ${timeColumn} < ?
               LIMIT ?
             )`,
          )
          .bind(cutoff, limit)
          .run(),
      `delete old rows from ${table}`,
    );
    return (result.meta as { changes?: number })?.changes ?? 0;
  }

  /** The retry schedule, for callers that surface it (health checks, tests). */
  protected static get retryDefaults(): typeof D1_RETRY_DEFAULTS {
    return D1_RETRY_DEFAULTS;
  }
}

/**
 * Allow-list one SQL identifier segment. Values never go through this — they
 * are always bound; this exists purely for the table/column names that
 * parameter binding cannot express.
 */
function assertSqlIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier for ${label}: ${JSON.stringify(value)}`);
  }
}

export { BaseDAO, assertSqlIdentifier };
