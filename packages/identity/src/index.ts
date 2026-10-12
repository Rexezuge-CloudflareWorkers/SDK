/**
 * `@rexezuge/identity` — the account layer: the address is not the account.
 *
 * Converged from the seven repos that authenticate users (all but
 * ChordDHT-Tracker, whose callers are certificates). Durable-DAV's invariants
 * are the canonical ones because they are the strictest: the frozen anchor,
 * the verified-only registry, and the fail-closed resolution order.
 */

export { registerAccount, resolveAccount, resolveUserId } from './accountLookup.ts';
export type { AccountLookupDeps } from './accountLookup.ts';
export { applyIdentityMigrations, IDENTITY_MIGRATION_SQL, FRESH_MIGRATIONS, UPGRADE_MIGRATIONS } from './applyMigrations.ts';
export type { IdentityMigrationName } from './applyMigrations.ts';
export { IDENTITY_MIGRATIONS, UPGRADE_USER_IDENTITY, USERS_SCHEMA } from './migrations.ts';
export { newAccountId, newAnchor, summarize } from './ResolvedAccount.ts';
export type { AccountSummary, ResolvedAccount, UserRow, UserRowLike } from './ResolvedAccount.ts';
export { UserDAO } from './UserDAO.ts';
export { UserEmailDAO } from './UserEmailDAO.ts';
export type { EmailClaim, UserEmailRow } from './UserEmailDAO.ts';
export { UserIdentityService } from './UserIdentityService.ts';
export type { UserIdentityDeps, UserIdentityEnv } from './UserIdentityService.ts';
