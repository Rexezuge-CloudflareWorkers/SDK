import { describe, expect, it } from 'vitest';
import { D1_RETRY_DEFAULTS } from './D1Retry.ts';
import type { D1PreparedStatement, D1Queryable, D1Result } from './D1Types.ts';
import { BaseDAO, assertSqlIdentifier, statementTable } from './BaseDAO.ts';
import type { BilledRowsForTable, WriteResult } from './BaseDAO.ts';
import { isD1DailyLimitError, nextMidnightUtc } from './D1ErrorClassifier.ts';

interface CountRow {
  count: number;
}

function result(changes: number, success = true): D1Result {
  return {
    success,
    results: [],
    meta: { changes },
  } as unknown as D1Result;
}

function prepared(): D1PreparedStatement {
  // `bind` returns a **new** statement, as the platform's does: bindings are
  // immutable on a prepared statement, and a double that returns itself would make
  // `TrackedStatement.bind` look like it silently dropped the re-bind.
  const statement = {
    bind: (): D1PreparedStatement => prepared(),
    run: async (): Promise<D1Result> => result(1),
    first: async <T>(): Promise<T | null> => ({ count: 1 }) as T | null,
    all: async <T>(): Promise<{ results: T[] }> => ({ results: [{ count: 1 } as unknown as T] }),
  };
  return statement as unknown as D1PreparedStatement;
}

function database(overrides: Partial<D1Queryable> = {}): D1Queryable {
  const statement = prepared();
  return {
    prepare: () => statement,
    batch: async (): Promise<D1Result[]> => [result(2)],
    ...overrides,
  } as unknown as D1Queryable;
}

interface MeterSpy {
  charge: (count?: number, kind?: string) => void;
  charged: Array<[number | undefined, string | undefined]>;
  spent: number;
  ceiling: number;
  remaining: number;
  exhausted: boolean;
  canAfford: (count?: number) => boolean;
  setCeiling: (limit: number) => void;
}

function meter(remaining = Infinity): MeterSpy {
  const charged: Array<[number | undefined, string | undefined]> = [];
  return {
    charged,
    charge: (count = 1, kind?: string): void => {
      charged.push([count, kind]);
    },
    // The rest of the `SubrequestMeter` surface, which `BaseDAO` never calls — here
    // because the double models the whole port rather than the two methods that
    // happen to be exercised today.
    spent: 0,
    ceiling: remaining,
    remaining,
    exhausted: false,
    canAfford: (count = 1): boolean => count <= remaining,
    setCeiling: (): void => undefined,
  };
}

class Probe extends BaseDAO {
  public constructor(db: D1Queryable, spy: ReturnType<typeof meter>, billedRowsForTable?: BilledRowsForTable) {
    super(db, spy as never, { billedRowsForTable });
  }

  public read(sql: string, bindings: unknown[] = []): Promise<CountRow | null> {
    return this.first<CountRow>(sql, bindings);
  }

  public readAll(sql: string): Promise<CountRow[]> {
    return this.all<CountRow>(sql);
  }

  public readCount(sql: string): Promise<number> {
    return this.count(sql);
  }

  public write(sql: string, bindings: unknown[] = []): Promise<D1Result> {
    return this.run(sql, bindings);
  }

  public batchRun(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.batch(statements);
  }

  public track(sql: string): ReturnType<BaseDAO['tracked']> {
    return this.tracked(sql);
  }

  public writeTracked(sql: string): Promise<WriteResult> {
    return this.runTracked(this.tracked(sql));
  }

  public budgetFor(count: number): number {
    return this.fitToSubrequestBudget(count);
  }

  public assertBudget(count: number): void {
    this.assertSubrequestBudget(count, 'this request');
  }

  public get meterRef(): ReturnType<typeof meter> {
    return this.subrequests as never;
  }
}

