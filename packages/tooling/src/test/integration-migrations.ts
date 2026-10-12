/**
 * Applying the migration directory to a D1 binding — as a factory.
 *
 * Provenance: converged from `test/integration/helpers/migrations.ts` in six repos
 * (AWS-AccessBridge, ChordDHT-Tracker, Durable-DAV, Durable-DAV-Router, Edge-Git,
 * Mail-Meow) and `test/helpers/migrations.ts` in two more (CalDAV-Bridge,
 * Edge-Sonic). All eight are the same file: a SQL splitter plus a range-addressed
 * `applyMigrations`.
 *
 * ### Why it is a factory and not a module
 *
 * Every source file hardcodes where the migrations live, either as a
 * `__INTEGRATION_MIGRATION_FILES__` binding injected by the Vitest config's
 * `define`, or as a path derived from `import.meta.url`. The kit cannot know
 * either, so the directory is an argument and the injection stays available as an
 * option. One call to `createMigrationHelper({ migrationsDir })` gives the consumer
 * the same helper their repo already has.
 *
 * ### What each source contributes
 *
 * - **Durable-DAV** — the trigger-aware splitter. `CREATE TRIGGER … BEGIN … END;`
 *   bodies contain semicolons that must not split, and a naive splitter produces
 *   statements SQLite rejects mid-migration. The BEGIN/END depth is tracked only
 *   outside strings and comments, and the word *before* `TRIGGER` disambiguates
 *   `CREATE TRIGGER` from a table called `trigger`. Durable-DAV also applies one
 *   file per `batch()` and names the offending statement in the error, which is
 *   the difference between "0007 failed" and a line number.
 * - **AWS-AccessBridge** — the once-per-database guard. D1 records which
 *   migrations have run; this helper does the same, because `ALTER TABLE … ADD
 *   COLUMN` is not idempotent in SQLite and re-running the bundle fails with
 *   "duplicate column name". A `WeakMap` keyed on the binding is the right scope
 *   because each test file gets its own database. AWS also keeps `next` out of the
 *   line-comment branch, which never reads it, and preserves newlines inside block
 *   comments so an error's line numbers still point at the file.
 * - **Edge-Sonic** — reading the directory off disk rather than a `define`
 *   binding, because a test that names one hardcoded file cannot tell **a new
 *   migration** from **an edit to an old one**, so it goes on passing through a
 *   schema change that never reached production.
 *
 * ### The splitter is not here
 *
 * The statement splitter — with all of Durable-DAV's trigger-aware rules and its
 * comment-level history — lives once, in `@rexezuge/d1`. `@rexezuge/identity`'s
 * migration applier delegates to the same module, so the splitter cannot drift
 * between the suite helper and the production applier. The re-exports below keep
 * this file's public surface identical to the source repos'.
 *
 * ### The lock is asserted, not reimplemented
 *
 * D1 records applied migrations by *filename*, so an applied migration is immutable
 * in fact while being an ordinary text file in appearance. That fact lives in
 * `migrations/migrations.lock.json`, and the rules that check it live once, in
 * `scripts/verify-migrations.ts` — the same module the CI gate runs. This helper
 * deliberately does not parse the lock itself: a second implementation of a thing
 * already written is free to disagree with the first, and the two disagreeing would
 * leave a suite green against a lock CI rejects.
 *
 * ### Generic over the binding
 *
 * `D1DatabaseLike` is structural — `prepare`, and `batch` when the runtime has it
 * — so a fake D1 in a unit test, a real D1 in the workerd integration suite, and
 * Miniflare's D1 all satisfy it without an import of `@cloudflare/workers-types`.
 * `batch` is used when present (Durable-DAV's shape: one round trip per file, and
 * the failure names the file) and a sequential `prepare().run()` loop otherwise
 * (AWS's shape: works on a binding with no batch support).
 */

import { executableStatements, splitSql } from '@rexezuge/d1';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One migration file, as it is read.
 */
export interface MigrationFile {
  /**
  Bare filename, e.g. `0007_replication.sql`.
  */
  name: string;
  /**
  The file's full text.
  */
  sql: string;
}

/**
 * The subset of a D1 prepared statement this helper uses.
 */
export interface D1PreparedStatementLike {
  run(): Promise<unknown>;
}

/**
 * The subset of a D1 binding this helper uses.
 *
 * `batch` is optional because not every binding that can prepare a statement can
 * batch one; where it exists it is the better path, and where it does not the
 * sequential loop is equivalent for a migration whose statements are independent.
 */
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch?(statements: readonly D1PreparedStatementLike[]): Promise<unknown>;
}

/**
 * A closed range of migration files, by filename.
 *
 * Both ends inclusive, because "up to and including 0006" is the natural way to
 * seed a pre-migration database and then apply the migration under test.
 */
export interface MigrationRange {
  from?: string;
  to?: string;
}

/**
 * What `createMigrationHelper` accepts.
 */
