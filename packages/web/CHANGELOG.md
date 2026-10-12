# @rexezuge/web

## 1.5.2

### Patch Changes

- Updated dependencies [0812aa7]
  - @rexezuge/errors@1.5.2
  - @rexezuge/shared@1.5.2

## 1.5.1

### Patch Changes

- @rexezuge/errors@1.5.1
  - @rexezuge/shared@1.5.1

## 1.5.0

### Patch Changes

- Updated dependencies [f1d7a4a]
  - @rexezuge/errors@1.5.0
  - @rexezuge/shared@1.5.0

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
  - @rexezuge/errors@1.4.0
  - @rexezuge/shared@1.4.0

## 1.3.0

### Patch Changes

- @rexezuge/errors@1.3.0
  - @rexezuge/shared@1.3.0

## 1.2.0

### Minor Changes

- 10f0501: Converge the second round of the family's duplicated web primitives, and give
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

### Patch Changes

- @rexezuge/errors@1.2.0
  - @rexezuge/shared@1.2.0

## 1.1.0

### Minor Changes

- b5f52a8: Converge the family's HTTP layer and web primitives into the kit, and fix the
  defects found while auditing the existing packages against the rest of the
  family.

  **New — `@rexezuge/http`.** The rate limiter, security headers, Cloudflare
  Access auth, error mapper and route bases were four copies each across
  Durable-DAV, Durable-DAV-Router, Edge-Git and Edge-Sonic. Edge-Sonic's variants
  were the ones that had solved the defects the others still carried, so those are
  the base: the per-request bucket sweep, the resolver-valued `max`, the
  `Retry-After` header, the `env.ACCESS` binding that replaced an
  `executionCtx.access` branch that could never execute, and the
  `securityHeaders` `no-store` predicate — now a **required** argument, because a
  predicate copied from another router's route table is an unconditional no-op
  rather than a conservative default.

  **D1 and identity read `null` for an absent row**, matching `D1Result.first()`,
  `KVNamespace.get()`, and every service above them. `CursorCodec.decodeOrThrow` no
  longer answers "absent" as well as "malformed": absence is the caller's decision
  and `decode` is the lenient path.

  **New — `AbstractScheduledTask` / `TaskRegistry`** in `@rexezuge/runtime`, from
  the seven copies that ranged from 13 to 103 lines. Run bookkeeping, failure
  recording, and a recorder port so `runtime` keeps no D1 dependency.

  **New — OAuth2 PKCE helpers** in `@rexezuge/shared`, from the byte-identical
  pair in Mail-Meow and Mail-Otter.

  **New — `ModalShell`, `ConfirmDeleteModal`, `LoadingSpinner`, `EmptyState`** in
  `@rexezuge/web`. Deliberately dependency-free: labels arrive as props rather
  than from `useTranslation`, so adopting these does not require a translation
  library or an icon set.

  **`adopt.ts` implements `--remove-packages`.** The flag was documented as step 3
  of the migration and read `void removePackages;`. It now reports workspace
  packages whose imports reached zero — with reference counts for the ones that did
  not, so the list is never mistaken for the whole picture — and deletes only on
  `--write --remove-packages`. `flagValue` no longer returns the positional root as
  the scope when `--scope` is absent, which made a missing flag a silent no-op run.

  The orchestrator gains its own suite (`adopt.test.ts`, 11 cases) covering the
  `--write`-across-a-repo path that previously had none, including idempotency.

### Patch Changes

- Updated dependencies [b5f52a8]
- Updated dependencies [b5f52a8]
  - @rexezuge/errors@1.1.0
  - @rexezuge/shared@1.1.0

## 1.0.9

### Patch Changes

- Updated dependencies [7c76159]
  - @rexezuge/errors@1.0.9
  - @rexezuge/shared@1.0.9

## 1.0.8

### Patch Changes

- @rexezuge/errors@1.0.8
  - @rexezuge/shared@1.0.8

## 1.0.7

### Patch Changes

- ec1f306: Adopt the family's Prettier configuration (`.prettierrc`, `.prettierignore`, `.editorconfig`) and reformat the repository to match. `pnpm run format` rewrites in place; `pnpm run format:check` is the CI gate and the only one of the two that fails rather than repairing. The published `dist/` output is byte-identical — this is formatting and tooling only.
- Updated dependencies [ec1f306]
  - @rexezuge/errors@1.0.7
  - @rexezuge/shared@1.0.7

## 1.0.6

### Patch Changes

- @rexezuge/errors@1.0.6
  - @rexezuge/shared@1.0.6

## 1.0.5

### Patch Changes

- @rexezuge/errors@1.0.5
  - @rexezuge/shared@1.0.5

## 1.0.4

### Patch Changes

- Updated dependencies [3a09e1f]
  - @rexezuge/shared@1.0.4
  - @rexezuge/errors@1.0.4

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
  - @rexezuge/errors@1.0.3
  - @rexezuge/shared@1.0.3

## 1.0.2

### Patch Changes

- aa4210b: Add README and package description for every published package. Only `@rexezuge/tooling` had either, so the other seven npm pages rendered blank.
- Updated dependencies [aa4210b]
  - @rexezuge/errors@1.0.2
  - @rexezuge/shared@1.0.2

## 1.0.1

### Patch Changes

- @rexezuge/errors@1.0.1
  - @rexezuge/shared@1.0.1
