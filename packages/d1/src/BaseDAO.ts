import { DatabaseError } from '@rexezuge/errors';
import { D1_RETRY_DEFAULTS, executeWithRetry } from './D1Retry.ts';
import type { D1PreparedStatement, D1Queryable, D1Result } from './D1Types.ts';

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
 * Converged from the nine consumer repos' BaseDAOs. The API is the **sql-first**
 * shape CalDAV-Bridge and ChordDHT-Tracker used, not the closure-first shape
 * Durable-DAV's family used: a DAO states its SQL and bindings directly, and
 * the retry/normalization wrapper is invisible at the call site. The closure
 * form made every read site pay for a wrapper 90% of them never needed, and
 * each of the two shapes drifted its own method names (`withRetry` vs
 * `run(sql, bindings)`); the sql-first form is what survived.
 *
 * Non-DAO concerns stay out: cursor pagination lives in `@rexezuge/shared`
 * (`CursorCodec`), subrequest accounting is an injectable port. Retry policy
 * lives in `D1Retry` — one schedule, one classifier, one place the
 * `Failed to <context>` prefix is added.
 */
abstract class BaseDAO {
  protected constructor(protected readonly database: D1Queryable) {}

  /**
  A prepared statement with its bindings applied. Bindings are always parameters, never interpolation.
  */
  protected statement(sql: string, bindings: unknown[] = []): D1PreparedStatement {
    return bindings.length > 0 ? this.database.prepare(sql).bind(...bindings) : this.database.prepare(sql);
  }

  /**
   * Run a statement. D1 reports a constraint violation or a missing table by
   * returning `success: false` rather than by throwing, so both forms are
   * normalized to a `DatabaseError` here — ignoring the result form is what
   * let a `UNIQUE` failure reach a caller as an opaque 500.
   */
  protected async run(sql: string, bindings: unknown[] = []): Promise<D1Result> {
    return executeWithRetry((): Promise<D1Result> => this.statement(sql, bindings).run(), 'run statement');
  }

  /**
   * Read one row. A `null` result is "no row", a success, not an error; only a
   * rejected statement is retried and normalized.
   *
   * `null` rather than `undefined` because that is what the platform says
   * (`D1Result.first<T>()` returns `T | null`) and an adapter should hand back
   * what it was given. It also makes this layer agree with `KvCache`, which has
   * always returned `null` for a miss, so one convention covers both.
   */
  protected async first<T>(sql: string, bindings: unknown[] = []): Promise<T | null> {
    const envelope = await executeWithRetry(async (): Promise<StatementEnvelope<T | null>> => {
      const row: T | null = await this.statement(sql, bindings).first<T>();
      return { success: true, value: row };
    }, 'read a row');
    return envelope.value;
  }

  /**
  A list read. `.all()` returning `[]` is a success like `first()`'s null.
  */
  protected async all<T>(sql: string, bindings: unknown[] = []): Promise<T[]> {
    const envelope = await executeWithRetry(async (): Promise<StatementEnvelope<T[]>> => {
      const rows = await this.statement(sql, bindings).all<T>();
      return { success: true, value: rows.results ?? [] };
    }, 'read rows');
    return envelope.value;
  }

  /**
  A scalar count from a `SELECT count(*)` row; 0 when absent.
  */
  protected async count(sql: string, bindings: unknown[] = []): Promise<number> {
    const row = await this.first<{ count: number }>(sql, bindings);
    return row?.count ?? 0;
  }

  /**
   * A batch of prepared statements — one transaction and one subrequest,
   * however many statements it carries. Each result is checked, so a single
   * failure inside the batch raises rather than passing silently.
   */
  protected async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (statements.length === 0) return [];
    if (this.database.batch === undefined) {
      throw new DatabaseError('The D1 binding exposes no batch() — a multi-statement transaction is not available here');
    }
    const envelope = await executeWithRetry(async (): Promise<StatementEnvelope<D1Result[]>> => {
      const results: D1Result[] = await (this.database.batch as NonNullable<D1Queryable['batch']>)(statements);
      const failed: D1Result | undefined = results.find((result): boolean => !result.success);
      return { success: failed === undefined, error: failed?.error, value: results };
    }, 'run a batch');
    return envelope.value;
  }

  /**
   * Generic batched delete of rows older than a cutoff, in ID order, with
   * retry. Mirrors the per-DAO `DELETE ... WHERE id IN (SELECT ... LIMIT ?)`
   * pattern that every repo re-implemented per table. The cutoff is exclusive:
   * a delete never touches a row at exactly the boundary timestamp.
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

  /**
  The retry schedule, for callers that surface it (health checks, tests).
  */
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
  if (!/^[A-Z_]\w*$/i.test(value)) {
    throw new Error(`Unsafe SQL identifier for ${label}: ${JSON.stringify(value)}`);
  }
}

export { BaseDAO, assertSqlIdentifier };
