# @rexezuge/i18n

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
