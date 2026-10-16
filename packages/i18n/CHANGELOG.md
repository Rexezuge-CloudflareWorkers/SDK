# @rexezuge/i18n

## 1.9.1

No changes in this release.

## 1.9.0

No changes in this release.

## 1.8.2

### Patch Changes

- 35c82a1: Added `AbstractScheduledTask#describeFailure`, so a consumer can redact an
  error's message before it is persisted to its run-record table.

  The Template Method wrote `error instanceof Error ? error.message : String(error)`
  straight into `failRun`. That is right for a console log and wrong for a row a
  **user reads back**: task-run history is surfaced through an authenticated
  route, so a failure whose message carries a bearer token, an OAuth token or a
  signed action URL writes credential material into the database and hands it to
  whoever loads that screen.

  The kit cannot do the redaction itself — `runtime` is the DI and platform layer
  and taking a dependency on the logging packages that carry those rules would
  invert the package graph — so the seam belongs here. Overriding it routes the
  value through the consumer's own redactor:

  ```ts
  protected override describeFailure(error: unknown): string {
    return ErrorSanitizationUtil.sanitizeErrorForLogging(error);
  }
  ```

  Without the seam the only options were to accept an unredacted persisted
  message or to keep a private copy of the whole Template Method. Five of the
  seven repos this file was converged from have exactly that redactor, so all five
  were carrying a duplicated base class.

## 1.8.1

### Patch Changes

- be338b5: Fixed `spaShellEmbedPlugin` silently skipping the SPA shell when `root` or
  `distIndex` was given as a **file-URL string**.

  Both options are typed `string | URL` and documented as "a file URL or a path",
  and `new URL('.', import.meta.url).href` — the first shape a config file reaches
  for — is a file-URL string. The internal normaliser ran `pathToFileURL` on it
  unconditionally, which treats its argument as a filesystem path and produces
  `file:///<cwd>/file:/srv/app`. Every path built on top of that resolves into a
  directory named after the scheme.

  The failure is not loud. The plugin prints `dist/index.html not found,
skipping` — which is also what a genuinely fresh checkout prints on its first
  build — and the consumer's worker then keeps serving the **previous** shell, so
  the SPA ships yesterday's JavaScript with nothing in the build log to explain
  it. `root` is also documented to default to `process.cwd()`, which under
  `pnpm --filter … build` is the _package_ directory rather than the repo root, so
  a consumer who relied on that default was already writing into the wrong tree.

  `root` and `distIndex` are now parsed when they are already a `file:` URL and
  converted only when they are genuine filesystem paths. Both spellings work, and
  three cases cover it.

## 1.8.0

No changes in this release.

## 1.7.2

No changes in this release.

## 1.7.1

No changes in this release.

## 1.7.0

No changes in this release.

## 1.6.1

No changes in this release.

## 1.6.0

No changes in this release.

## 1.5.2

No changes in this release.

## 1.5.1

No changes in this release.

## 1.5.0

No changes in this release.

## 1.4.0

### Minor Changes

- 60a53e7: Add a root ESLint gate and ship minified `dist` JavaScript.

  **ESLint.** New root `eslint.config.mjs` built on
  `@rexezuge/tooling`'s `defineRepoLintConfig` (the converged family config
  distilled from AWS-AccessBridge and the sibling repos), with `scope:
'@rexezuge'` and kit-specific `extraLayers` for this repo's dependency
  graph: `errors`, `shared`, `runtime` and `i18n` stay zero-dependency base
  layers, `d1` may only reach `errors` and `shared`, `identity` may only
  reach `d1`, `errors` and `shared`, `http` and `web` may only reach `errors`
  and `shared`, and `tooling` stays dependency-free except `d1`. `hono` and
  `chanfana` are banned outside `http`, and `react-i18next` is banned in
  `web` (labels are props, never `useTranslation`). `lint:check` joins the
  `checks` chain and CI as a gate.

  **Minified dist.** Every package builds with `tsc -p tsconfig.json &&
node ../../scripts/minify-dist.mjs`, so the published `dist/*.js` is
  esbuild-minified (ES2022, external sourcemaps kept) while `*.d.ts` is
  untouched. Smaller downloads and smaller Workers bundles for consumers,
  with no API change.

## 1.3.0

No changes in this release.

## 1.2.0

No changes in this release.

## 1.1.0

No changes in this release.

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

No changes in this release.

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
