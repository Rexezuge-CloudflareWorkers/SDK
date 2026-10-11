# @rexezuge/tooling

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
