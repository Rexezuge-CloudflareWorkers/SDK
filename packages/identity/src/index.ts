/**
 * `@rexezuge/identity` — the account layer: the address is not the account.
 *
 * Converged from the seven repos that authenticate users (all but
 * ChordDHT-Tracker, whose callers are certificates). Durable-DAV's invariants
 * are the canonical ones because they are the strictest: the frozen anchor,
 * the verified-only registry, and the fail-closed resolution order.
 */

export { registerAccount, resolveAccount, resolveUserId } from './accountLookup';
export type { AccountLookupDeps } from './accountLookup';
export { applyIdentityMigrations, IDENTITY_MIGRATION_SQL, FRESH_MIGRATIONS, UPGRADE_MIGRATIONS } from './applyMigrations';
export type { IdentityMigrationName } from './applyMigrations';
export { IDENTITY_MIGRATIONS, UPGRADE_USER_IDENTITY, USERS_SCHEMA } from './migrations';
export { newAccountId, newAnchor, summarize } from './ResolvedAccount';
export type { AccountSummary, ResolvedAccount, UserRow, UserRowLike } from './ResolvedAccount';
export { UserDAO } from './UserDAO';
export { UserEmailDAO } from './UserEmailDAO';
export type { EmailClaim, UserEmailRow } from './UserEmailDAO';
export { UserIdentityService } from './UserIdentityService';
export type { UserIdentityDeps, UserIdentityEnv } from './UserIdentityService';
