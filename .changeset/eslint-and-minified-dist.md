---
'@rexezuge/d1': minor
'@rexezuge/errors': minor
'@rexezuge/http': minor
'@rexezuge/i18n': minor
'@rexezuge/identity': minor
'@rexezuge/runtime': minor
'@rexezuge/shared': minor
'@rexezuge/tooling': minor
'@rexezuge/web': minor
---

Add a root ESLint gate and ship minified `dist` JavaScript.

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
