import { BadRequestError } from '@rexezuge/errors';
import { executableStatements } from '@rexezuge/d1';
import { describe, expect, it } from 'vitest';
import { UPGRADE_USER_IDENTITY, USERS_SCHEMA } from './migrations.ts';
import { registerAccount, resolveAccount } from './accountLookup.ts';
import { UserIdentityService } from './UserIdentityService.ts';
import { UserDAO } from './UserDAO.ts';
import type { UserRow } from './UserDAO.ts';
import { UserEmailDAO } from './UserEmailDAO.ts';
import type { UserEmailRow } from './UserEmailDAO.ts';

// ---------- a D1 fake that executes the kit's two tables ----------

/**
 * The fake interprets the exact SQL the DAOs issue — the same contract a real D1
 * binding honours. A statement shape nobody handles fails loudly rather than
 * silently returning null, so a DAO change cannot pass by accident.
 */
class FakeStatement {
  public ran = 0;

  public constructor(
    private readonly db: FakeDb,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  public bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values);
  }

  public async run(): Promise<{ success: boolean; meta?: { changes: number }; error?: string }> {
    this.ran += 1;
    // `execute` returns a row list because `first`/`all` read it as one; a
    // write's own answer is the first entry.
    const rows = this.db.execute(this.sql, this.params);
    const outcome = (Array.isArray(rows) ? rows[0] : rows) as { meta?: { changes?: number } } | undefined;
    // D1 answers a write with `meta.changes`, and two of the kit's statements
    // read it to tell "wrote a row" from "refused to". Dropping it here would
    // make every such branch look like a refusal.
    const changes = outcome?.meta?.changes;
    return typeof changes === 'number' ? { success: true, meta: { changes } } : { success: true };
  }

  public async first<T>(): Promise<T | null> {
    this.db.ran += 1;
    const rows = this.db.execute(this.sql, this.params);
    return (rows[0] ?? null) as T | null;
  }

  public async all<T>(): Promise<{ results: T[] }> {
    this.db.ran += 1;
    return { results: this.db.execute(this.sql, this.params) as T[] };
  }
}

class FakeDb {
  public users = new Map<string, UserRow & { username: string | null }>();
  public userEmails = new Map<string, UserEmailRow>();
  public failsOn = new Set<string>();
  public ran = 0;

