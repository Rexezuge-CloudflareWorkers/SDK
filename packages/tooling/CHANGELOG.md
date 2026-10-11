# @rexezuge/tooling

## 1.0.5

### Patch Changes

- 55bef94: Fix script injection in retry-step action: pass max_attempts and delay via env instead of interpolating expressions into run.
- e757e96: Pin setup-env template pnpm/action-setup to immutable commit SHA to resolve CodeQL unpinned tag alert.
- @rexezuge/d1@1.0.5

## 1.0.4

### Patch Changes

- @rexezuge/d1@1.0.4

## 1.0.3

### Patch Changes

- 984ce73: No API change. The published `dist` ships `.js.map` files whose `sources`
  point at `../src/*.ts`, but the tarballs carry only `dist/` — so every
  consumer that loads the dist through a sourcemap-aware tool (Vitest, Vite's
  dep scanner) prints "points to missing source files" for each module.
  `inlineSources` puts the source text into the maps themselves, which makes
  them self-contained: the warnings disappear and a stack trace into kit code
  now shows kit lines instead of a bare path.
- Updated dependencies [984ce73]
  - @rexezuge/d1@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [aa4210b]
  - @rexezuge/d1@1.0.2

## 1.0.1

### Patch Changes

- e9f61f8: No behavior change. `eslint.ts` was 641 lines — over the kit's own hard
  god-file limit, which the kit must meet before it asks consumers to. Split
  into three cohesive modules: the layer table (`eslint-boundaries.ts`), the
  per-rule override blocks with their provenance comments (`eslint-rules.ts`),
  and the config assembly (`eslint.ts`, now 257 lines). Same config, same 82
  tests, one `asRules` assertion where ESLint's `RuleEntry` union is narrower
  than the data shape.
- @rexezuge/d1@1.0.1
