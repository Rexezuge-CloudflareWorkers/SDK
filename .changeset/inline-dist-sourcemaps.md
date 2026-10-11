---
'@rexezuge/errors': patch
'@rexezuge/shared': patch
'@rexezuge/i18n': patch
'@rexezuge/runtime': patch
'@rexezuge/d1': patch
'@rexezuge/identity': patch
'@rexezuge/web': patch
'@rexezuge/tooling': patch
---

No API change. The published `dist` ships `.js.map` files whose `sources`
point at `../src/*.ts`, but the tarballs carry only `dist/` — so every
consumer that loads the dist through a sourcemap-aware tool (Vitest, Vite's
dep scanner) prints "points to missing source files" for each module.
`inlineSources` puts the source text into the maps themselves, which makes
them self-contained: the warnings disappear and a stack trace into kit code
now shows kit lines instead of a bare path.