  public prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  public async batch(statements: FakeStatement[]): Promise<{ success: boolean }[]> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  /**
  The dispatch table. An unhandled statement is a failing test, by design.
  */
  public execute(sql: string, params: unknown[]): unknown[] {
    const normalized = sql.replaceAll(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO users')) return [this.insertUser(params)];
    if (normalized.startsWith('INSERT INTO user_emails')) return [this.insertUserEmail(params)];
    if (normalized === 'SELECT * FROM users WHERE email = ? LIMIT 1') return [rowOf(this.users.get(params[0] as string) ?? null)];
    if (normalized === 'SELECT * FROM users WHERE id = ? LIMIT 1')
      return [rowOf([...this.users.values()].find((row) => row.id === params[0]) ?? null)];
    if (normalized === 'SELECT * FROM users WHERE current_email = ? LIMIT 1')
      return [rowOf([...this.users.values()].find((row) => (row.current_email ?? row.email) === params[0]) ?? null)];
    if (normalized === 'SELECT * FROM users WHERE username = ? LIMIT 1')
      return [rowOf([...this.users.values()].find((row) => row.username === params[0]) ?? null)];
    if (normalized.startsWith('SELECT * FROM user_emails WHERE email = ? AND is_verified = 1')) {
      if (this.failsOn.has('user_emails')) throw new Error('D1_ERROR: database is locked');
      const row = this.userEmails.get(params[0] as string);
      return row && row.is_verified === 1 ? [row] : [];
    }
    if (normalized.startsWith('SELECT * FROM user_emails WHERE email = ?')) {
      if (this.failsOn.has('user_emails')) throw new Error('D1_ERROR: database is locked');
      const row = this.userEmails.get(params[0] as string);
      return row ? [row] : [];
    }
    if (normalized.startsWith('SELECT * FROM user_emails WHERE user_id = ?'))
      return [...this.userEmails.values()]
        .filter((row) => row.user_id === params[0])
        .sort((left, right) => right.is_verified - left.is_verified || left.created_at - right.created_at);
    if (normalized.startsWith('UPDATE users SET username = COALESCE')) return [this.setUsername(params, true)];
    if (normalized.startsWith('UPDATE users SET username = ?')) return [this.setUsername(params, false)];
    if (normalized.startsWith('UPDATE users SET current_email = ?')) return [this.setCurrentEmail(params)];
    if (normalized.startsWith('UPDATE user_emails SET is_verified = 0 WHERE email = ?')) {
      const row = this.userEmails.get(params[0] as string);
      if (row) row.is_verified = 0;
      return [];
    }
    if (normalized.startsWith('UPDATE user_emails SET is_verified = 0 WHERE user_id = ?')) {
      for (const row of this.userEmails.values()) {
        if (row.user_id === params[0] && row.email !== params[1]) row.is_verified = 0;
      }
      return [];
    }
    throw new Error(`FakeDb: unhandled statement: ${normalized}`);
  }

  private insertUser(params: unknown[]): unknown {
    const key = params[0] as string;
    if (this.failsOn.has('users')) throw new Error('D1_ERROR: database is locked');
    if (this.users.has(key)) return { success: true }; // ON CONFLICT DO NOTHING
    this.users.set(key, {
      id: params[2] as string,
      email: key,
      current_email: params[3] as string,
      created_at: params[1] as number,
      username: null,
      updated_at: params[4] as number,
    });
    return { success: true };
  }

  private insertUserEmail(params: unknown[]): unknown {
    const key = params[0] as string;
    if (this.failsOn.has('user_emails')) throw new Error('D1_ERROR: database is locked');
    const existing = this.userEmails.get(key);
    // ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id,
    // is_verified = excluded.is_verified WHERE user_emails.is_verified = 0.
    // The conditional is the invariant the real statement carries: a verified row
    // is not re-pointed, and `changes` reports the refusal so `register` can
    // answer 'already-claimed' rather than silently taking the address.
    if (existing && existing.is_verified === 1) return { success: true, meta: { changes: 0 } };
    this.userEmails.set(key, {
      email: key,
      user_id: params[1] as string,
      is_verified: params[2] as number,
      created_at: params[3] as number,
    });
    return { success: true, meta: { changes: 1 } };
  }

  private setUsername(params: unknown[], coalesce: boolean): unknown {
    const idOrEmail = params[2] as string;
    for (const row of this.users.values()) {
      if (!(row.id === idOrEmail || row.email === idOrEmail)) {
        continue;
      }

      row.username = coalesce ? (row.username ?? (params[0] as string)) : (params[0] as string);
      row.updated_at = coalesce ? (row.updated_at ?? (params[1] as number)) : (params[1] as number);
    }
    return { success: true };
  }

  private setCurrentEmail(params: unknown[]): unknown {
    const [email, , id] = params as [string, number, string];
    for (const row of this.users.values()) {
      if (row.id !== id) {
        continue;
      }

      row.current_email = email;
      row.updated_at = params[1] as number;
    }
    return { success: true };
  }
}

function rowOf(row: UserRow | null): UserRow | null {
  if (!row) return null;
  const { id, email, current_email, created_at, username, updated_at } = row;
  return { id, email, current_email, created_at, username, updated_at };
}

function depsFor(db: FakeDb) {
  const userDAO = new UserDAO(db as never);
  const userEmailDAO = new UserEmailDAO(db as never);
  return {
    userDAO: () => Promise.resolve(userDAO),
    userEmailDAO: () => Promise.resolve(userEmailDAO),
  };
}

const NOW = 1_700_000_000;

// ---------- migrations ----------

describe('applyIdentityMigrations', () => {
  it('splits the shipped schema into executable, DDL-only statements', () => {
    // The statements themselves are executed by SQLite on workerd (the
    // integration suite); this unit test pins the kit's contract — the split
    // is total, the comments are folded, and nothing DML sneaks in.
    const fresh = executableStatements(USERS_SCHEMA);
    expect(fresh.length).toBeGreaterThan(0);
    for (const statement of fresh) {
      // Comments fold into the statement they precede (the splitter's
      // documented contract), so the test matches past them; the shipped
      // schema is CREATE-only — the ALTERs live in the upgrade file.
      expect(statement).toMatch(/CREATE\s+(TABLE|(UNIQUE\s+)?INDEX)/);
    }
    const upgrade = executableStatements(UPGRADE_USER_IDENTITY);
    expect(upgrade.length).toBeGreaterThan(0);
    expect(upgrade.join(' ')).toContain('ALTER TABLE users ADD COLUMN current_email TEXT');
  });
});

// ---------- free functions ----------

describe('registerAccount / resolveAccount', () => {
  it('registers an account, claims the address, and resolves it back', async () => {
    const db = new FakeDb();
    const account = await registerAccount(depsFor(db), 'Alice@Example.com', 'Alice@Example.com', NOW);
    expect(account).not.toBeNull();
    expect(account?.id).toMatch(/^usr_[a-f0-9]{32}$/);
    expect(account?.email).toBe('alice@example.com');
    expect(account?.username).toBeNull();
    expect(db.userEmails.get('alice@example.com')?.is_verified).toBe(1);
    await expect(resolveAccount(depsFor(db), 'alice@example.com')).resolves.toMatchObject({ id: account?.id });
  });

  it('does not re-point a verified address when the claim loses the race', async () => {
    const db = new FakeDb();
    const emails = new UserEmailDAO(db);
    expect(await emails.register({ email: 'Race@X.com', userId: 'usr_first', isVerified: true, now: NOW })).toBe('claimed');

    // The lost-race shape: another writer verifies the address *between* this
    // call's read and its write. The read below cannot see it, so the write is
    // the only thing standing between a concurrent claim and a takeover.
    const racing = new (class extends UserEmailDAO {
      public override async get(): Promise<UserEmailRow | null> {
        return null; // as if the row were not there yet
      }
    })(db);

    expect(await racing.register({ email: 'Race@X.com', userId: 'usr_second', isVerified: true, now: NOW })).toBe('already-claimed');
    expect(db.userEmails.get('race@x.com')?.user_id).toBe('usr_first');
  });

  it('re-points an unverified address, so a released address is never permanently reserved', async () => {
    const db = new FakeDb();
    const emails = new UserEmailDAO(db);
    await emails.register({ email: 'moved@x.com', userId: 'usr_first', isVerified: true, now: NOW });
    await emails.revoke('moved@x.com');
    expect(await emails.register({ email: 'moved@x.com', userId: 'usr_second', isVerified: true, now: NOW })).toBe('claimed');
    expect(db.userEmails.get('moved@x.com')?.user_id).toBe('usr_second');
  });

  it('detects a taken anchor and reports null so the opaque-anchor retry runs', async () => {
    const db = new FakeDb();
    db.users.set('taken@x.com', {
      id: 'usr_existing',
      email: 'taken@x.com',
      current_email: 'taken@x.com',
      created_at: NOW,
      username: null,
      updated_at: null,
    });
    const first = await registerAccount(depsFor(db), 'taken@x.com', 'taken@x.com', NOW);
    expect(first).toBeNull();
    const account = await registerAccount(depsFor(db), 'taken@x.com', 'anchor-abc@users.invalid', NOW);
    expect(account).not.toBeNull();
    expect(account?.anchorEmail).toBe('anchor-abc@users.invalid');
  });

  it('refuses a revoked address (fail-closed) instead of falling through to the anchor', async () => {
    const db = new FakeDb();
    await registerAccount(depsFor(db), 'first@x.com', 'first@x.com', NOW);
    // The account moves off the address: the registry row stays, revoked.
    db.userEmails.get('first@x.com')!.is_verified = 0;
    await expect(resolveAccount(depsFor(db), 'first@x.com')).resolves.toBeNull();
    // …and the previous holder's anchor does not re-adopt it.
    await expect(resolveAccount(depsFor(db), 'first@x.com')).resolves.not.toMatchObject({ id: /usr_/ });
  });

  it('refuses an anchor whose account has moved off it, with no registry row to say so', async () => {
    // The case the registry branch cannot cover: a pre-identity database (or an
    // account the migration left ambiguous) has no `user_emails` row, so the
    // anchor lookup is the only thing standing between a reassigned address and
    // the previous holder's account.
    const db = new FakeDb();
    db.users.set('moved-off@x.com', {
      id: 'usr_moved',
      email: 'moved-off@x.com',
      current_email: 'somewhere-else@x.com',
      created_at: NOW,
      username: null,
      updated_at: null,
    });
    await expect(resolveAccount(depsFor(db), 'moved-off@x.com')).resolves.toBeNull();

    // An anchor the account still holds resolves exactly as before, and a case
    // variant of it is the same address.
    db.users.get('moved-off@x.com')!.current_email = 'Moved-Off@x.com';
    await expect(resolveAccount(depsFor(db), 'moved-off@x.com')).resolves.toMatchObject({ id: 'usr_moved' });
  });

  it('tolerates only a missing registry; every other failure rethrows', async () => {
    const missing = new FakeDb();
    missing.userEmails.clear();
    // A missing registry row falls through to the legacy lookups…
    missing.users.set('legacy@x.com', {
      id: 'usr_l',
      email: 'legacy@x.com',
      current_email: undefined as never,
      created_at: NOW,
      username: null,
      updated_at: null,
    });
    await expect(resolveAccount(depsFor(missing), 'legacy@x.com')).resolves.toMatchObject({ id: 'usr_l' });

    // …but a *failed* registry read is an outage and must surface.
    const failing = new FakeDb();
    await registerAccount(depsFor(failing), 'a@x.com', 'a@x.com', NOW);
    failing.failsOn.add('user_emails');
    await expect(resolveAccount(depsFor(failing), 'a@x.com')).rejects.toThrow(/locked/);
  });

  it('rejects a malformed address before any query', async () => {
    await expect(resolveAccount(depsFor(new FakeDb()), 'not-an-email')).resolves.toBeNull();
  });
});

// ---------- the service ----------

describe('UserIdentityService', () => {
  it('memoizes resolution per instance', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    await registerAccount(depsFor(db), 'a@x.com', 'a@x.com', NOW);
    const before = db.ran;
    await service.resolveAccount('a@x.com');
    const afterFirst = db.ran;
    await service.resolveAccount('a@x.com');
    expect(db.ran).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(before);
  });

  it('resolves by id, and by address id', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    const account = await service.resolveOrRegister('a@x.com');
    expect(account).not.toBeNull();
    await expect(service.resolveAccountById(account!.id)).resolves.toMatchObject({ id: account!.id });
    await expect(service.resolveAccountId('a@x.com')).resolves.toBe(account!.id);
  });

