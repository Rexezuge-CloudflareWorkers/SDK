# @rexezuge/d1

## 1.0.9

### Patch Changes

- Updated dependencies [7c76159]
  - @rexezuge/errors@1.0.9
  - @rexezuge/shared@1.0.9

## 1.0.8

### Patch Changes

- fb7f5b2: `decryptSecret` now throws `AesGcmKeyError` — the error its own contract documents — on a wrong key or tampered ciphertext. A bare `rejects.toThrow()` in the suite let the platform's raw `OperationError: The operation failed for an operation-specific reason` escape as the behavior, so a consumer catching the documented type missed it and the one place it surfaced was a run's error message with nothing an owner could act on.
- @rexezuge/errors@1.0.8
  - @rexezuge/shared@1.0.8

## 1.0.7

### Patch Changes

- ec1f306: Adopt the family's Prettier configuration (`.prettierrc`, `.prettierignore`, `.editorconfig`) and reformat the repository to match. `pnpm run format` rewrites in place; `pnpm run format:check` is the CI gate and the only one of the two that fails rather than repairing. The published `dist/` output is byte-identical — this is formatting and tooling only.
- Updated dependencies [ec1f306]
  - @rexezuge/errors@1.0.7
  - @rexezuge/shared@1.0.7

## 1.0.6

### Patch Changes

- @rexezuge/errors@1.0.6
  - @rexezuge/shared@1.0.6

## 1.0.5

### Patch Changes

- @rexezuge/errors@1.0.5
  - @rexezuge/shared@1.0.5

## 1.0.4

### Patch Changes

- Updated dependencies [3a09e1f]
  - @rexezuge/shared@1.0.4
  - @rexezuge/errors@1.0.4

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
  - @rexezuge/errors@1.0.3
  - @rexezuge/shared@1.0.3

## 1.0.2

### Patch Changes

- aa4210b: Add README and package description for every published package. Only `@rexezuge/tooling` had either, so the other seven npm pages rendered blank.
- Updated dependencies [aa4210b]
  - @rexezuge/errors@1.0.2
  - @rexezuge/shared@1.0.2

## 1.0.1

### Patch Changes

- @rexezuge/errors@1.0.1
  - @rexezuge/shared@1.0.1
