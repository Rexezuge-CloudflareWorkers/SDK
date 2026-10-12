# @rexezuge/tooling

## 1.5.2

### Patch Changes

- @rexezuge/d1@1.5.2

## 1.5.1

### Patch Changes

- cbbffa1: Fix `defineRepoLintConfig` ordering: the sonarjs `recommended` preset was assembled between `UNICORN_RULES` and the rules it relaxes, re-enabling six deliberate family offs (`void-use`, `different-types-comparison`, `use-type-alias`, `redundant-type-aliases`, `no-nested-assignment`, `no-all-duplicated-branches`) as errors in every consumer. Both presets now assemble before the off-blocks.
- @rexezuge/d1@1.5.1

## 1.5.0

### Patch Changes

- @rexezuge/d1@1.5.0

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

### Patch Changes

- Updated dependencies [60a53e7]
  - @rexezuge/d1@1.4.0

## 1.3.0

### Minor Changes

- 4c5342c: Make the published `dist` Node-importable and let the config factories express
  every family layout, so all nine repos can adopt them with no per-repo fork.

  **Node-importable `dist`.** Every package now builds with
  `rewriteRelativeImportExtensions` and writes its relative imports with explicit
  `.ts`/`.tsx` extensions, so `tsc` emits `./x.js` — the extensionless
  `./x` specifiers Node's ESM loader rejects are gone from the whole kit, not
  just `tooling`. `dist/eslint.js` (and every other entry) imports under plain
  Node again, which unblocks `defineRepoLintConfig` in consumers. The six
  ESLint plugin packages the lint factory imports are now declared
  `peerDependencies`, so a consumer install carries them.

  **Family-superset boundaries.** `layerBans()` covers the union across all nine
  repos — `provider-clients`, `webdav`/`dav-store`, `git-protocol`/`git-service`
  — plus a per-client `apps/api` alternative (`backend-services`,
  `webdav` + background RPC, `git-protocol` + background RPC). A repo without a
  domain package never triggers its ban, so no repo needs `extraLayers` for a
  known package.

  **Composable vitest core.** New `workspaceAliases()` (`vitest-aliases`)
  generates the `@scope/* → src` table plus the `cloudflare:*` mocks and the
  `@/`/`~/` prefixes from `scope`; `KIT_NO_EXTERNAL` keeps `@rexezuge/*` inside
  Vite's pipeline by default. `defineUnitVitestConfig` and
  `defineWebVitestConfig` accept `scope`, `packages`, `mocks`, `include`,
  `exclude`, `setupFiles`, `serverDepsInline` and `noExternal`, and the web
  factory accepts `environment: 'jsdom' | 'happy-dom'` with `@/` + `~/` both
  meaning the SPA. New `defineRepoVitestConfig` (`vitest-repo`) composes the two
  halves as `projects` in one file with one root coverage gate, and new
  `defineIntegrationVitestConfig` (`vitest-integration`) covers the workerd
  suites (plugin/pool/defines pass through) and the `node:sqlite` shape.

### Patch Changes

- @rexezuge/d1@1.3.0

## 1.2.0

### Patch Changes

- @rexezuge/d1@1.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [b5f52a8]
  - @rexezuge/d1@1.1.0

## 1.0.9

### Patch Changes

- @rexezuge/d1@1.0.9

## 1.0.8

### Patch Changes

- Updated dependencies [fb7f5b2]
  - @rexezuge/d1@1.0.8

## 1.0.7

### Patch Changes

- ec1f306: Adopt the family's Prettier configuration (`.prettierrc`, `.prettierignore`, `.editorconfig`) and reformat the repository to match. `pnpm run format` rewrites in place; `pnpm run format:check` is the CI gate and the only one of the two that fails rather than repairing. The published `dist/` output is byte-identical — this is formatting and tooling only.
- Updated dependencies [ec1f306]
  - @rexezuge/d1@1.0.7

## 1.0.6

### Patch Changes

- 6502598: Fix file-system race conditions in spa-shell stub creation and migration lock writes: use atomic exclusive creation and read without pre-check.
- @rexezuge/d1@1.0.6

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
