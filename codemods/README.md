# @rexezuge/sdk-codemods

Mechanical migration for consumer repos: **the kit follows the best design;
your repo adapts, and these scripts do the adapting.**

## What ships

| Module | Job |
|---|---|
| `rename-imports.ts` | `@your-scope/backend-errors` → `@rexezuge/errors`, `shared/utils` → `@rexezuge/shared`, `shared/i18n` → `@rexezuge/i18n`, `backend-data/utils` → `@rexezuge/d1`, `backend-data/dao/UserDAO` → `@rexezuge/identity`, … |
| `rename-symbols.ts` | Call/construction/import sites of the drifted names → the kit's canonical ones (`withRetry`→`run`, `firstWithRetry`→`first`, `AppConfig`/`ConfigurationManager`→`AppConfiguration`, `Provider`/`ServiceContext`→`RequestScope`, `resolveUserById`→`resolveAccountById`, …) |
| `mapping.ts` | Both tables, in one place. A rename absent from here is deliberate — the kit kept the source spelling. |
| `adopt.ts` | The orchestrator: walks the repo, applies both transforms, reports. |

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

## Safety properties, tested in `codemods.test.ts`

- A mapped-but-unknown subpath is **reported**, never silently skipped or
  guessed past the table (that is how a half-migrated repo typechecks green
  with one stale path left).
- Symbol renames touch *callees* only: `this.withRetry(`, `new AppConfig(`,
  `import { AppConfig }`. A same-named object property, a string literal
  containing `this.withRetry(`, or an unrelated identifier is left alone
  (negative lookbehind on the quote character).
- Everything runs over the consumer's `.ts/.tsx/.mts/.cts` outside
  `node_modules`/`dist`/`coverage`.

## Adding a mapping

Add a row to the table in `mapping.ts` and a case to `codemods.test.ts`. The
test suite is the contract: a rename without a test is a rename nobody can
trust when the consumer repo runs `--write` on 500 files.