describe('BaseDAO subrequest accounting', () => {
  it('charges one subrequest per logical statement, not per retry attempt', async () => {
    const spy = meter();
    const dao = new Probe(database(), spy);
    await dao.read('SELECT 1');
    await dao.readAll('SELECT 2');
    expect(spy.charged).toEqual([
      [1, 'd1'],
      [1, 'd1'],
    ]);
  });

  it('charges a batch once however many statements it carries', async () => {
    const spy = meter();
    const dao = new Probe(database(), spy);
    await dao.batchRun([prepared(), prepared(), prepared()]);
    expect(spy.charged).toEqual([[1, 'd1']]);
  });

  it('charges nothing for an empty batch', async () => {
    const spy = meter();
    const dao = new Probe(database(), spy);
    await dao.batchRun([]);
    expect(spy.charged).toEqual([]);
  });

  it('exposes the meter so a DAO that builds another DAO cannot drop it', () => {
    const spy = meter();
    const dao = new Probe(database(), spy);
    expect(dao.meterRef).toBe(spy);
  });

  it('does not charge when the constructor takes no meter', async () => {
    const dao = new Probe(database(), meter());
    const unmetered = new (class extends BaseDAO {
      public constructor(db: D1Queryable) {
        super(db);
      }

      public read(sql: string): Promise<CountRow | null> {
        return this.first<CountRow>(sql);
      }
    })(database());
    await dao.read('SELECT 1');
    await unmetered.read('SELECT 1');
    // The unmetered path must not throw and must not blow a ceiling it does not have.
    expect(dao.meterRef.charged).toHaveLength(1);
  });

  it('retries still charge once, because the charge is not inside the retry', async () => {
    let attempts = 0;
    const failing = {
      prepare: () => ({
        bind: () => failingStatement(),
        run: async (): Promise<D1Result> => {
          attempts += 1;
          if (attempts < 3) throw new Error('connection: host not found');
          return result(1);
        },
        first: async <T>(): Promise<T | null> => null as T | null,
        all: async <T>(): Promise<{ results: T[] }> => ({ results: [] }),
      }),
      batch: async () => [],
    } as unknown as D1Queryable;
    function failingStatement(): D1PreparedStatement {
      return prepared();
    }
    const spy = meter();
    const dao = new Probe(failing, spy);
    await dao.write('UPDATE t SET c = 1');
    expect(attempts).toBe(3);
    expect(spy.charged).toHaveLength(1);
  });
});

describe('BaseDAO subrequest budget helpers', () => {
  it('clamps to what the remaining budget can carry', () => {
    const dao = new Probe(database(), meter(3));
    expect(dao.budgetFor(10)).toBe(3);
    expect(dao.budgetFor(2)).toBe(2);
  });

  it('does not clamp against an unbounded meter', () => {
    const dao = new Probe(database(), meter(Infinity));
    expect(dao.budgetFor(10_000)).toBe(10_000);
  });

  it('never returns a negative clamp', () => {
    const dao = new Probe(database(), meter(0));
    expect(dao.budgetFor(5)).toBe(0);
  });

  it('refuses a set of writes that cannot fit', () => {
    const dao = new Probe(database(), meter(2));
    expect(() => dao.assertBudget(2)).not.toThrow();
    expect(() => dao.assertBudget(3)).toThrow(/needs 3 database operations/);
  });
});

describe('statementTable', () => {
  it.each([
    ['INSERT INTO songs (id) VALUES (?)', 'songs'],
    ['insert into songs (id) values (?)', 'songs'],
    ['INSERT OR REPLACE INTO nodes VALUES (?)', 'nodes'],
    ['UPDATE stars SET rating = ? WHERE id = ?', 'stars'],
    ['DELETE FROM play_counts WHERE user_id = ?', 'play_counts'],
    ['  \n  DELETE FROM bookmarks WHERE id = ?', 'bookmarks'],
    ['-- a comment\nDELETE FROM ratings WHERE id = ?', 'ratings'],
    ['-- one\n-- two\nUPDATE playlists SET name = ?', 'playlists'],
    ['INSERT INTO `users` (id) VALUES (?)', 'users'],
    ['INSERT INTO [songs] (id) VALUES (?)', 'songs'],
    // The verb is anchored at the start, so a verb quoted inside a literal does not
    // win — the first one is the statement's own.
    ["INSERT INTO songs (id) VALUES ('INSERT INTO other')", 'songs'],
  ])('reads the table out of %s', (sql, expected) => {
    expect(statementTable(sql)).toBe(expected);
  });

  it.each([
    ['SELECT id FROM songs', 'a read names no write table'],
    ['-- DELETE FROM songs', 'a commented-out verb is not a verb'],
    ['-- only a comment', 'a comment with nothing after it'],
  ])('answers null for %s', (sql) => {
    expect(statementTable(sql)).toBeNull();
  });

  it('answers null rather than throwing for a non-string statement', () => {
    // Accounting must not be the thing that turns a failed write into a crashed
    // request; the caller charges the worst case against null.
    expect(statementTable(undefined as never)).toBeNull();
    expect(statementTable(42 as never)).toBeNull();
  });
});

