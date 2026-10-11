import { BaseDAO } from '@rexezuge/d1';
import type { D1Queryable } from '@rexezuge/d1';
import { newAccountId } from './ResolvedAccount';
import type { UserRow } from './ResolvedAccount';

/**
 * The stored form of a handle: lowercase.
 *
 * Every username read and every username write goes through this, so the two
 * can never disagree about case. That agreement is not cosmetic: `username` has
 * no `COLLATE NOCASE` (SQLite defaults to BINARY), so a stored `Alice2` is a
 * *different value* from `alice2` and a lookup that lowercased its parameter
 * would never find it. Normalising at the write points rather than relying on
 * each caller means a future caller cannot reintroduce an unfindable handle by
 * forgetting.
 */
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * `users` rows. Converged from `backend-data/src/dao/UserDAO.ts` (identical in
 * Durable-DAV, Durable-DAV-Router, Edge-Git, Mail-Otter, Mail-Meow; AWS keeps
 * the id/email core without the username methods).
 *
 * Case rule everywhere in this DAO: lowercase the *parameter*, never the
 * column — `lower(col)` makes the index or primary key unusable. It is only
 * sound because every writer stores lowercase through this DAO's own
 * normalisers.
 */
export class UserDAO extends BaseDAO {
  public constructor(database: D1Queryable) {
    super(database);
  }

  /**
   * Create an account, stamped with the identity columns.
   *
   * `INSERT ... ON CONFLICT DO NOTHING` with **no conflict target**, deliberately.
   * `users` carries two unique constraints — the anchor primary key and the
   * unique index on `current_email` — and SQLite applies `DO NOTHING` only to
   * the constraints a named target covers. Naming the anchor therefore left a
   * `current_email` collision as a raised error, which callers cannot tell from
   * a transient D1 failure: it propagated instead of returning `null`, so the
   * opaque-anchor retry never ran and every login request answered 500.
   *
   * Returns the new account's id, or `null` when the insert was a silent no-op —
   * which this DAO establishes by reading the anchor row back and requiring its
   * own generated id to be the one there. The read-back lives here rather than
   * in the caller because a caller that trusted the generated id on a taken
   * anchor would point the address registry at a *phantom* account: the address
   * then resolves to nothing, and the opaque-anchor retry fails the same way.
   * Making the no-op detectable here is what keeps registration from stranding
   * an address forever.
   */
  public async createUser(input: { anchor: string; loginEmail: string; now: number }): Promise<string | null> {
    const anchor = input.anchor.toLowerCase();
    const loginEmail = input.loginEmail.toLowerCase();
    const id = newAccountId();
    await this.run(
      () =>
        this.database
          .prepare('INSERT INTO users (email, created_at, id, current_email) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
          .bind(anchor, input.now, id, loginEmail)
          .run(),
      'create user',
    );
    const row = await this.getByEmail(anchor);
    return row?.id === id ? id : null;
  }

  /**
   * @param idOrEmail The stable account key, or an anchor address as the
   *   pre-identity fallback. `WHERE id = ? OR email = ?` cannot use either index
   *   as a seek, so this stays off the hot path; login resolves through
   *   `UserIdentityService` instead.
   */
  public async ensureUsername(idOrEmail: string, username: string, now: number): Promise<void> {
    await this.run(
      () =>
        this.database
          .prepare('UPDATE users SET username = COALESCE(username, ?), updated_at = COALESCE(updated_at, ?) WHERE id = ? OR email = ?')
          .bind(normalizeUsername(username), now, idOrEmail, idOrEmail)
          .run(),
      'ensure username',
    );
  }

  /** @param idOrEmail The stable account key, or an anchor address. */
  public async setUsername(idOrEmail: string, username: string, now: number): Promise<void> {
    await this.run(
      () =>
        this.database
          .prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ? OR email = ?')
          .bind(normalizeUsername(username), now, idOrEmail, idOrEmail)
          .run(),
      'set username',
    );
  }

  /**
   * Anchor lookup — used for legacy `*_email` values and cascade resolution.
   *
   * This is *not* a login lookup: an account that has changed its address is not
   * findable here by its new one. It is the pre-identity floor and the
   * attribution read.
   */
  public async getByEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>(
      () => this.database.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').bind(email.toLowerCase()).first<UserRow>(),
      'get user by email anchor',
    );
  }

  /** The account behind a stable key. Null on a pre-identity database. */
  public async getById(id: string): Promise<UserRow | null> {
    return this.first<UserRow>(
      () => this.database.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(id).first<UserRow>(),
      'get user by id',
    );
  }

  /** The account currently signing in with this address. Identity-era only. */
  public async getByCurrentEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>(
      () => this.database.prepare('SELECT * FROM users WHERE current_email = ? LIMIT 1').bind(email.toLowerCase()).first<UserRow>(),
      'get user by current email',
    );
  }

  /**
   * Move an account's sign-in address.
   *
   * The anchor `email` is deliberately untouched: it is what every legacy
   * `*_email` column and foreign key resolves against. Ordering matters — the
   * caller claims the new address first and revokes the old one third, so a
   * failure between steps never leaves the account without a way to sign in.
   */
  public async setCurrentEmail(id: string, email: string, now: number): Promise<void> {
    await this.run(
      () => this.database.prepare('UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?').bind(email.toLowerCase(), now, id).run(),
      'set current email',
    );
  }

  /** Lookup by handle. */
  public async getByUsernameCi(usernameCi: string): Promise<UserRow | null> {
    return this.first<UserRow>(
      () => this.database.prepare('SELECT * FROM users WHERE username = ? LIMIT 1').bind(usernameCi.toLowerCase()).first<UserRow>(),
      'get user by username',
    );
  }
}

export { normalizeUsername };
export type { UserRow };
