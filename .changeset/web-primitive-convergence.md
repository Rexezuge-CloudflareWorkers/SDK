---
'@rexezuge/web': minor
---

Converge the second round of the family's duplicated web primitives, and give
`@rexezuge/web` a migration path — it had reached zero consumers.

**New — `useCopyToClipboard`.** Durable-DAV's hook, the one copy that had solved
the two failures the other three inlined handlers carried: a
`navigator.clipboard.writeText` that throws _synchronously_ in an insecure
context, and a rejected write that still showed the checkmark. Every value the
family copies is a credential or an identifier, so a false success sends the
operator away believing they have something they do not.

**New — nine components**, each from the copy that had solved the divergence:

- `AppPage`, `PageHeaderCard`, `ContextBar` — page layout. `ContextBar` takes its
  home link as a node rather than importing `react-router-dom`, which was the
  whole of its router coupling and the reason it could not be lifted before.
- `Unauthorized` — five byte-identical copies. Its button branch now takes an
  `onAuthenticate`, because all seven copies hard-coded a `location.assign` that
  jsdom refuses to run, leaving the one branch that matters untested.
- `NoticeBar` — renders this package's own `Notice`, so it composes with
  `useNotice` instead of each repo shuffling `{type, text}` into `{kind, message}`
  at the call site. Errors assert, successes stay polite.
- `LanguageSelector` — now reads `LocaleUtil`'s shared 12-locale table instead of
  the copy every one of the eight repos re-declared. Mail-Otter's `'unknown'`
  sentinel is `null` here, so it can no longer be confused with a locale spelled
  `unknown`.
- `RefreshButton`, `ReadOnlyField`, `TypeToConfirmModal` — the clipboard-bearing
  controls.

**`lucide-react` is now a peer (`^1.49.0`).** Three of the nine need glyphs, and
reimplementing icon path data in this package would fork lucide's artwork and
freeze it. Labels stay props — no component here calls `useTranslation`, because
the app rendering a dialog knows what it says. `Button` keeps using this
package's own `Spinner`; chrome is cheap to draw, iconography is not.

**Two defects fixed in the copies themselves.** `ReadOnlyField` rendered its
`Label` with no `htmlFor`, so the value input had _no accessible name_ — announced
as a bare "edit text" for a field holding a secret. And every copy of
`Unauthorized` hard-coded its navigation, which is why that branch had no
assertions.

**`codemods/` can now migrate these.** A new transform, not a `SUBPATH_RULES`
row: consumers never import their own web app by package name, so every
component import in the family is relative (`../components/layout/AppPage`).
`rewriteComponentImports` matches those by basename, rewrites the twelve
converged components onto `@rexezuge/web`, merges the duplicate clauses it
creates, and **names** the components the kit has not converged rather than
skipping them.

`Button`, `Card`, `Badge` and `Input` are deliberately **not** in that table.
They are already in this package, but the kit's versions are not the repos' —
the kit's `Button` replaced `class-variance-authority` with a plain `Record`.
They were not verified the way the twelve above were, and adding them would let
`adopt.ts` silently restyle six repos. That is a separate audit.
