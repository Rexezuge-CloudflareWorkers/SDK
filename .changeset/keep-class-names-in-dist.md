---
'@rexezuge/errors': patch
---

Fix: Keep Class Names In The Published `dist`

The esbuild step that minifies each package's `dist/` renames class and
function bindings, so `new NotFoundError().name` came back as `'t'` from the
published artifact. Nothing in the kit's own test run could see it, because
those tests import `src/`.

Two places let the mangling reach a consumer:

- `ServiceError` sets `this.name = new.target.name`, so every log line and
  stack frame carried a two-letter class name.
- `OutcomeError` derives its wire `type` from `new.target.name`, so
  `ProviderApiRetryableError` reported `Exception.Type: 't'` over the wire.
  `Exception.Type` is part of the public API contract, not just diagnostics.

`scripts/minify-dist.mjs` now passes `keepNames: true`. It costs a few bytes
and makes the published artifact behave like the source the tests cover.
