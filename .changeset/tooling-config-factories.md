---
'@rexezuge/tooling': minor
---

Make the published `dist` Node-importable and let the config factories express
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
