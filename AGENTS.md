# AGENTS.md

pnpm workspace (`pnpm@11.2.2`, Node 24 per CI). Nine public packages in
`packages/` (`errors`, `runtime`, `shared`, `i18n`, `d1`, `identity`, `web`,
`http`, `tooling`, all `@rexezuge/*`) plus private `codemods/`
(`@rexezuge/sdk-codemods`).

## Commands

- `pnpm install` then `pnpm run checks`, which runs `build && typecheck && test && format:check`,
  all recursive via `pnpm -r --if-present`. CI (`ci.yml`) runs these four as four
  separate jobs — keep the order and the split.
- `pnpm run format` rewrites formatting in place; `pnpm run format:check` is the
  CI gate, and the only one of the two that fails instead of repairing.
- Per package: `pnpm --filter @rexezuge/<name> <build|typecheck|test>`.
- Single file: `pnpm --filter @rexezuge/<name> exec vitest run src/<file>`.
- No root eslint config and lint is **not** a CI gate; do not add one. Formatting
  is a separate Prettier gate and does not change that decision.

## Structure quirks

- Each package: `src/` + `tsconfig.json` (emits to `dist/`, excludes
  `*.test.ts`) + `tsconfig.test.json` (`noEmit`, includes tests). `build` is
  `tsc -p tsconfig.json`; `typecheck` covers source and tests.
- Cross-package imports (`@rexezuge/d1` → `errors`, `shared`;
  `identity` → `d1`, `errors`, `shared`; `web` → `errors`, `shared`) resolve
  to `dist/` via `workspace:*`. **Always `build` before `typecheck`/`test`
  after touching a dependency package**, or dependents test stale output.
- `@rexezuge/tooling` must stay dependency-free except its declared `@rexezuge/d1`
  dep (used only by `scripts/backup/encrypt-backup.ts`); its ESLint/vitest/vite
  factories take consumer repos as arguments and never encode kit paths.
- `@rexezuge/http` is the **one** package that carries framework dependencies
  (`hono`, `chanfana`). The other eight are framework-free on purpose, and that
  is what lets a consumer adopt `shared`/`errors`/`runtime` without adopting a
  web framework. Do not let a Hono type leak into the other eight.

## Null and undefined (load-bearing)

`null` means **absent**. `undefined` means **not supplied**. One convention, no
exceptions, because the alternative is every caller writing both `=== null` and
`!== undefined` checks and getting one of them silently wrong.

| Position                                 | Convention                                                     | Why                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| D1 layer (`BaseDAO.first`)               | `T \| null`                                                    | It is what `D1Result.first<T>()` returns; an adapter hands back what it was given rather than translating. |
| KV layer (`KvCache.get*`)                | `T \| null`                                                    | Same: `KVNamespace.get()` answers `Promise<string \| null>`.                                               |
| Service / domain layer                   | `T \| null` for "no answer"                                    | One vocabulary from the DAO up, so a DAO's shape never leaks past its own signature.                       |
| Optional argument                        | `arg?: T` — the caller may omit it                             | `undefined` is the value TS assigns to an omitted argument.                                                |
| Optional property on a _returned_ object | `prop?: T`, omitted rather than set to `undefined`             | An explicit `undefined` key serialises differently from an absent one; see `CursorCodec.page`.             |
| **Never**                                | `T \| null \| undefined`, or `?:` combined with `\| undefined` | No caller can narrow it, and every consumer invents its own narrowing.                                     |

Two exceptions, both deliberate and both carrying a comment at the site:

- `UserRow.current_email?: string | null` — a D1 column is genuinely _both_
  optional and nullable, so the type says exactly that.
- `UserRowLike = Pick<…> | null` — a row-or-absent union, because `summarize`
  accepts either and the caller should not have to rewrite it first.

**Never compare a result against `undefined`.** `null` does not equal it, so a
`=== undefined` check silently goes false and reads as "always present" — the
one direction that never looks like a bug. Use truthiness or `== null`.

## Compatibility rules (load-bearing)

- Direction is one-way: **the kit follows the best design; consumer repos adapt
  to it.** A rename that breaks consumers must still ship a migration path.
- Renames ship as codemod rows: add the mapping to `codemods/src/mapping.ts`
  **and** a case to `codemods.test.ts` (the suite is the contract; `adopt.ts`
  never edits `package.json` — dependency changes go through a human
  `pnpm install`).

## Releasing

- Packages version in lockstep via the `fixed` group in `.changeset/config.json`.
  Every PR touching `packages/*` must add one changeset file (`pnpm changeset`,
  `minor` for features, `major` for breaking). Highest bump wins; all nine move
  together.
- Flow: merge PRs with changesets → merge the automated `CHORE: Version Packages vX.Y.Z`
  PR (opened by `version.yml` running `pnpm version-packages`, which stamps the
  new lockstep version into the title and closes superseded version PRs) → `Publish`
  workflow runs on `main` push and executes `pnpm changeset publish` (`pnpm release`).
  Never `pnpm -r publish`: without a version bump the registry already holds the
  local version and pnpm no-ops with `There are no new packages that should be published`.
