# AGENTS.md

pnpm workspace (`pnpm@11.2.2`, Node 24 per CI). Eight public packages in
`packages/` (`errors`, `runtime`, `shared`, `i18n`, `d1`, `identity`, `web`,
`tooling`, all `@rexezuge/*`) plus private `codemods/` (`@rexezuge/sdk-codemods`).

## Commands

- `pnpm install` then `pnpm run checks` (`build && typecheck && test`, all
  recursive via `pnpm -r --if-present`). CI (`ci.yml`) runs exactly these three,
  in this order — keep the order.
- Per package: `pnpm --filter @rexezuge/<name> <build|typecheck|test>`.
- Single file: `pnpm --filter @rexezuge/<name> exec vitest run src/<file>`.
- No root eslint config and lint is **not** a CI gate; do not add one.

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
  `minor` for features, `major` for breaking). Highest bump wins; all eight move
  together.
- Flow: merge PRs with changesets → merge the automated `CHORE: Version Packages vX.Y.Z`
  PR (opened by `version.yml` running `pnpm version-packages`, which stamps the
  new lockstep version into the title and closes superseded version PRs) → `Publish`
  workflow runs on `main` push and executes `pnpm changeset publish` (`pnpm release`).
  Never `pnpm -r publish`: without a version bump the registry already holds the
  local version and pnpm no-ops with `There are no new packages that should be
  published`.
