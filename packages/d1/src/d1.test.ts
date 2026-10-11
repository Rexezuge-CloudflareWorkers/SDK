import { describe, expect, it, vi } from 'vitest';
import { DatabaseError } from '@rexezuge/errors';
import { AesGcmKeyError, BaseDAO, assertSqlIdentifier, decryptSecret, encryptSecret, roundTripSecret } from './index';
import { D1_RETRY_DEFAULTS } from './D1Retry';
import { isD1ErrorRetryable } from './D1ErrorClassifier';
import type { D1PreparedStatement, D1Queryable, D1Result } from './D1Types';

// ---------- fake D1 ----------

class FakeStatement implements D1PreparedStatement {
  public constructor(
    private readonly db: FakeDb,
    private readonly row: unknown,
    private readonly behavior: (() => Promise<D1Result>) | D1Result | undefined,
    private readonly values: unknown[] = [],
  ) {}

  public bind(...values: unknown[]): D1PreparedStatement {
    return new FakeStatement(this.db, this.row, this.behavior, values);
  }

  public first<T = unknown>(): Promise<T | null> {
    return Promise.resolve((this.row ?? null) as T | null);
  }

  public all<T = unknown>(): Promise<{ results: T[] }> {
    return Promise.resolve({ results: this.row as T[] });
  }

  public run(): Promise<D1Result> {
    if (this.behavior === undefined) return Promise.resolve({ success: true });
    return typeof this.behavior === 'function' ? this.behavior() : Promise.resolve(this.behavior);
  }
}

class FakeDb implements D1Queryable {
  public readonly prepared: string[] = [];
  public readonly bound: unknown[][] = [];
  public batchCalls = 0;

  public constructor(
    private readonly behavior: (() => Promise<D1Result>) | D1Result = { success: true },
    /** The row every `first`/`all` reads back; null means "no row". */
    private readonly row: unknown = null,
  ) {}

  public prepare(query: string): D1PreparedStatement {
    this.prepared.push(query);
    return new FakeStatement(this, this.row, this.behavior);
  }

  public async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.batchCalls += 1;
    const results: D1Result[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  public recordBind(values: unknown[]): void {
    this.bound.push(values);
  }
}

class TestDAO extends BaseDAO {
  public constructor(db: D1Queryable) {
    super(db);
  }

  // sql-first surface, exactly as a repo DAO subclasses it
  public write(sql: string, bindings?: unknown[]): Promise<D1Result> {
    return this.run(sql, bindings);
  }

  public readRow<T>(sql: string, bindings?: unknown[]): Promise<T | null> {
    return this.first<T>(sql, bindings);
  }

  public readRows<T>(sql: string, bindings?: unknown[]): Promise<T[]> {
    return this.all<T>(sql, bindings);
  }

  public readCount(sql: string, bindings?: unknown[]): Promise<number> {
    return this.count(sql, bindings);
  }

  public useStatement(sql: string, bindings?: unknown[]): D1PreparedStatement {
    return this.statement(sql, bindings);
  }

  public writeBatch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.batch(statements);
  }
}

// ---------- classifier ----------

describe('isD1ErrorRetryable', () => {
  it('treats busy/locked/timeout as transient', () => {
    expect(isD1ErrorRetryable('D1_ERROR: database is locked')).toBe(true);
    expect(isD1ErrorRetryable('database is busy')).toBe(true);
    expect(isD1ErrorRetryable('Network connection lost')).toBe(true);
    expect(isD1ErrorRetryable('request timed out')).toBe(true);
  });

  it('treats constraint violations as permanent', () => {
    expect(isD1ErrorRetryable('UNIQUE constraint failed: users.email')).toBe(false);
    expect(isD1ErrorRetryable('FOREIGN KEY constraint failed')).toBe(false);
    expect(isD1ErrorRetryable('no such table: users')).toBe(false);
  });

  it('checks retryable first: a transient signal beats a permanent-sounding word', () => {
    // "connection: host not found" — a DNS blip. /connection/ claims it first.
    expect(isD1ErrorRetryable('connection: host not found')).toBe(true);
    // Bare "host not found" carries no transient signal → permanent.
    expect(isD1ErrorRetryable('host not found')).toBe(false);
  });

  it('refuses an empty message', () => {
    expect(isD1ErrorRetryable('')).toBe(false);
  });
});

// ---------- retry engine ----------

describe('executeWithRetry (via BaseDAO)', () => {
  it('returns a successful result on the first attempt', async () => {
    const dao = new TestDAO(new FakeDb());
    await expect(dao.write('INSERT 1')).resolves.toMatchObject({ success: true });
  });

  it('retries a retryable failure with backoff, then succeeds', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const db = new FakeDb((): D1Result => {
      attempts += 1;
      return attempts < 3 ? { success: false, error: 'D1_ERROR: database is busy' } : { success: true };
    });
    const promise = new TestDAO(db).write('INSERT 1');
    const assertion = expect(promise).resolves.toMatchObject({ success: true });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(attempts).toBe(3);
    vi.useRealTimers();
  });

  it('gives up after the scheduled attempts and reports the classified failure', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const db = new FakeDb((): D1Result => {
      attempts += 1;
      return { success: false, error: 'database is locked' };
    });
    const promise = new TestDAO(db).write('INSERT 1');
    const assertion = expect(promise).rejects.toMatchObject({
      message: 'Failed to run statement: database is locked',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(attempts).toBe(D1_RETRY_DEFAULTS.maxRetries + 1);
    vi.useRealTimers();
  });

  it('does not retry a permanent failure and reports it non-retryable', async () => {
    let attempts = 0;
    const db = new FakeDb((): D1Result => {
      attempts += 1;
      return { success: false, error: 'UNIQUE constraint failed: users.email' };
    });
    await expect(new TestDAO(db).write('INSERT 1')).rejects.toMatchObject({
      status: 500,
      retryable: false,
      type: 'DatabaseError',
    });
    expect(attempts).toBe(1);
  });
});

