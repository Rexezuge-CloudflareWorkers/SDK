---
'@rexezuge/tooling': patch
---

The run-from-disk scripts compare `import.meta.url` against `pathToFileURL(process.argv[1])`, which **never matches under pnpm** — so every one of them exited 0 having printed nothing.

`process.argv[1]` is whatever the caller typed: `node_modules/@rexezuge/tooling/dist/scripts/check-god-files.js`, a **symlink** into the content-addressed store. `import.meta.url` is always the realpath, because the ESM resolver follows links. The two strings differ by exactly the symlink, the guard never fired, and the script below it never ran.

That is the worst shape a gate can fail in — it looks green. A consumer adopting `validate-locales` would have had a locale gate that passed with a key missing from eleven bundles, and one adopting `check-god-files` a god-file guard that reported nothing over the limit, both silently, on every run.

Found by AWS-AccessBridge, which swapped its own `validate_locales.ts` for this one and found the replacement stopped reporting the two failures the original reported on the same tree. It reproduces exactly:

```console
$ echo '{"common":{"save":"Speichern","__probe":"x"}}' > …/de/translation.json
$ node node_modules/@rexezuge/tooling/dist/scripts/validate-locales.js apps/web/src/locales
$ echo $?
1          # expected; a missing key in eleven bundles
```

Fixes all four guarded scripts — `check-god-files`, `spa-shell`, `validate-locales`,
`verify-migrations` — through one shared `isEntrypoint` helper, because a shared
helper is what makes the next script correct instead of a fifth copy of the same
comparison. It resolves **both** sides through `realpathSync`, and a path that
does not resolve is not the file that is running rather than a throw.

The three scripts that self-execute unconditionally (`ensure-spa-shell-stub`,
`prepare-wrangler-config`, `migrations-lock`) carry no guard and were never
affected.

`--tags`, the advisory severity model and the unused-key sweep from 1.8.0 are
unaffected and work as documented once the guard fires.
