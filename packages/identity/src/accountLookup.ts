import { isMissingSchemaError } from '@rexezuge/d1';
import { summarize } from './ResolvedAccount.ts';
import type { ResolvedAccount } from './ResolvedAccount.ts';
import { UserDAO } from './UserDAO.ts';
import { UserEmailDAO } from './UserEmailDAO.ts';

/**
 * Injected DAO factories. All optional: each defaults to a real DAO over the
 * same D1 binding, so tests override only what they need.
 */
export interface AccountLookupDeps {
  userDAO: () => Promise<UserDAO>;
  userEmailDAO: () => Promise<UserEmailDAO>;
}

/**
 * Address -> account resolution, as free functions so the service and any
 * higher-level account bootstrap share one implementation instead of
 * re-deriving the query.
 *
 * Converged from `backend-services/src/user/accountLookup.ts` (identical in
 * Durable-DAV, Durable-DAV-Router, Edge-Git, Mail-Otter).
 */
export async function resolveAccount(deps: AccountLookupDeps, email: string): Promise<ResolvedAccount | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const userDAO = await deps.userDAO();
  // A known address is authoritative: the registry says which account it belongs
  // to, and a *revoked* row (the account moved off this address) must not
  // resolve at all. Falling through to the legacy lookups in that case would let
  // a reassigned address keep authenticating the previous holder's account.
  //
  // Only a *missing registry* falls through, and "missing" means one specific
  // thing: the identity migration has not run. The previous
  // `.catch(() => null)` answered that question for **every** failure, so a
  // transient D1 error on this one statement made the code proceed to the anchor
  // lookup below — `getByEmail`, which is an attribution lookup whose key is a
  // re-registrable string, not an identity. An address whose account had moved
  // off it (so its `user_emails` row is revoked, and correctly refuses to
  // resolve) would then be resolved against the *previous holder's* anchor, and
  // that account's id was installed as the caller's identity: full access to
  // someone else's rows from one failed `SELECT`.
  //
  // So the degradation is narrowed to `isMissingSchemaError`, and everything
  // else rethrows.
  // The `null` in the `catch` answers the same question the DAO's own `null`
  // answers — no row — so the two branches below share one type. When this read
  // returned `undefined` on success and `null` on a missing schema, the widened
  // union had to be narrowed by truthiness at a point that had nothing to do
  // with which branch it came from.
  const registered = await deps
    .userEmailDAO()
    .then((dao) => dao.get(normalized))
    .catch((error: unknown) => {
      if (isMissingSchemaError(error)) return null;
      throw error;
    });
  if (registered) {
    return registered.is_verified === 1 ? summarize(await userDAO.getById(registered.user_id)) : null;
  }
  // No registry row at all. Safe to fall through: the identity migration
  // backfilled a verified row for every anchor, so a row-less address is either
  // new or on a pre-identity database, where the address *is* the anchor.
  //
  // No `.catch` on either: a failed `users` read is an outage, and reporting it
  // as "no such account" would turn a D1 blip into a 404 and a spurious
  // re-registration attempt.
  const byCurrent = await userDAO.getByCurrentEmail(normalized);
  const legacy = byCurrent ?? (await userDAO.getByEmail(normalized));
  return summarize(legacy);
}

/**
Account id for a sign-in address, or null when unknown.
*/
export async function resolveUserId(deps: AccountLookupDeps, email: string): Promise<string | null> {
  const account = await resolveAccount(deps, email);
  return account?.id ?? null;
}

/**
 * Insert an account and claim its sign-in address.
 *
 * The anchor is the address itself whenever it is free, which keeps new rows
 * shaped like the pre-identity ones. It falls back to an opaque anchor only when
 * the address is already held as another account's anchor — i.e. its previous
 * holder moved off it — so a released address is never permanently unusable.
 *
 * Returns null when the insert could not produce a *new* account holding this
 * address, which is the caller's signal to retry with a different anchor.
 *
 * The read-back is load-bearing, not defensive. `createUser` is
 * `ON CONFLICT(email) DO NOTHING`, so when the anchor is already taken the
 * insert is silently a no-op and the generated `id` belongs to nobody. Trusting
 * it would (a) re-point the address registry at a phantom account that resolves
 * to nothing, permanently stranding the address, and (b) on the opaque-anchor
 * retry, hand the caller an account whose address the registry refuses to
 * re-point because the phantom row already marked it verified. Re-reading the
 * anchor row and requiring *our* id to be the one there makes the no-op
 * detectable, so the retry gets a genuinely new account.
 */
export async function registerAccount(
  deps: AccountLookupDeps,
  loginEmail: string,
  anchor: string,
  now: number,
): Promise<ResolvedAccount | null> {
  const userDAO = await deps.userDAO();
  const created = await userDAO.createUser({ anchor, loginEmail, now });
  // `null` is the detected no-op: the anchor was already held. The caller's
  // signal to retry with an opaque anchor — see `newAnchor`.
  if (created === null) return null;
  // Claim the sign-in address *before* resolving, otherwise the fresh account is
  // invisible to the registry and registration looks like a failure. An address
  // already verified for another account is left alone by `register`, and the
  // resolve below then reports that account instead.
  await deps
    .userEmailDAO()
    .then((dao) => dao.register({ email: loginEmail, userId: created, isVerified: true, now }))
    .catch((error: unknown) => {
      // Pre-identity registry only, per the same rule `resolveAccount` follows: a
      // missing table is tolerated, a failed write is not. Swallowing the second
      // would return an account the address registry has never heard of, which
      // resolves to nothing on the next login.
      if (isMissingSchemaError(error)) return;
      throw error;
    });
  return resolveAccount(deps, loginEmail);
}
