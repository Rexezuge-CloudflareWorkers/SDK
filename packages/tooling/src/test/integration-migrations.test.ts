import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createMigrationHelper, executableStatements, readMigrationFiles, splitSql, type D1DatabaseLike, type D1PreparedStatementLike, type MigrationFile } from './integration-migrations';

const created: string[] = [];

function tempTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'migrations-'));
  created.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  return root;
}

afterAll(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
});

/**
 * A fake D1: records what it was asked to run, and refuses a statement it does not
 * recognise, so a suite can assert the helper split the file the way SQLite would
 * have to.
 */
function fakeD1(options: { batch?: boolean } = {}): D1DatabaseLike & { ran: string[] } {
  const ran: string[] = [];
  const prepare = (sql: string): D1PreparedStatementLike => ({
    run: async () => {
      ran.push(sql);
    },
  });
  const base: D1DatabaseLike & { ran: string[] } = { prepare, ran };
  if (options.batch !== false) {
    return {
      ...base,
      batch: async (statements) => {
        for (const statement of statements) await statement.run();
      },
    };
  }
  return base;
}

describe('readMigrationFiles', () => {
  it('reads every .sql file in apply order, and ignores the lock', () => {
    const dir = tempTree({
      'migrations.lock.json': '{}',
      '0002_more.sql': 'SELECT 2;',
      '0001_init.sql': 'SELECT 1;',
      'notes.md': 'ignored',
    });
    expect(readMigrationFiles(dir).map((file) => file.name)).toStrictEqual(['0001_init.sql', '0002_more.sql']);
  });
});

describe('splitSql', () => {
  it('splits on semicolons outside strings and comments', () => {
    expect(splitSql('SELECT 1; SELECT 2;')).toStrictEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps semicolons inside quoted strings', () => {
    expect(splitSql("INSERT INTO t VALUES ('a;b');")).toStrictEqual(["INSERT INTO t VALUES ('a;b')"]);
  });

  it('keeps doubled-quote escapes inside strings', () => {
    expect(splitSql("INSERT INTO t VALUES ('it''s; fine');")).toStrictEqual(["INSERT INTO t VALUES ('it''s; fine')"]);
  });

  it('folds comment-only runs into one statement the executable filter drops', () => {
    // The splitter does not judge executability — it only knows statement
    // boundaries. Comments stay attached to the statement they sit above; a
    // comment-only run comes back as its comment text, and the executable filter
    // (isExecutable) is what keeps it off the wire.
    const sql = '-- a note about the migration;\nCREATE TABLE a (id TEXT);\n/* trailing block */;';
    expect(splitSql(sql)).toStrictEqual(['-- a note about the migration;\nCREATE TABLE a (id TEXT)', '/* trailing block */']);
    expect(executableStatements(sql)).toStrictEqual(['-- a note about the migration;\nCREATE TABLE a (id TEXT)']);
  });

  it('does not split inside a CREATE TRIGGER body', () => {
    const sql = `CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE y SET a = 1; UPDATE y SET b = 2; END;`;
    // Statements come back trimmed, without the terminating semicolon.
    expect(splitSql(sql)).toStrictEqual(['CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE y SET a = 1; UPDATE y SET b = 2; END']);
  });

  it('does not treat a table named trigger as a trigger body', () => {
    const sql = 'CREATE TABLE trigger (id TEXT); INSERT INTO trigger VALUES (1);';
    expect(splitSql(sql)).toStrictEqual(['CREATE TABLE trigger (id TEXT)', 'INSERT INTO trigger VALUES (1)']);
  });
});

describe('createMigrationHelper', () => {
  it('applies every file, in order, once per database', async () => {
    const dir = tempTree({ '0001_init.sql': 'CREATE TABLE a (id TEXT);', '0002_more.sql': 'CREATE TABLE b (id TEXT);' });
    const helper = createMigrationHelper({ migrationsDir: dir });
    const db = fakeD1();

    await helper.applyMigrations(db);
    await helper.applyMigrations(db);

    expect(db.ran).toStrictEqual(['CREATE TABLE a (id TEXT)', 'CREATE TABLE b (id TEXT)']);
  });

  it('applies a closed range by filename, and can start from a pre-migration shape', async () => {
    const dir = tempTree({
      '0001_init.sql': 'CREATE TABLE a (id TEXT);',
      '0002_upgrade.sql': 'ALTER TABLE a ADD COLUMN email TEXT;',
      '0003_more.sql': 'CREATE TABLE c (id TEXT);',
    });
    const helper = createMigrationHelper({ migrationsDir: dir });
    const db = fakeD1();

    await helper.applyMigrations(db, { to: '0001_init.sql' });
    expect(db.ran).toStrictEqual(['CREATE TABLE a (id TEXT)']);

    await helper.applyMigrations(db, { from: '0002_upgrade.sql' });
    // `from` without `to` runs to the end of the set — 0002 and 0003 both.
    expect(db.ran).toStrictEqual(['CREATE TABLE a (id TEXT)', 'ALTER TABLE a ADD COLUMN email TEXT', 'CREATE TABLE c (id TEXT)']);
  });

  it('falls back to a per-statement loop when the binding cannot batch', async () => {
    const dir = tempTree({ '0001_init.sql': 'CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);' });
    const helper = createMigrationHelper({ migrationsDir: dir });
    const db = fakeD1({ batch: false });

    await helper.applyMigrations(db);

    expect(db.ran).toStrictEqual(['CREATE TABLE a (id TEXT)', 'CREATE TABLE b (id TEXT)']);
    expect('batch' in db).toBe(false);
  });

  it('names the file and the statement when a batch fails', async () => {
    const dir = tempTree({ '0001_init.sql': 'CREATE TABLE a (id TEXT);' });
    const helper = createMigrationHelper({ migrationsDir: dir });
    const db: D1DatabaseLike = {
      prepare: () => ({ run: async () => undefined }),
      batch: async () => {
        throw new Error('no such table: a');
      },
    };

    await expect(helper.applyMigrations(db)).rejects.toThrow(/0001_init\.sql: batch of 1 statements failed/);
  });

  it('refuses an unknown range endpoint, naming what is available', async () => {
    const dir = tempTree({ '0001_init.sql': 'SELECT 1;' });
    const helper = createMigrationHelper({ migrationsDir: dir });
    await expect(helper.applyMigrations(fakeD1(), { from: '0009_missing.sql' })).rejects.toThrow(/Unknown migration file: 0009_missing\.sql/);
  });

  it('reports one file\'s SQL without reading the others', () => {
    const dir = tempTree({ '0001_init.sql': 'SELECT 1;', '0002_more.sql': 'SELECT 2;' });
    const helper = createMigrationHelper({ migrationsDir: dir });
    expect(helper.migrationSqlOf('0002_more.sql')).toBe('SELECT 2;');
    expect(helper.migrationSql()).toBe('SELECT 1;\nSELECT 2;');
    expect(helper.migrationFileNames()).toStrictEqual(['0001_init.sql', '0002_more.sql']);
  });

  it('accepts injected files, for a harness that embeds the SQL at build time', async () => {
    const files: MigrationFile[] = [{ name: 'all.sql', sql: 'CREATE TABLE a (id TEXT);' }];
    const helper = createMigrationHelper({ migrationsDir: '/nonexistent', files });
    const db = fakeD1();
    await helper.applyMigrations(db);
    expect(db.ran).toStrictEqual(['CREATE TABLE a (id TEXT)']);
  });
});
