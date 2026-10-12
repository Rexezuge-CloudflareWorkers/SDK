import { executableStatements } from '@rexezuge/d1';
import type { D1Queryable } from '@rexezuge/d1';
import { UPGRADE_USER_IDENTITY, USERS_SCHEMA } from './migrations.ts';

/**
 * The identity migrations this package ships, by filename. `IDENTITY_MIGRATIONS`
 * in `migrations.ts` carries the same pair with the reasoning; this map is the
 * executable form.
 */
const IDENTITY_MIGRATION_SQL = {
  'users.sql': USERS_SCHEMA,
  'upgrade-user-identity.sql': UPGRADE_USER_IDENTITY,
} as const;

type IdentityMigrationName = keyof typeof IDENTITY_MIGRATION_SQL;

/**
The full fresh-install order.
*/
const FRESH_MIGRATIONS: readonly IdentityMigrationName[] = ['users.sql'];

/**
A legacy database applies the upgrade after the fresh schema is in place.
*/
const UPGRADE_MIGRATIONS: readonly IdentityMigrationName[] = ['users.sql', 'upgrade-user-identity.sql'];

/**
 * Apply the identity migrations to a D1 binding.
 *
 * Split and executed through `@rexezuge/d1` — the same statement splitter the
 * test helpers use — so a kit migration and an integration suite can never
 * disagree about where one statement ends. One `batch()` per file, matching
 * D1's own per-file apply, so a failure names its file.
 *
 * `upgrade: false` (the default) applies only the fresh-install schema. Pass
 * `upgrade: true` for a database whose `users` table predates the identity
 * columns; the upgrade file is rerunnable, so applying both is safe.
 */
async function applyIdentityMigrations(db: D1Queryable, options: { upgrade?: boolean } = {}): Promise<void> {
  const names = options.upgrade === true ? UPGRADE_MIGRATIONS : FRESH_MIGRATIONS;
  for (const name of names) {
    const statements = executableStatements(IDENTITY_MIGRATION_SQL[name]);
    if (statements.length === 0) continue;
    if (db.batch) {
      await db.batch(statements.map((sql) => db.prepare(sql)));
      continue;
    }
    for (const sql of statements) {
      await db.prepare(sql).run();
    }
  }
}

export { applyIdentityMigrations, IDENTITY_MIGRATION_SQL, FRESH_MIGRATIONS, UPGRADE_MIGRATIONS };
export type { IdentityMigrationName };
