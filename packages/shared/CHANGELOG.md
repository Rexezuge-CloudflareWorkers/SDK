# @rexezuge/shared

## 1.0.9

No changes in this release.

## 1.0.8

No changes in this release.

## 1.0.7

### Patch Changes

- ec1f306: Adopt the family's Prettier configuration (`.prettierrc`, `.prettierignore`, `.editorconfig`) and reformat the repository to match. `pnpm run format` rewrites in place; `pnpm run format:check` is the CI gate and the only one of the two that fails rather than repairing. The published `dist/` output is byte-identical — this is formatting and tooling only.

## 1.0.6

No changes in this release.

## 1.0.5

No changes in this release.

## 1.0.4

### Patch Changes

- 3a09e1f: No behavior change. Two assertions in `TimestampUtil.test.ts` compared
  wall-clock reads against each other with `toBe` — `new SystemClock().now()`
  against `Date.now()` (CI caught this one: `expected 1791694464088 to be
1791694464089`) and `…InSeconds()` against a second `Date.now()` read. Two
  reads of a moving clock taken milliseconds apart are not the same number, so
  both now bracket the read (`before`/`after` bounds), matching the pattern and
  comment `Clock.test.ts` already uses for the same hazard.

## 1.0.3

### Patch Changes

- 984ce73: No API change. The published `dist` ships `.js.map` files whose `sources`
  point at `../src/*.ts`, but the tarballs carry only `dist/` — so every
  consumer that loads the dist through a sourcemap-aware tool (Vitest, Vite's
  dep scanner) prints "points to missing source files" for each module.
  `inlineSources` puts the source text into the maps themselves, which makes
  them self-contained: the warnings disappear and a stack trace into kit code
  now shows kit lines instead of a bare path.

## 1.0.2

### Patch Changes

- aa4210b: Add README and package description for every published package. Only `@rexezuge/tooling` had either, so the other seven npm pages rendered blank.

## 1.0.1

No changes in this release.