export interface MigrationHelperOptions {
  /**
   * Directory holding the `.sql` files. Read top-level only, matching wrangler's
   * default `${migrationsDir}/*.sql`, so the helper describes exactly the set
   * wrangler will run.
   */
  readonly migrationsDir: string;
  /**
   * Migration files to use instead of reading `migrationsDir`.
   *
   * The escape hatch for a harness that embeds the SQL at build time. Same shape
   * as the `__INTEGRATION_MIGRATION_FILES__` binding the source repos inject.
   */
  readonly files?: readonly MigrationFile[];
}

/**
 * A bound migration helper.
 */
export interface MigrationHelper {
  /**
  Every migration, in apply order.
  */
  migrationFiles(): MigrationFile[];
  /**
  The filenames, in apply order.
  */
  migrationFileNames(): string[];
  /**
  The concatenation of every file, in apply order — what a fresh database becomes.
  */
  migrationSql(): string;
  /**
  One file's SQL, by name. "What does *this* file say", not "what does the set say".
  */
  migrationSqlOf(name: string): string;
  /**
  Split one file into statements, comments included.
  */
  splitSql(sql: string): string[];
  /**
  The statements of one file that SQLite will actually execute.
  */
  executableStatements(sql: string): string[];
  /**
   * Apply a range of migrations, at most once per database and range.
   *
   * Per file rather than one batch for everything, so a test can stop between
   * files: the identity-upgrade test needs to seed the *pre-0004* shape and then
   * apply 0004 to it.
   */
  applyMigrations(db: D1DatabaseLike, range?: MigrationRange): Promise<void>;
}

/**
 * Reads every `.sql` file in `dir`, in apply order.
 *
 * Sort is the filename sort D1 itself uses, rather than a numeric parse of the
 * prefix: wrangler hands the directory to SQLite in lexicographic order, so a
 * suite that reads it numerically disagrees with production on any prefix wider
 * than four digits.
 */
export function readMigrationFiles(dir: string): MigrationFile[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({ name: entry.name, sql: readFileSync(path.join(dir, entry.name), 'utf8') }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Strip leading `--` and block comments, which the splitter folds into the
 * statement it then reports on.
 */
function stripLeadingComments(statement: string): string {
  let out = statement;
  for (;;) {
    const next = out.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/, '');
    if (next === out) return out.trim();
    out = next;
  }
}

/**
Re-exported for surface parity with the source repos — the rules live in @rexezuge/d1.
*/

/**
 * Bind a migration directory into a helper.
 *
 * ```ts
 * const migrations = createMigrationHelper({ migrationsDir: join(REPO_ROOT, 'migrations') });
 * await migrations.applyMigrations(env.DB);
 * ```
 */
export function createMigrationHelper(options: MigrationHelperOptions): MigrationHelper {
  const files = options.files === undefined ? readMigrationFiles(options.migrationsDir) : [...options.files];

  /**
   * Databases this helper has already migrated, keyed by the range applied.
   *
   * A `WeakMap` rather than a module-level `Set`, because the guard is per
   * binding: two databases in one suite each need the bundle applied once, and a
   * module-level set would silently skip the second.
   */
  const applied = new WeakMap<D1DatabaseLike, string>();

  const indexOf = (name: string | undefined, fallback: number): number => {
    if (name === undefined) return fallback;
    const found = files.findIndex((file) => file.name === name);
    if (found === -1) {
      throw new Error(`Unknown migration file: ${name}. Available: ${files.map((file) => file.name).join(', ')}`);
    }
    return found;
  };

  return {
    migrationFiles: () => files.map((file) => ({ ...file })),
    migrationFileNames: () => files.map((file) => file.name),
    migrationSql: () => files.map((file) => file.sql).join('\n'),
    migrationSqlOf: (name: string) => {
      const file = files.find((candidate) => candidate.name === name);
      if (file === undefined) {
        throw new Error(`Unknown migration file: ${name}. Available: ${files.map((candidate) => candidate.name).join(', ')}`);
      }
      return file.sql;
    },
    splitSql,
    executableStatements,
    applyMigrations: async (db: D1DatabaseLike, range?: MigrationRange): Promise<void> => {
      const start = indexOf(range?.from, 0);
      const end = indexOf(range?.to, files.length - 1);
      const key = `${start}:${end}`;
      if (applied.get(db) === key) return;
      const applicable = files.slice(start, end + 1);

      for (const file of applicable) {
        const statements = executableStatements(file.sql);
        if (statements.length === 0) continue;

        if (typeof db.batch === 'function') {
          try {
            await db.batch(statements.map((sql) => db.prepare(sql)));
          } catch (error: unknown) {
            // A batch reports only the file's single failure, so name the statement:
            // a migration error that says nothing about which of its nine statements
            // broke is a migration error nobody fixes.
            throw new Error(
              `${file.name}: batch of ${statements.length} statements failed at ${stripLeadingComments(statements.at(-1) ?? '').slice(0, 200)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { cause: error },
            );
          }
          continue;
        }

        for (const sql of statements) {
          await db.prepare(sql).run();
        }
      }

      applied.set(db, key);
    },
  };
}

export { executableStatements, splitSql } from '@rexezuge/d1';
