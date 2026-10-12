import { BadRequestError } from '@rexezuge/errors';
import type { D1Queryable } from '@rexezuge/d1';
import { isValidEmailFormat } from '@rexezuge/shared';
import { TimestampUtil } from '@rexezuge/shared';
import { registerAccount, resolveAccount } from './accountLookup.ts';
import type { AccountLookupDeps } from './accountLookup.ts';
import { newAnchor, summarize } from './ResolvedAccount.ts';
import type { ResolvedAccount } from './ResolvedAccount.ts';
import { UserDAO } from './UserDAO.ts';
import { UserEmailDAO } from './UserEmailDAO.ts';

interface UserIdentityEnv {
  DB: D1Queryable;
}

export type { UserIdentityEnv };

/**
 * Injected DAO factories. All optional: each defaults to a real DAO over the
 * same D1 binding, so tests override only what they need.
 */
export type UserIdentityDeps = Partial<AccountLookupDeps>;

/**
 * The account behind an address, plus the address-change operations.
 *
 * Converged from `backend-services/src/identity/UserIdentityService.ts`
 * (identical in Durable-DAV, Durable-DAV-Router, Edge-Git, Mail-Otter; AWS and
 * Mail-Meow keep the resolve core). Canonical names merge the two spellings the
 * repos used — `resolveUserById` (Durable-DAV family) and
 * `resolveAccountById` (AWS) are one method, `resolveAccountById`.
 *
 * The instance is one per request scope: the ownership and permission paths
 * resolve the same caller several times each, and a per-instance address memo
 * costs one query per request rather than one per comparison. Bind it once in
 * the composition root and share it — constructing per consumer is the bug the
 * memo exists to prevent.
 *
 * Resolution itself lives in `accountLookup` (free functions, shared with any
 * account bootstrap); this class adds memoization and the change operations.
 */
export class UserIdentityService {
  private readonly deps: Required<AccountLookupDeps>;

  private readonly byEmail = new Map<string, ResolvedAccount | null>();

  public constructor(env: UserIdentityEnv, deps: UserIdentityDeps = {}) {
    this.deps = {
      userDAO: () => Promise.resolve(new UserDAO(env.DB)),
      userEmailDAO: () => Promise.resolve(new UserEmailDAO(env.DB)),
      ...deps,
    };
  }

  /**
   * Resolve a sign-in address to its account, or null when unknown.
   *
   * Only a verified address resolves. A revoked address (changed away from) is
   * retained so pre-change rows stay attributable, but it must never
   * authenticate, otherwise a reassigned address would inherit the previous
   * holder's account.
   */
  public async resolveAccount(email: string): Promise<ResolvedAccount | null> {
    const key = email.trim().toLowerCase();
    if (!isValidEmailFormat(key)) return null;
    if (this.byEmail.has(key)) return this.byEmail.get(key) ?? null;
    const resolved = await resolveAccount(this.deps, key);
    this.byEmail.set(key, resolved);
    return resolved;
  }

  /** Account id for a sign-in address, or null when unknown. */
  public async resolveAccountId(email: string): Promise<string | null> {
    const account = await this.resolveAccount(email);
    return account?.id ?? null;
  }

  /**
   * Account behind a stable key. The inverse direction, for a caller that
   * already holds one (a resource owner) and needs the current address.
   */
  public async resolveAccountById(userId: string): Promise<ResolvedAccount | null> {
    const userDAO = await this.deps.userDAO();
    const row = await userDAO.getById(userId);
    return summarize(row);
  }

  /**
   * Resolve-or-create, for a login path that may see a first-time user.
   *
   * Returns null when the address exists but cannot be resolved (a revoked
   * address) — a caller that needs "guaranteed account" must distinguish that
   * from "created now" through its own route, because silently registering on a
   * revoked address would hand the previous holder's history to the new one.
   */
  public async resolveOrRegister(email: string, now = TimestampUtil.getCurrentUnixTimestampInSeconds()): Promise<ResolvedAccount | null> {
    const existing = await this.resolveAccount(email);
    if (existing) return existing;
    const key = email.trim().toLowerCase();
    // The anchor is the address itself whenever it is free. When it is already
    // held as another account's anchor — its previous holder moved off it — the
    // opaque-anchor retry is what lets a released address be used again.
    const account = (await registerAccount(this.deps, key, key, now)) ?? (await registerAccount(this.deps, key, newAnchor(), now));
    this.byEmail.set(key, account);
    return account;
  }

  /**
   * Every address known for an account, verified ones first.
   */
  public async listAddresses(userId: string): Promise<Array<{ email: string; isVerified: boolean }>> {
    const emailDAO = await this.deps.userEmailDAO();
    const rows = await emailDAO.listByUserId(userId);
    return rows.map((row) => ({ email: row.email, isVerified: row.is_verified === 1 }));
  }

  /**
   * Point an account at a new sign-in address.
   *
   * The account id, the frozen anchor, and every id-keyed row are untouched:
   * only which address authenticates the account moves. The previous address is
   * revoked rather than deleted, so rows written before the change still resolve
   * to this account, and it is released for a later legitimate holder.
   *
   * Rejects an address already verified for another account. That check is the
   * whole reason this is not simply an `UPDATE`: an unverified change would let
   * anyone claim an address and inherit its history.
   *
   * Order is load-bearing, and it is the one the ops CLI (`change-email.ts`)
   * already gets right: claim first, move `current_email` second, revoke third.
   * Inverting it opens a window in which nothing authenticates if a later step
   * fails.
   */
  public async setPrimaryEmail(
    userId: string,
    newEmail: string,
    now = TimestampUtil.getCurrentUnixTimestampInSeconds(),
  ): Promise<ResolvedAccount> {
    const email = newEmail.trim().toLowerCase();
    if (!isValidEmailFormat(email)) throw new BadRequestError('Invalid email address');
    const userDAO = await this.deps.userDAO();
    const emailDAO = await this.deps.userEmailDAO();
    const row = await userDAO.getById(userId);
    if (!row?.id) throw new BadRequestError('User not found');
    const current = (row.current_email ?? row.email).toLowerCase();
    if (current === email) {
      return { id: row.id, email, anchorEmail: row.email, username: row.username ?? null };
    }
    const holder = await emailDAO.resolveVerified(email);
    if (holder && holder.user_id !== row.id) throw new BadRequestError('Email is already in use');
    await emailDAO.register({ email, userId: row.id, isVerified: true, now });
    await userDAO.setCurrentEmail(row.id, email, now);
    // Revoke every other verified address, so only the new one authenticates.
    await emailDAO.revokeAllVerified(row.id, email);
    this.byEmail.delete(current);
    this.byEmail.set(email, { id: row.id, email, anchorEmail: row.email, username: row.username ?? null });
    return { id: row.id, email, anchorEmail: row.email, username: row.username ?? null };
  }

  /**
   * Ops/migration path: attach an address that has already been proven, without
   * making it the sign-in address.
   */
  public async linkVerifiedEmail(userId: string, email: string, now = TimestampUtil.getCurrentUnixTimestampInSeconds()): Promise<void> {
    const address = email.trim().toLowerCase();
    if (!isValidEmailFormat(address)) throw new BadRequestError('Invalid email address');
    const emailDAO = await this.deps.userEmailDAO();
    const outcome = await emailDAO.register({ email: address, userId, isVerified: true, now });
    if (outcome === 'already-claimed') throw new BadRequestError('Email is already in use');
  }
}
