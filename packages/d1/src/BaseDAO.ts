import { UNMETERED_SUBREQUESTS } from '@rexezuge/shared';
import type { SubrequestMeter } from '@rexezuge/shared';
import { SubrequestBudgetExhaustedError } from '@rexezuge/errors';
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
 * A prepared statement with the SQL that produced it.
 *
 * The platform's `D1PreparedStatement` carries no `sql` member, so a layer that
 * needs to know *what* it is about to run — to account for a write, to assert a
 * table's billing multiplier, to log a rejected statement in terms a reader can
 * act on — has nowhere to read it from. Carrying it beside the statement is
 * that place, and `bind()` returns a new pair for the same reason the platform's
 * does: bindings are immutable on a prepared statement.
 */
interface TrackedStatement {
  sql: string;
  statement: D1PreparedStatement;
  bind(...bindings: unknown[]): TrackedStatement;
}

/**
 * How many rows a write to `table` costs.
 *
 * A **port, not an implementation**, because the answer is a property of the
 * schema rather than of this layer: D1 bills a write as the table row *plus
 * every index entry it rewrote*, so the multiplier belongs to whoever owns the
 * migrations. This package owns the accounting *shape* — carrying the figure
 * beside `changes` on every write result — and the consumer supplies the table.
 *
 * Returning `null` means "I do not know this table", which is a different answer
 * from "this costs one row" and must not collapse into it: an unknown table
 * errs toward the worst case, because an under-count costs the outage.
 */
type BilledRowsForTable = (table: string, logicalRows: number) => number | null;

/**
 * What a write cost, and what it changed.
 *
 * `changes` is progress — how many table rows the statement touched — and
 * `billedRows` is cost. They are not the same number and neither replaces the
 * other: `changes` is what a convergence test measures, `billedRows` is what a
 * daily-allowance budget must be spent against. A caller that reads only
 * `changes` believes it has roughly an order of magnitude more headroom than it
 * does on an indexed table.
 *
 * `billedRows` is `null` — absent, not zero — when no {@link BilledRowsForTable}
 * port is configured, so the type forces the caller to notice that nothing is
 * being accounted rather than reporting a confident `0`.
 */
interface WriteResult {
  changes: number;
  billedRows: number | null;
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
 * ### Every statement is charged
 *
 * D1 counts its own queries against the Workers per-invocation subrequest
 * ceiling, so a statement that spends one without telling anybody makes every
 * number that budgets work wrong — and it has **no symptom** until the platform
 * terminates the invocation, by which point the rows were right and the suite
 * was green. The meter is therefore a constructor dependency rather than a
 * module singleton, and the charge happens here because this is the one path
 * every statement takes; a charge at each call site is a hundred chances to
 * forget one.
 *
 * The charge is **per logical statement, not per attempt**: a retried statement
 * is one statement that the platform refused once and then answered. Charging
 * per attempt would make the ceiling track the fault rate instead of the work.
 *
 * Non-DAO concerns stay out: cursor pagination lives in `@rexezuge/shared`
 * (`CursorCodec`). Retry policy lives in `D1Retry` — one schedule, one
 * classifier, one place the `Failed to <context>` prefix is added.
 */
abstract class BaseDAO {
  /**
   * @param database The binding.
   * @param meter The invocation's subrequest counter, or an unmetered default.
   * @param options `billedRowsForTable` supplies the schema's write cost.
   */
  protected constructor(
    protected readonly database: D1Queryable,
    protected readonly meter: SubrequestMeter = UNMETERED_SUBREQUESTS,
    private readonly options: { billedRowsForTable?: BilledRowsForTable } = {},
  ) {}

  /**
   * The invocation's meter, for a DAO that constructs another DAO.
   *
   * A `protected get` rather than a public field, because handing the meter out
   * is how a DAO builds a collaborator correctly: `new SongIdLookupDAO(this.database)`
   * drops it, and the charge that goes missing has no symptom.
   */
  protected get subrequests(): SubrequestMeter {
    return this.meter;
  }

  /**
  A prepared statement with its bindings applied. Bindings are always parameters, never interpolation.
  */
  protected statement(sql: string, bindings: unknown[] = []): D1PreparedStatement {
    return bindings.length > 0 ? this.database.prepare(sql).bind(...bindings) : this.database.prepare(sql);
  }

  /**
   * The same statement, carrying the SQL beside it.
   *
   * Use this wherever the SQL matters downstream — a write whose cost is
   * accounted, a statement named in an error — and {@link statement} for reads,
   * where nothing reads the SQL back and the pair is one allocation of waste.
   */
  protected tracked(sql: string, bindings: unknown[] = []): TrackedStatement {
    const make = (prepared: D1PreparedStatement): TrackedStatement => ({
      sql,
      statement: prepared,
      bind: (...next: unknown[]): TrackedStatement => make(prepared.bind(...next)),
    });
    return make(this.statement(sql, bindings));
  }

  /**
   * Run a statement. D1 reports a constraint violation or a missing table by
   * returning `success: false` rather than by throwing, so both forms are
   * normalized to a `DatabaseError` here — ignoring the result form is what
   * let a `UNIQUE` failure reach a caller as an opaque 500.
   */
  protected async run(sql: string, bindings: unknown[] = []): Promise<D1Result> {
    this.meter.charge(1, 'd1');
    return executeWithRetry((): Promise<D1Result> => this.statement(sql, bindings).run(), 'run statement');
  }