// ---------- BaseDAO surface ----------

describe('BaseDAO', () => {
  it('reads a row, mapping absence to null', async () => {
    expect(await new TestDAO(new FakeDb(undefined, { id: 'u1' })).readRow<{ id: string }>('SELECT', [1])).toStrictEqual({ id: 'u1' });
    expect(await new TestDAO(new FakeDb()).readRow<{ id: string }>('SELECT')).toBeNull();
  });

  it('reads rows with a default empty array', async () => {
    expect(await new TestDAO(new FakeDb()).readRows<{ id: string }>('SELECT')).toStrictEqual([]);
    expect(await new TestDAO(new FakeDb(undefined, [{ id: 'a' }])).readRows<{ id: string }>('SELECT')).toStrictEqual([{ id: 'a' }]);
  });

  it('reads a count falling back to 0', async () => {
    expect(await new TestDAO(new FakeDb()).readCount('SELECT count(*)')).toBe(0);
    expect(await new TestDAO(new FakeDb(undefined, { count: 41 })).readCount('SELECT count(*)')).toBe(41);
  });

  it('binds parameters through the statement helper', async () => {
    const db = new FakeDb();
    const statement = new TestDAO(db).useStatement('SELECT * FROM t WHERE a = ?', ['x']);
    expect(statement).toBeInstanceOf(FakeStatement);
    expect(db.prepared).toStrictEqual(['SELECT * FROM t WHERE a = ?']);
    const bound = await statement.first<{ id: string }>();
    void bound;
  });

  it('batches prepared statements', async () => {
    const db = new FakeDb();
    const results = await new TestDAO(db).writeBatch([new FakeStatement(db, '', undefined)]);
    expect(results).toStrictEqual([{ success: true }]);
    expect(db.batchCalls).toBe(1);
  });

  it('deleteOlderThan interpolates only allow-listed identifiers and returns changes', async () => {
    const db = new FakeDb();
    const changes = await (
      TestDAO as unknown as {
        deleteOlderThan(
          db: D1Queryable,
          table: string,
          timeColumn: string,
          cutoff: number,
          limit: number,
          idColumn: string,
        ): Promise<number>;
      }
    ).deleteOlderThan(db, 'audit_logs', 'created_at', 123, 500, 'id');
    expect(changes).toBe(0);
    expect(db.prepared[0]).toContain('DELETE FROM audit_logs');
    expect(db.prepared[0]).toContain('created_at < ?');
  });

  it('rejects an unsafe identifier instead of interpolating it', () => {
    expect(() => assertSqlIdentifier('users; DROP TABLE users', 'table')).toThrow(/Unsafe SQL identifier/);
    expect(() => assertSqlIdentifier('updated_at', 'timeColumn')).not.toThrow();
  });

  it('exposes the retry schedule', () => {
    expect(TestDAO.retryDefaults).toStrictEqual(D1_RETRY_DEFAULTS);
  });
});

// ---------- aes-gcm ----------

describe('aes-gcm', () => {
  const key: string = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');

  it('round-trips a secret', async () => {
    const envelope = await encryptSecret('s3cr3t-value', key);
    expect(envelope.iv).toBeTruthy();
    expect(envelope.ciphertext).not.toContain('s3cr3t');
    await expect(decryptSecret(envelope, key)).resolves.toBe('s3cr3t-value');
    await expect(roundTripSecret('again', key)).resolves.toBe('again');
  });

  it('uses a fresh IV per encryption', async () => {
    const a = await encryptSecret('same', key);
    const b = await encryptSecret('same', key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails closed on a missing or wrong-sized key', async () => {
    await expect(encryptSecret('x', undefined)).rejects.toThrow(/not configured/);
    await expect(encryptSecret('x', Buffer.alloc(16).toString('base64'))).rejects.toThrow(/32 bytes/);
    await expect(encryptSecret('x', 'not base64!!')).rejects.toThrow(/base64/);
  });

  it('fails closed on a wrong key or tampered ciphertext', async () => {
    const envelope = await encryptSecret('tamper me', key);
    const otherKey: string = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    // The typed error, not merely "rejects": a bare `rejects.toThrow()` let the
    // platform's raw `OperationError` escape as the documented behavior, and
    // every consumer catching `AesGcmKeyError` — the contract the module
    // documents — missed it.
    await expect(decryptSecret(envelope, otherKey)).rejects.toThrow(AesGcmKeyError);
    await expect(
      decryptSecret({ ...envelope, ciphertext: `${envelope.ciphertext.slice(0, 8)}AAAA${envelope.ciphertext.slice(12)}` }, key),
    ).rejects.toThrow(AesGcmKeyError);
  });
});
