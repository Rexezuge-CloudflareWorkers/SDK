/**
 * The canonical `users` / `user_emails` schema.
 *
 * Converged from migration `0001_init.sql` + `0004_user_identity.sql` across the
 * identity-carrying repos, expressed as the *final* shape so a fresh database
 * never has to be upgraded: `users.id` is the account key from the start, and
 * `user_emails` exists from the start.
 *
 * The invariants that make an address change safe (Durable-DAV's design, which
 * is the strictest in the family and the one every other repo's upgrade is
 * migrating toward):
 *
 * - `users.id` is an opaque, unique account key — never an address.
 * - `users.email` is the **frozen anchor**: immutable, the foreign-key target
 *   every legacy `*_email` value resolves against, so history survives a change.
 * - `users.current_email` is the mutable sign-in address; unique, so an address
 *   can never be claimed by two accounts.
 * - `users.username` is a separately-mutable public handle, not the identity.
 * - `user_emails` is the address registry: `is_verified = 1` may authenticate;
 *   a changed-from address stays at `0` (attributable, non-authenticating) and
 *   is re-pointable by a later claimant.
 *
 * The anchor design is forced on D1: it honours neither
 * `PRAGMA foreign_keys = off` nor `legacy_alter_table`, and `defer_foreign_keys`
 * does not suppress `ON DELETE CASCADE`, so a live reference cannot be repointed
 * without losing rows. A fresh install just starts with the anchor in place.
 *
 * A repo with legacy tables that reference `users(email)` applies this file's
 * statements and then adds its own additive backfill (the converged pattern is
 * in `upgrade-user-identity.sql`), repointing each legacy column through
 * `user_emails` rather than through the anchor.
 */
const USERS_SCHEMA = `
-- The account. The anchor (email) is immutable; current_email is the login.
CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  current_email TEXT NOT NULL UNIQUE,
  username TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_email ON users(current_email);

-- The address registry: which account an address authenticates.
CREATE TABLE IF NOT EXISTS user_emails (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user ON user_emails(user_id);
`;

/**
 * The additive upgrade for a database whose `users` predates the identity
 * columns — converged from `0004_user_identity.sql` (Durable-DAV) with the
 * table-specific phases (dav_volumes, namespaces) generalized into a
 * documented extension point, because every repo's legacy tables differ.
 *
 * Run order per phase matches Durable-DAV's, and each backfill is guarded so
 * the file is rerunnable: `users.id` is only filled where still missing, and
 * every registry insert is `INSERT OR IGNORE`.
 *
 * Why the address stays in `users` at all (the anchor question, answered once):
 * SQLite rewrites a child's foreign key clause when the parent is renamed and
 * drops the parent by cascading, so the reference from a legacy
 * `owner_email`-style column cannot be repointed at `users.id` without losing
 * rows. Keeping `email` as a frozen anchor sidesteps the rebuild entirely:
 * this migration is purely additive.
 *
 * A consumer with its own legacy tables appends one additive phase per table:
 * add the `*_user_id` column with `REFERENCES users(id) ON DELETE CASCADE`
 * (`NO ACTION` would *restrict* where the existing `owner_email` cascade
 * removed rows — the two references must cascade together), backfill it by
 * resolving the stored address through `user_emails`, and index it.
 */
const UPGRADE_USER_IDENTITY = `
-- Phase 1: stable account key.
-- SQLite cannot add a PRIMARY KEY column, so the id is a plain column with a
-- unique index. A unique index is a valid foreign key parent, which is all the
-- user_id references need.
ALTER TABLE users ADD COLUMN id TEXT;

UPDATE users SET id = 'usr_' || lower(hex(randomblob(16))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- Phase 2: mutable sign-in address.
-- 'email' stays as the frozen anchor; 'current_email' is what the account signs
-- in with and what the API reports. Uniqueness is enforced here, so an address
-- can never be claimed by two accounts.
ALTER TABLE users ADD COLUMN current_email TEXT;

UPDATE users SET current_email = lower(email) WHERE current_email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_email ON users(current_email);

-- Phase 3: address registry.
-- Login resolution consults is_verified = 1 only. Backfilled from the frozen
-- anchor address of every existing account, lowercased so a legacy mixed-case
-- row still yields exactly one login identity.
CREATE TABLE IF NOT EXISTS user_emails (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user ON user_emails(user_id);

INSERT OR IGNORE INTO user_emails (email, user_id, is_verified, created_at)
SELECT lower(email), id, 1, created_at FROM users;
`;

/**
 * Every migration this package ships, in apply order.
 *
 * `upgrade-user-identity.sql` is *not* applied on a fresh database — the
 * fresh-install path is `users.sql` alone, and the upgrade exists only for a
 * legacy one.
 */
const IDENTITY_MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: '0001_users.sql', sql: USERS_SCHEMA },
  { name: '0002_upgrade_user_identity.sql', sql: UPGRADE_USER_IDENTITY },
];

export { IDENTITY_MIGRATIONS, UPGRADE_USER_IDENTITY, USERS_SCHEMA };