  it('resolveOrRegister returns the existing account and creates otherwise', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    const created = await service.resolveOrRegister('a@x.com');
    await expect(service.resolveOrRegister('a@x.com')).resolves.toMatchObject({ id: created!.id });
    await expect(service.resolveOrRegister('b@x.com')).resolves.toMatchObject({ email: 'b@x.com' });
  });

  it('moves the sign-in address, revoking the old one, in the documented order', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    const account = (await service.resolveOrRegister('a@x.com'))!;
    const moved = await service.setPrimaryEmail(account.id, 'B@X.com', NOW);
    expect(moved.email).toBe('b@x.com');
    expect(moved.anchorEmail).toBe('a@x.com'); // the anchor never moves
    await expect(service.resolveAccount('b@x.com')).resolves.toMatchObject({ id: account.id });
    await expect(service.resolveAccount('a@x.com')).resolves.toBeNull(); // revoked
    await expect(service.listAddresses(account.id)).resolves.toStrictEqual([
      { email: 'b@x.com', isVerified: true },
      { email: 'a@x.com', isVerified: false },
    ]);
  });

  it('rejects an address already verified for another account', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    const account = (await service.resolveOrRegister('a@x.com'))!;
    await service.resolveOrRegister('other@x.com');
    await expect(service.setPrimaryEmail(account.id, 'other@x.com', NOW)).rejects.toThrow(BadRequestError);
  });

  it('rejects an unknown account and a malformed address', async () => {
    const service = new UserIdentityService({ DB: new FakeDb() as never });
    await expect(service.setPrimaryEmail('usr_missing', 'a@x.com', NOW)).rejects.toThrow(/User not found/);
    const db = new FakeDb();
    const other = new UserIdentityService({ DB: db as never });
    const account = (await other.resolveOrRegister('a@x.com'))!;
    await expect(other.setPrimaryEmail(account.id, 'nope', NOW)).rejects.toThrow(/Invalid email/);
  });

  it('linkVerifiedEmail attaches a proven address, rejecting a claimed one', async () => {
    const db = new FakeDb();
    const service = new UserIdentityService({ DB: db as never });
    const account = (await service.resolveOrRegister('a@x.com'))!;
    await expect(service.linkVerifiedEmail(account.id, 'alias@x.com')).resolves.toBeUndefined();
    const other = (await service.resolveOrRegister('other@x.com'))!;
    await expect(service.linkVerifiedEmail(other.id, 'alias@x.com')).rejects.toThrow(/already in use/);
  });
});

// ---------- DAO surface ----------

describe('UserDAO', () => {
  it('creates, finds by id/current/anchor, and moves the address', async () => {
    const dao = new UserDAO(new FakeDb() as never);
    await expect(dao.createUser({ anchor: 'A@X.com', loginEmail: 'A@X.com', now: NOW })).resolves.toMatch(/^usr_/);
    const row = await dao.getByEmail('a@x.com');
    expect(row?.current_email).toBe('a@x.com');
    // A created row carries its creation moment in `updated_at` as well as
    // `created_at`. The canonical column is nullable, but a consumer schema with
    // `updated_at NOT NULL` — and the retention heartbeat that reads it — depends
    // on the stamp, and omitting it made `createUser` fail there outright.
    expect(row?.updated_at).toBe(NOW);
    await dao.setCurrentEmail(row!.id!, 'b@x.com', NOW + 1);
    expect((await dao.getById(row!.id!))?.current_email).toBe('b@x.com');
    await dao.setUsername(row!.id!, 'Alice2', NOW);
    expect((await dao.getByUsernameCi('alice2'))?.username).toBe('alice2');
  });
});