  /**
  Read one row. A `null` result is "no row", a success, not an error; only a
  rejected statement is retried and normalized.

  `null` rather than `undefined` because that is what the platform says
  (`D1Result.first<T>()` returns `T | null`) and an adapter should hand back
  what it was given. It also makes this layer agree with `KvCache`, which has
  always returned `null` for a miss, so one convention covers both.
   */
  protected async first<T>(sql: string, bindings: unknown[] = []): Promise<T | null> {
    this.meter.charge(1, 'd1');
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
    this.meter.charge(1, 'd1');
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
    this.meter.charge(1, 'd1');
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
   * Run one write and report what it cost.
   *
   * Takes a {@link TrackedStatement} rather than SQL because the cost is read off
   * the table the SQL names, and the SQL is only available if it was carried.
   * `billedRows` is `null` when no port is configured.
   */
  protected async runTracked(tracked: TrackedStatement): Promise<WriteResult> {
    const result = await executeWithRetry((): Promise<D1Result> => tracked.statement.run(), 'run a write');
    return this.accountWrite(tracked.sql, result);
  }

  /**
   * Run a batch of writes and report what the whole batch cost.
   *
   * Billed rows are **summed across the batch**, and an unaccountable statement
   * poisons the total to `null` rather than being skipped: a partial figure next
   * to a real one is the one that reads as complete.
   */
  protected async runTrackedBatch(tracked: readonly TrackedStatement[]): Promise<WriteResult> {
    const results = await this.batch(tracked.map((entry) => entry.statement));
    let billedRows = 0;
    let accounted = this.options.billedRowsForTable !== undefined;
    for (const [index, result] of results.entries()) {
      const entry = tracked[index];
      if (!entry) {
        accounted = false;
        break;
      }
      const one = this.accountWrite(entry.sql, result);
      if (one.billedRows === null) {
        accounted = false;
        break;
      }
      billedRows += one.billedRows;
    }
    const changes = results.reduce((total, result) => total + changesOf(result), 0);
    return { changes, billedRows: accounted ? billedRows : null };
  }

  /**
   * The writes these statements fit into the invocation's remaining budget.
   *
   * "How many may I issue", as distinct from {@link assertSubrequestBudget}'s
   * "may I issue all of these" — a caller truncating a work list needs the
   * number, and a caller that must not truncate needs the refusal. An unmetered
   * counter answers `Infinity`, so a deployment that does not meter is never
   * clamped by a budget it does not have.
   */
  protected fitToSubrequestBudget(requested: number): number {
    const remaining = this.meter.remaining;
    return Number.isFinite(remaining) ? Math.max(0, Math.min(requested, Math.floor(remaining))) : Math.max(0, requested);
  }

  /**
   * Refuse a set of statements the invocation's remaining budget cannot carry.
   *
   * For a write with no partial form — a play queue, a playlist's count, a
   * backfill — because half a queue is a _shorter_ queue, which is a wrong
   * answer rather than an unfinished one. A caller that may truncate uses
   * {@link fitToSubrequestBudget} instead and reports that it did.
   *
   * @param statements How many statements the work needs.
   * @param context Named in the refusal, because this reaches a client as a 413.
   */
  protected assertSubrequestBudget(statements: number, context = 'this request'): void {
    if (this.meter.canAfford(statements)) return;
    throw new SubrequestBudgetExhaustedError(
      `${context} needs ${statements} database operations and this invocation has ${this.meter.remaining} left. Send fewer items at once.`,
    );
  }

  /**
   * Charge the meter and account a completed write against the schema's cost.
   */
  private accountWrite(sql: string, result: D1Result): WriteResult {
    const changes = changesOf(result);
    const port = this.options.billedRowsForTable;
    if (!port) return { changes, billedRows: null };
    return { changes, billedRows: port(statementTable(sql) ?? '', changes) };
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

function changesOf(result: D1Result): number {
  return (result.meta as { changes?: number })?.changes ?? 0;
}

/**
 * The write verb's table name, or `null` when the SQL does not name one.
 *
 * The verb is anchored at the **start** of the statement, after leading
 * whitespace and comments — a bare `/\bINSERT\s+INTO\s+(\w+)/` also matches a
 * verb quoted inside a string literal, and a table read out of a `SELECT`'s
 * projection is worse than no answer at all. An unreadable statement returns
 * `null` for the caller to charge the worst case against, rather than throwing:
 * accounting must not be the thing that turns a failed write into a crashed
 * request.
 */
function statementTable(sql: string): string | null {
  if (typeof sql !== 'string') return null;
  let rest = sql.replace(/^\s+/, '');
  // A `while` rather than a repeated strip: comments are the only noise, and a
  // bounded loop cannot be made quadratic by a statement full of them.
  while (rest.startsWith('--')) {
    const newline = rest.indexOf('\n');
    if (newline === -1) return null;
    rest = rest.slice(newline + 1).replace(/^\s+/, '');
  }
  const verb = /^(?:INSERT|REPLACE|UPDATE|DELETE)\b/i.exec(rest);
  if (!verb) return null;
  rest = consume(rest.slice(verb[0].length));

  // `INSERT OR REPLACE`, `UPDATE OR IGNORE` — a conflict clause between the verb and
  // the table. This is why the parse is stepwise rather than one anchored pattern:
  // a single pattern either grows a nested quantifier the complexity gate rejects,
  // or drops the clause and reads `REPLACE` as a table name.
  rest = consume(rest, /^(?:OR\s+[A-Z_]+\s+)?/i);
  rest = consume(rest, /^(?:INTO\s+|FROM\s+)?/i);
  return /^["`[]?([A-Z_]\w*)/i.exec(rest)?.[1] ?? null;
}

/**
 * Drop a leading match and the whitespace after it.
 */
function consume(sql: string, pattern?: RegExp): string {
  const matched = pattern?.exec(sql)?.[0] ?? '';
  return sql.slice(matched.length).replace(/^\s+/, '');
}

export { BaseDAO, assertSqlIdentifier, statementTable };
export type { BilledRowsForTable, TrackedStatement, WriteResult };
