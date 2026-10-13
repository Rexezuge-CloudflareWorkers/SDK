---
'@rexezuge/tooling': patch
---

Re-export `KIT_DEDUPE` and `KIT_NO_EXTERNAL` from the `/vitest` sub-barrel.

Both were on the package root only, while `defineUnitVitestConfig` — the factory
in that sub-barrel — already used both internally. So a consumer configuring
**Vite** reached for `@rexezuge/tooling/vitest`, the natural path for the same
resolver constants, and the SPA build died at config-load with
`does not provide an export named 'KIT_DEDUPE'`.

Found by Edge-Sonic, which adopts both `defineUnitVitestConfig` and a Vite
config. It cannot have been caught by this package's own suite: the constants are
imported _into_ `vitest.ts`, so they resolve for every test here regardless of
what the barrel exports to a consumer. The failure is a packaging one, and it
survives until someone installs the tarball instead of running the working tree.

This is the same class as shipping `src/` in `files` while the exports map made
it unreachable — a capability the package documents and does not deliver.