describe('BaseDAO write accounting', () => {
  const port: BilledRowsForTable = (table, rows) => (table === 'songs' ? rows * 10 : null);

  it('reports billed rows beside changes', async () => {
    const dao = new Probe(database(), meter(), port);
    const write = await dao.writeTracked('INSERT INTO songs (id) VALUES (?)');
    expect(write.changes).toBe(1);
    expect(write.billedRows).toBe(10);
  });

  it('reports null — not zero — when no port is configured', async () => {
    const dao = new Probe(database(), meter());
    const write = await dao.writeTracked('INSERT INTO songs (id) VALUES (?)');
    expect(write.changes).toBe(1);
    // The direction that matters: a confident 0 would read as "free" and would be
    // indistinguishable from a table that genuinely costs nothing.
    expect(write.billedRows).toBeNull();
  });

  it('reports null for a table the port does not know', async () => {
    const dao = new Probe(database(), meter(), port);
    const write = await dao.writeTracked('INSERT INTO unknown_table (id) VALUES (?)');
    expect(write.changes).toBe(1);
    expect(write.billedRows).toBeNull();
  });

  it('carries the SQL beside the statement and rebinds into a new pair', async () => {
    const dao = new Probe(database(), meter());
    const tracked = dao.track('INSERT INTO songs (id) VALUES (?)');
    expect(tracked.sql).toBe('INSERT INTO songs (id) VALUES (?)');
    expect(tracked.statement).toBeDefined();
    const rebound = tracked.bind('abc');
    expect(rebound.sql).toBe(tracked.sql);
    expect(rebound.statement).not.toBe(tracked.statement);
  });
});

describe('assertSqlIdentifier', () => {
  it('accepts a plain identifier', () => {
    expect(() => assertSqlIdentifier('user_emails', 'table')).not.toThrow();
  });

  it('rejects anything that is not one', () => {
    expect(() => assertSqlIdentifier('users; DROP TABLE nodes', 'table')).toThrow(/Unsafe SQL identifier/);
    expect(() => assertSqlIdentifier('1users', 'table')).toThrow();
    expect(() => assertSqlIdentifier('', 'table')).toThrow();
  });
});

describe('retry schedule', () => {
  it('is still three attempts', () => {
    expect(D1_RETRY_DEFAULTS.maxRetries).toBe(3);
  });
});

describe('the daily-allowance detector', () => {
  const noon = Date.UTC(2026, 0, 15, 12, 0, 0);

  it.each([
    ["Your account has exceeded D1's free tier daily row write limit", 'write'],
    ['Your account has exceeded D1’s free tier daily row read limit.', 'read'],
    ['Failed to run statement: Your account has exceeded D1s free tier daily row write limit.', 'write'],
  ])('recognises %s', (message, kind) => {
    expect(isD1DailyLimitError(new Error(message), noon)).toEqual({ kind, resetsAt: nextMidnightUtc(noon) });
  });

  it.each(['too many SQL variables', 'UNIQUE constraint failed: songs.id', 'connection: host not found'])(
    'does not mistake %s for a spent allowance',
    (message) => {
      expect(isD1DailyLimitError(new Error(message), noon)).toBeNull();
    },
  );

  it('always resets in the future, including computed exactly at midnight', () => {
    // A reset at or before the clock that computed it is a pause of zero length,
    // and a chunk that returns immediately re-runs its whole failure path.
    const midnight = Date.UTC(2026, 0, 15, 0, 0, 0);
    expect(nextMidnightUtc(midnight)).toBeGreaterThan(midnight);
    const limit = isD1DailyLimitError(new Error('exceeded D1 free tier daily row write limit'), midnight);
    expect(limit?.resetsAt).toBeGreaterThan(midnight);
  });

  it('reads a bare string as well as an Error', () => {
    expect(isD1DailyLimitError('exceeded D1 free tier daily row read limit', noon)?.kind).toBe('read');
    expect(isD1DailyLimitError(undefined, noon)).toBeNull();
  });
});
