# @rexezuge/identity

Account layer with address resolution, user DAOs, and canonical identity migrations.

Depends on `@rexezuge/d1` (persistence + statement splitter), `@rexezuge/errors`, and `@rexezuge/shared` (email normalization).

```bash
pnpm add @rexezuge/identity
```

---

## 1. The invariant: the address is not the account

A login address can move between accounts, so resolution goes through the verified `user_emails` registry — never the mutable address string — and a revoked row resolves to nothing. The only safe fall-through is a database whose identity migration has not run yet (`isMissingSchemaError`); every other D1 failure rethrows, because a transient error answered with the wrong account is a full cross-account read.

```ts
import { resolveAccount, type AccountLookupDeps } from '@rexezuge/identity';

const account = await resolveAccount(deps, 'user@example.com'); // ResolvedAccount | null
```

`UserIdentityService` is the stateful service over the same rules (register, verify, resolve); the free functions exist so account bootstrap and the service share one implementation.

## 2. DAOs

| Export                         | Role                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `UserDAO`                      | `users` table: frozen anchor id, lookup by id/anchor/email |
| `UserEmailDAO`                 | `user_emails` registry: claims, verification, revocation   |
| `newAccountId` / `newAnchor`   | ID generation for new accounts                             |
| `summarize` / `AccountSummary` | safe-to-log account projection                             |

```ts
import { UserDAO, UserEmailDAO } from '@rexezuge/identity';

const users = new UserDAO(env.DB);
const emails = new UserEmailDAO(env.DB);
await users.getById(account.id);
```

## 3. Migrations

```ts
import { applyIdentityMigrations } from '@rexezuge/identity';

await applyIdentityMigrations(env.DB); // fresh install: users.sql
await applyIdentityMigrations(env.DB, { upgrade: true }); // legacy DB: + upgrade-user-identity.sql (rerunnable)
```

Executed through `@rexezuge/d1`'s splitter — one `batch()` per file, matching D1's own per-file apply, so a failure names its file. `IDENTITY_MIGRATIONS` / `IDENTITY_MIGRATION_SQL` carry the same pair as data for repos that apply migrations through their own runner. The upgrade backfills a verified registry row for every anchor, which is what lets pre-identity databases resolve addresses the old way until they migrate.

---

## Verifying this package

```bash
pnpm --filter @rexezuge/identity exec tsc -p tsconfig.json
pnpm --filter @rexezuge/identity typecheck
pnpm --filter @rexezuge/identity test
```
