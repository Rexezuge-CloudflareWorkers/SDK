import { randomUUID } from 'node:crypto';

/**
 * `users` rows — the stored form of an account.
 *
 * Converged from `backend-data/src/dao/UserDAO.ts` + its `UserRow` (identical in
 * six of the seven identity-carrying repos; AWS and ChordDHT keep only the
 * id/email core).
 *
 * `id` is the stable account key. `email` is the *anchor*: an immutable value
 * that legacy `*_email` foreign keys resolve against, so history stays
 * resolvable across an address change. `current_email` is the address the
 * account signs in with and the one APIs report.
 */
export interface UserRow {
  id?: string | null;
  /**
   * The frozen anchor address. Never updated — it is the foreign-key target
   * every legacy `*_email` value resolves against, and rewriting it would
   * cascade the rows that reference it. Read `current_email` for sign-in.
   */
  email: string;
  /**
   * Mutable sign-in address. Absent on a pre-identity database, where `email`
   * *is* the sign-in address; read it as `current_email ?? email`.
   */
  current_email?: string | null;
  created_at: number;
  username: string | null;
  updated_at: number | null;
}

/**
 * A resolved account.
 *
 * `id` is the only value that should be used as an identity. `email` is the
 * address the account currently signs in with; `anchorEmail` is the immutable
 * value legacy columns store, and is what a pre-identity row can still be
 * matched on.
 */
export interface ResolvedAccount {
  id: string;
  email: string;
  anchorEmail: string;
  username: string | null;
}

/** The denormalized subset routes and the permission path use. */
export type AccountSummary = Pick<ResolvedAccount, 'id' | 'email' | 'username'>;

/** Shape every `users` read has, whether or not the identity migration has run. */
export type UserRowLike = Pick<UserRow, 'id' | 'email' | 'current_email' | 'username'> | null;

/** Project a `users` row onto a `ResolvedAccount`. */
export function summarize(row: UserRowLike): ResolvedAccount | null {
  return row?.id
    ? { id: row.id, email: (row.current_email ?? row.email).toLowerCase(), anchorEmail: row.email, username: row.username ?? null }
    : null;
}

/**
 * The opaque account id.
 *
 * Prefixed so an id is never mistaken for an address in a log line or a URL,
 * and random at 128 bits so accounts are not enumerable.
 */
export function newAccountId(): string {
  return `usr_${randomUUID().replaceAll('-', '')}`;
}

/**
 * Opaque anchor for an account whose login address is already held as another
 * account's anchor.
 *
 * It must be globally unique and must never be a real address: `email` is the
 * anchor every legacy `*_email` foreign key resolves against, so an address
 * parked here could never be re-registered by a different person after its
 * original account moved off it. `.invalid` is reserved by RFC 2606 and can
 * never be delivered to, so it can never authenticate either.
 */
export function newAnchor(): string {
  return `anchor-${randomUUID().replaceAll('-', '')}@users.invalid`;
}
