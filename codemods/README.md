# @rexezuge/sdk-codemods

Mechanical migration for consumer repos: **the kit follows the best design;
your repo adapts, and these scripts do the adapting.**

## What ships

| Module              | Job                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rename-imports.ts` | `@your-scope/backend-errors` → `@rexezuge/errors`, `shared/utils` → `@rexezuge/shared`, `shared/i18n` → `@rexezuge/i18n`, `backend-data/utils` → `@rexezuge/d1`, `backend-data/dao/UserDAO` → `@rexezuge/identity`, … |
| `rename-symbols.ts` | Call/construction/import sites of the drifted names → the kit's canonical ones (`withRetry`→`run`, `firstWithRetry`→`first`, `AppConfig`→`AppConfiguration`, `this.resolveUserById`→`this.resolveAccountById`, …)     |
| `mapping.ts`        | Both tables, in one place. A rename absent from here is deliberate — the kit kept the source spelling.                                                                                                                |
| `adopt.ts`          | The orchestrator: walks the repo, applies both transforms, reports.                                                                                                                                                   |

### Two scopes, because some names mean different things in different positions

Most renames apply everywhere — a `this.x(` call, a `new X(`, an import clause, and every later use. Some apply **only** to a member call site, and `mapping.ts` keeps them in a separate table (`IDENTITY_MEMBER_RENAMES`) for that reason:

| Source                                          | Position                      | Kit name             |
| ----------------------------------------------- | ----------------------------- | -------------------- |
| `resolveUserId(email)` on `UserIdentityService` | method                        | `resolveAccountId`   |
| `resolveUserById(id)` on `UserIdentityService`  | method                        | `resolveAccountById` |
| `resolveUserId(deps, email)` in `accountLookup` | free function — **unchanged** | `resolveUserId`      |

Running the first two through the import pass renamed the third's import into a symbol `@rexezuge/identity` does not export, so the build failed at module resolution rather than at review — the exact class of bug this split prevents.

## Usage

```bash
# 1. See what would change (writes nothing)
pnpm tsx src/adopt.ts /path/to/consumer --scope @my-app

# 2. Apply
pnpm tsx src/adopt.ts /path/to/consumer --scope @my-app --write

# 3. Add the kit packages, drop the copies, verify
pnpm add @rexezuge/errors @rexezuge/runtime @rexezuge/shared @rexezuge/d1
pnpm install
pnpm -r typecheck
```

The orchestrator deliberately never edits `package.json`: a dependency change
wants the human's `pnpm install` (and lockfile) in the loop.

## Repo-specific overrides (`--rules`)

The shipped tables describe the _family's_ divergence, and a few repos diverge for reasons that are permanent rather than pending. A product i18n bundle the kit has no keys for, or a `users` table carrying a column the kit's DAO does not model, is not a reason to fork the kit — so `--rules` takes a JSON file of departures and merges them over the tables:

```json
{
  "subpathRules": { "shared": { "/i18n": null } },
  "identityDaoSubpaths": { "/dao/UserDAO": null }
}
```

```bash
pnpm tsx src/adopt.ts /path/to/consumer --scope @my-app --rules ./kit-overrides.json --write
```

Every field is optional and every entry is a **merge**, not a replacement — the example above parks two specifiers locally and inherits every other row the kit ships. `null` parks a specifier; a string rewrites it. A malformed or missing file **fails the run** rather than falling back to the shipped tables, because a typo that silently degraded would rewrite the repo against a mapping the operator did not ask for and surface the mistake as unresolved imports several steps later.

Note that parking a _specifier_ does not park the _symbols_ under it: `getBackendStrings` still becomes `getLocalizedStrings` even when the bundle stays local, which is what keeps it from becoming a second dialect of the kit's vocabulary.

Full field list and merge semantics: `ConsumerRules` in `mapping.ts`.

## Safety properties, tested in `codemods.test.ts`

- A mapped-but-unknown subpath is **reported**, never silently skipped or
  guessed past the table (that is how a half-migrated repo typechecks green
  with one stale path left).
- Symbol renames touch _callees_ only: `this.withRetry(`, `new AppConfig(`,
  `import { AppConfig }`. A same-named object property, a string literal
  containing `this.withRetry(`, or an unrelated identifier is left alone
  (negative lookbehind on the quote character).
- Everything runs over the consumer's `.ts/.tsx/.mts/.cts` outside
  `node_modules`/`dist`/`coverage`.

## Adding a mapping

Add a row to the table in `mapping.ts` and a case to `codemods.test.ts`. The
test suite is the contract: a rename without a test is a rename nobody can
trust when the consumer repo runs `--write` on 500 files.
