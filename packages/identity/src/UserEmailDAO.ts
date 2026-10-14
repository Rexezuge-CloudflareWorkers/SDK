import { BaseDAO } from '@rexezuge/d1';
import type { D1Queryable } from '@rexezuge/d1';
import type { SubrequestMeter } from '@rexezuge/shared';

/**
 * One known address for an account.
 *
 * `is_verified` gates login: `1` means the address may authenticate the
 * account, `0` means it was changed away from and is retained only so rows
 * written before the change still resolve. A revoked row is re-pointed (not
 * deleted) when a later account legitimately claims the address, so an address
 * is never permanently reserved.
 *
 * Converged from `backend-data/src/dao/UserEmailDAO.ts` (identical in Durable-DAV,
 * Durable-DAV-Router, Edge-Git, Mail-Otter).
 */
export interface UserEmailRow {
  email: string;
  user_id: string;
  is_verified: number;
  created_at: number;
}

export type EmailClaim = 'claimed' | 'already-claimed';

export class UserEmailDAO extends BaseDAO {
  /**
   * @param database The binding.
   * @param meter The invocation's subrequest counter. Optional, and defaulted,
   *   because a consumer that meters its own DAOs must be able to meter this one
   *   too: a DAO that charges nothing does not under-report loudly, it spends a
   *   subrequest the ceiling never saw — and the failure surfaces as the platform
   *   terminating an invocation, on no request, with no error in the application.
   *   The parameter exists so adopting this class does not silently un-meter a
   *   repository whose every other statement is charged.
   */
  public constructor(database: D1Queryable, meter?: SubrequestMeter) {
    super(database, meter);
  }

  /**
   * Claim an address for an account.
   *
   * An existing verified row is left alone: the address already belongs to
   * someone, and silently re-pointing it would hand one account's identity to
   * another. Callers check `resolveVerified` first and reject on a hit.
   * An unverified (revoked) row is re-pointed, which releases the address.
   *
   * The `WHERE user_emails.is_verified = 0` on the upsert is **load-bearing**,
   * not a refinement. The read above and this write are two statements, so a
   * caller that checked `resolveVerified` a moment earlier can still be racing
   * another claim for the same address — and an unconditional `DO UPDATE` lets
   * the loser re-point a row that is verified *now*, which is an account
   * takeover rather than a failed claim. The conditional update makes the write
   * itself refuse, and `meta.changes` turns "lost the race" into the same
   * `'already-claimed'` answer the pre-read would have given.
   *
   * Without it the read is an optimisation; with it, it is still an
   * optimisation and the invariant no longer depends on a statement ordering.
   */
  public async register(input: { email: string; userId: string; isVerified: boolean; now: number }): Promise<EmailClaim> {
    const email = input.email.toLowerCase();
    const existing = await this.get(email);
    if (existing && existing.is_verified === 1) return 'already-claimed';
    const result = await this.run(
      `INSERT INTO user_emails (email, user_id, is_verified, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified
       WHERE user_emails.is_verified = 0`,
      [email, input.userId, input.isVerified ? 1 : 0, input.now],
    );
    return (result.meta?.changes ?? 0) === 0 ? 'already-claimed' : 'claimed';
  }

  public async get(email: string): Promise<UserEmailRow | null> {
    // Lowercase the *parameter*: the column is stored lowercased by every
    // writer, so `lower(email) = ?` matched identically while making the
    // primary key unusable.
    return this.first<UserEmailRow>('SELECT * FROM user_emails WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  }

  /**
  Login resolution: only a verified address identifies an account.
  */
  public async resolveVerified(email: string): Promise<UserEmailRow | null> {
    return this.first<UserEmailRow>('SELECT * FROM user_emails WHERE email = ? AND is_verified = 1 LIMIT 1', [email.toLowerCase()]);
  }

  public async listByUserId(userId: string): Promise<UserEmailRow[]> {
    return this.all<UserEmailRow>('SELECT * FROM user_emails WHERE user_id = ? ORDER BY is_verified DESC, created_at ASC', [userId]);
  }

  /**
  Revoke an address for login while keeping it resolvable for attribution.
  */
  public async revoke(email: string): Promise<void> {
    await this.run('UPDATE user_emails SET is_verified = 0 WHERE email = ?', [email.toLowerCase()]);
  }

  /**
   * Revoke every verified address for an account. Used when an account's login
   * address changes, so only the new address can authenticate it.
   */
  public async revokeAllVerified(userId: string, exceptEmail: string): Promise<void> {
    await this.run('UPDATE user_emails SET is_verified = 0 WHERE user_id = ? AND email != ?', [userId, exceptEmail.toLowerCase()]);
  }
}
