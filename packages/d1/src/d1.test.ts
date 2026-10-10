import { describe, expect, it, vi } from 'vitest';
import { DatabaseError } from '@rexezuge/errors';
import { BaseDAO, assertSqlIdentifier, decryptSecret, encryptSecret, roundTripSecret } from './index';
import { D1_RETRY_DEFAULTS } from './D1Retry';
import { isD1ErrorRetryable } from './D1ErrorClassifier';
import type { D1PreparedStatement, D1Queryable, D1Result } from './D1Types';

// ---------- fake D1 ----------

class FakeStatement implements D1PreparedStatement {
  public constructor(
    private readonly row: unknown,
    private readonly behavior: (() => Promise<D1Result>) | undefined,
  ) {}

  public bind(...values: unknown[]): D1PreparedStatement {
    void values;
    return this;
  }

  public first<T = unknown>(): Promise<T | null> {
    return (this.row ?? null) as T | null;
  }

  public all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.row as T[] };
  }

  public run(): Promise<D1Result> {
    if (this.behavior !== undefined) {
      return typeof this.behavior === 'function' ? this.behavior() : Promise.resolve(this.behavior);
    }
    return Promise.resolve({ success: true });
  }
}

class FakeDb implements D1Queryable {
  public readonly prepared: string[] = [];
  public batchCalls = 0;

  public constructor(private readonly behavior: () => Promise<D1Result> | D1Result = { success: true }) {}

  public prepare(query: string): D1PreparedStatement {
    this.prepared.push(query);
    return new FakeStatement({ count: 0 }, this.behavior);
  }

  public async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.batchCalls += 1;
    const results: D1Result[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }
}

class TestDAO extends BaseDAO {
  public constructor(db: D1Queryable) {
    super(db);
  }

  public write(statement: () => Promise<D1Result>): Promise<D1Result> {
    return this.run(statement, 'write fixture');
  }

  public readRow<T>(statement: () => Promise<T | null>): Promise<T | null> {
    return this.first(statement, 'read fixture');
  }

  public readRows<T>(statement: () => Promise<{ results?: T[] }>): Promise<T[]> {
    return this.all(statement, 'list fixture');
  }

  public readCount(): Promise<number> {
    return this.count((): Promise<{ count: number } | null> => Promise.resolve({ count: 7 }), 'count fixture');
  }

  public writeBatch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.batch(statements, 'batch fixture');
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
    const result: D1Result = { success: true };
    await expect(dao.write((): Promise<D1Result> => Promise.resolve(result))).resolves.toBe(result);
  });

  it('retries a retryable failure with backoff, then succeeds', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const statement = (): Promise<D1Result> => {
      attempts += 1;
      return Promise.resolve(attempts < 3 ? { success: false, error: 'D1_ERROR: database is busy' } : { success: true });
    };
    const promise = new TestDAO(new FakeDb()).write(statement);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toMatchObject({ success: true });
    expect(attempts).toBe(3);
    vi.useRealTimers();
  });

  it('gives up after the scheduled attempts and reports the classified failure', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const statement = (): Promise<D1Result> => {
      attempts += 1;
      return Promise.resolve({ success: false, error: 'database is locked' });
    };
    const promise = new TestDAO(new FakeDb()).write(statement);
    const assertion = expect(promise).rejects.toMatchObject({
      message: 'Failed to write fixture: database is locked',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    // The final attempt throws the classified error itself, not the loop's
    // unreachable tail: the message carries the context prefix and the verdict.
    await assertion;
    expect(attempts).toBe(D1_RETRY_DEFAULTS.maxRetries + 1);
    vi.useRealTimers();
  });

  it('does not retry a permanent failure and reports it non-retryable', async () => {
    let attempts = 0;
    const statement = (): Promise<D1Result> => {
      attempts += 1;
      return Promise.resolve({ success: false, error: 'UNIQUE constraint failed: users.email' });
    };
    await expect(new TestDAO(new FakeDb()).write(statement)).rejects.toMatchObject({
      status: 500,
      retryable: false,
      type: 'DatabaseError',
    });
    expect(attempts).toBe(1);
  });

  it('normalizes a thrown foreign error with the context prefix', async () => {
    await expect(
      new TestDAO(new FakeDb()).write((): Promise<D1Result> => Promise.reject(new Error('socket hang up'))),
    ).rejects.toThrow(/^Failed to write fixture: socket hang up/);
  });
});

// ---------- BaseDAO surface ----------

describe('BaseDAO', () => {
  it('reads a row and maps null away', async () => {
    const row = { id: 'u1' };
    const dao = new TestDAO(new FakeDb());
    expect(await dao.readRow((): Promise<{ id: string } | null> => Promise.resolve(row))).toStrictEqual({ id: 'u1' });
    expect(await dao.readRow((): Promise<{ id: string } | null> => Promise.resolve(null))).toBeNull();
  });

  it('reads rows with a default empty array', async () => {
    const dao = new TestDAO(new FakeDb());
    expect(await dao.readRows((): Promise<{ results?: { id: string }[] }> => Promise.resolve({}))).toStrictEqual([]);
  });

  it('reads a count falling back to 0', async () => {
    const dao = new TestDAO(new FakeDb());
    expect(await dao.readCount()).toBe(7);
  });

  it('batches prepared statements', async () => {
    const dao = new TestDAO(new FakeDb());
    const results = await dao.writeBatch([new FakeStatement('', undefined)]);
    expect(results).toStrictEqual([{ success: true }]);
  });

  it('deleteOlderThan interpolates only allow-listed identifiers and returns changes', async () => {
    const db = new FakeDb();
    // BaseDAO.deleteOlderThan is static; verify via reflection-free call
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
    await expect(decryptSecret(envelope, otherKey)).rejects.toThrow();
    await expect(decryptSecret({ ...envelope, ciphertext: `${envelope.ciphertext.slice(0, 8)}AAAA${envelope.ciphertext.slice(12)}` }, key)).rejects.toThrow();
  });
});
