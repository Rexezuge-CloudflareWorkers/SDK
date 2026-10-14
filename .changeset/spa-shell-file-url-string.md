---
'@rexezuge/tooling': patch
'@rexezuge/errors': patch
'@rexezuge/shared': patch
'@rexezuge/d1': patch
'@rexezuge/http': patch
'@rexezuge/i18n': patch
'@rexezuge/identity': patch
'@rexezuge/runtime': patch
---

Fixed `spaShellEmbedPlugin` silently skipping the SPA shell when `root` or
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
