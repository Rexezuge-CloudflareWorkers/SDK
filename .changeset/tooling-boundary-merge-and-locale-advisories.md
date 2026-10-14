---
'@rexezuge/tooling': minor
---

`defineRepoLintConfig` now keeps **every** ban for a directory, and
`validate-locales` gained the two application-side checks the script's
neighbours in this repo already had. The first is a defect that made the layer
table describe a gate that was not running.

## One config object per directory, not per layer

Flat config merges every matching config object and resolves each rule name by
**last entry wins** — so two entries with the same `files` glob do not
accumulate, the second replaces the first's rule outright. `restrictedImports`
emitted one entry per `LayerBan`, and `apps/api` carries four rows in the
canonical table: the DAO boundary plus one per direct-client package. Only the
last survived. The DAO ban and the `provider-clients` ban were silently dropped
in every consumer, and a consumer's own `extraLayers` entry for the same
directory overwrote the canonical one just as thoroughly.

`no-restricted-syntax` merges the same way, so the dynamic-`import()` guard had
the identical hole.

Entries are now grouped by `dir` and merged at the **pattern** level rather than
the layer level, because the two things a layer carries do not merge: each group
keeps its own `message`, and `allowTypeImports` belongs to a group — `apps/api`
may type its filters against DAO shapes but may not reach `provider-clients` even
as a type. One object per directory, every pattern inside it.

This could not have been caught by asserting a rule exists for a directory: the
surviving rule does exist. The test asserts every ban in the table survives the
merge, on the merged result.

## `validate-locales`: advisory severity, unused keys, declared tags

`LocaleProblem` gains `advisory`, and a base key no `t()` call site reaches is
reported without failing the run. It is the one thing that catches a call site
deleted or renamed without its key — which keeps a translator re-translating a
string no user will ever see — and it is also the ordinary state of a bundle
running ahead of its UI, which no gate should block. A **bundle-lacking** `t()`
key stays fatal: it renders the inline default for every user in every language
and is actionable in the same commit.

Keys under a dynamic prefix (``t(`nav.${item}`)``) are never reported unused.
They cannot be resolved statically, so the honest answer is "unknown", and an
`unknown` reported as `unused` is what makes a gate useless.

`--tags=<file>` cross-checks a declared `SUPPORTED_LANGUAGES` /
`SUPPORTED_LOCALES` array against the bundle directories in both directions, and
**fails** on a mismatch. It is a separate flag because a repo can declare its
tags in a file the call-site scan never walks — and a directory of bundles in
perfect agreement with no matching declaration is exactly the state every
bundle-to-bundle check reports as healthy. A declared tag with no directory is
worse still: a runtime `import.meta.glob` lookup throws the moment that language
is chosen, which is a support ticket and not a build failure.
