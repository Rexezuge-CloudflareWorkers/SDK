# @rexezuge/http

## 1.9.3

### Patch Changes

- Updated dependencies [b677b6b]
  - @rexezuge/shared@1.9.3
  - @rexezuge/errors@1.9.3

## 1.9.2

### Patch Changes

- @rexezuge/errors@1.9.2
  - @rexezuge/shared@1.9.2

## 1.9.1

### Patch Changes

- @rexezuge/errors@1.9.1
  - @rexezuge/shared@1.9.1

## 1.9.0

### Patch Changes

- @rexezuge/errors@1.9.0
  - @rexezuge/shared@1.9.0

## 1.8.2

### Patch Changes

- 35c82a1: Added `AbstractScheduledTask#describeFailure`, so a consumer can redact an
  error's message before it is persisted to its run-record table.

  The Template Method wrote `error instanceof Error ? error.message : String(error)`
  straight into `failRun`. That is right for a console log and wrong for a row a
  **user reads back**: task-run history is surfaced through an authenticated
  route, so a failure whose message carries a bearer token, an OAuth token or a
  signed action URL writes credential material into the database and hands it to
  whoever loads that screen.

  The kit cannot do the redaction itself — `runtime` is the DI and platform layer
  and taking a dependency on the logging packages that carry those rules would
  invert the package graph — so the seam belongs here. Overriding it routes the
  value through the consumer's own redactor:

  ```ts
  protected override describeFailure(error: unknown): string {
    return ErrorSanitizationUtil.sanitizeErrorForLogging(error);
  }
  ```

  Without the seam the only options were to accept an unredacted persisted
  message or to keep a private copy of the whole Template Method. Five of the
  seven repos this file was converged from have exactly that redactor, so all five
  were carrying a duplicated base class.

- Updated dependencies [35c82a1]
  - @rexezuge/errors@1.8.2
  - @rexezuge/shared@1.8.2

## 1.8.1

### Patch Changes

- be338b5: Fixed `spaShellEmbedPlugin` silently skipping the SPA shell when `root` or
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

- Updated dependencies [be338b5]
  - @rexezuge/errors@1.8.1
  - @rexezuge/shared@1.8.1

## 1.8.0

### Patch Changes

- @rexezuge/errors@1.8.0
  - @rexezuge/shared@1.8.0

## 1.7.2

### Patch Changes

- @rexezuge/errors@1.7.2
  - @rexezuge/shared@1.7.2

## 1.7.1

### Patch Changes

- @rexezuge/errors@1.7.1
  - @rexezuge/shared@1.7.1

## 1.7.0

### Minor Changes

- f1c78b0: Give the kit the behaviour three of its consumers had to keep a fork for, and
  fix four places where the kit's own documentation described something the code
  did not do.

  Every item below was carried by a consumer copy that was measurably better, or
  by a comment in this repo that did not match the file it sat above. The rule is
  unchanged — **the kit follows the best design; consumers adapt** — and these
  are the cases where "adopt the kit as it stands" would have cost a consumer a
  defect fix.

  ## `@rexezuge/d1`

  **`BaseDAO` now accepts a subrequest meter.** The constructor takes an optional
  `SubrequestMeter` (defaulting to `UNMETERED_SUBREQUESTS`), charges once per
  logical statement, and exposes `protected get subrequests` so a DAO that
  constructs another DAO cannot drop it. The class doc already claimed "subrequest
  accounting is an injectable port" while the constructor took `database` and
  nothing else — so a consumer metering every statement in its D1 layer had to fork
  the whole base class to do it, which is what Edge-Sonic did for 340 lines. The
  charge is per logical statement rather than per attempt: a retried statement is
  one statement the platform refused once and then answered, and charging per
  attempt would make the ceiling track the fault rate instead of the work.

  **Write accounting.** New `TrackedStatement` (a prepared statement with the SQL
  that produced it — the platform's `D1PreparedStatement` carries no `sql`, so
  there was nowhere to read it from), `runTracked` / `runTrackedBatch` returning a
  `WriteResult { changes, billedRows }`, and the `statementTable` parser that reads
  the write verb's table out of the SQL.

  `billedRows` is a **port, not an implementation**: `billedRowsForTable` is supplied
  by whoever owns the migrations, because D1 bills a write as the table row _plus
  every index entry it rewrote_ and the multiplier is a property of the schema. The
  package owns the accounting shape; the consumer owns the table. It is `null` —
  absent, not zero — when no port is configured, so the type forces a caller to
  notice that nothing is being accounted rather than reporting a confident `0`. A
  batch with one unaccountable statement reports `null` for the whole batch rather
  than a partial figure, which is the one that reads as complete.

  Also `fitToSubrequestBudget` (how many may I issue) and `assertSubrequestBudget`
  (may I issue all of these, refusing with `SubrequestBudgetExhaustedError`).

  **The D1 daily-allowance refusal is now a first-class answer.** New
  `DAILY_LIMIT_PATTERN`, `isD1DailyLimitError(error, nowMs?)`, `nextMidnightUtc`
  and the `D1DailyLimit` type. It is tested _before_ both pattern lists, so a spent
  allowance can never be classified retryable by a future pattern. `resetsAt` is
  always strictly in the future for the clock that computed it — a pause whose reset
  has passed is a pause of zero length, and a chunk that returns immediately re-runs
  its whole failure path at the alarm's rate. The pattern accepts `’` as well as
  `'`: a message arriving with a typographic apostrophe is still a refusal that
  cannot change for hours, and matching only the straight one answered "transient,
  retry".

  **`too many SQL variables` is now non-retryable.** `/too\s+many/i` is in the
  retryable list, so a bind-ceiling refusal — a deterministic query-shape defect
  fixed by batching, not by waiting — was retried three times with backoff, on a
  statement that fails identically for ever.

  ## `@rexezuge/runtime`

  **`createLogger` reads the level per emit.** It captured the level in the
  constructor, and both loggers a repo holds at module scope — this file's
  `KvCache` and a consumer's embedded-art facade — are constructed when the isolate
  starts, long before a request scope exists to hand them an `env`. Their level
  could therefore only ever come from `process.env`, which workerd does not have:
  `LOG_LEVEL=debug` shipped, was validated by nothing, and was inert. New
  `setLogLevel` is the third source in the chain, below an injected `env` and
  `process.env` on purpose, plus `resetLogLevelForTests`.

  **`EnvParser.readString` guards its input.** It cast `env` and indexed it, so a
  `null` or non-object threw a `TypeError` instead of answering "unset" — and the
  one moment a config check needs to be most forgiving, a binding missing entirely,
  was the one that could not be asked. Also adds `isValidNonNegativeInt`, which two
  repos carried and the kit did not.

  **`KvCache` has a circuit breaker and a meter.** Both came from Edge-Sonic's
  copy, which measured the degradation before writing them: a fail-soft wrapper
  alone does not help when the namespace is _hanging_, because every read still
  pays a timeout. The breaker opens after `FAILURE_THRESHOLD` consecutive failures,
  fails fast while open, and half-opens after `COOLDOWN_MS`. New
  `resetBreakerForTests`, `FAILURE_THRESHOLD` and `COOLDOWN_MS`. The meter is a
  constructor dependency typed structurally against the new `SubrequestMeterLike`,
  because `runtime` is a zero-dependency base layer — a consumer's
  `SubrequestMeter` satisfies it unchanged, and one that does not meter anything
  passes nothing. A miss caused by no binding, or by a namespace that is down,
  spends no subrequest; charging before those tests would count a request that was
  never made.

  `KV_KEY_VERSION`, `KV_MAX_KEY_LENGTH`, `KV_MIN_TTL_SECONDS`, `sanitizeSegment`,
  `utf8ByteLength`, `PURGE_LIST_LIMIT` and `PURGE_MAX_PAGES` are promoted to the
  root barrel, so a consumer supplying its own domain registry does not have to
  reach into `kv/` for the primitives.

  ## `@rexezuge/shared`

  `isLocalhostName` is exported. It was module-private, which left one consumer
  re-implementing that exact line beside a kit call answering the other half — two
  predicates for one decision, in the same function, free to drift.

  ## `@rexezuge/http`

  **`AccessAuthError` is a `ServiceError` with status 401.** It extended `Error`,
  and its own doc comment claimed it did not. Every error boundary in the family
  asks `instanceof ServiceError` before deciding what to do, so an authentication
  failure that is not one arrived as an unexpected 500: a signed-out operator was
  told the server broke, the boundary logged every ordinary sign-out as a bug, and
  a client's "am I signed in?" probe could not tell the two apart.

  **`joseVerifier` refuses `email_verified: false`.** It returned `payload.email`
  without reading the claim, while the binding path already refused it — so one
  right answer and one wrong in the same file, and a correctly signed assertion
  that an address is _not_ verified was authenticated. That claim exists to refuse
  exactly that.

  **A rejected `ACCESS` binding is logged.** The status was already right; the
  rejection was swallowed entirely, making a misconfigured binding and a genuinely
  signed-out caller indistinguishable in the logs — and the first is an outage an
  operator can fix in a minute.

  **`Retry-After` is set on the `onThrottled` path.** The header was computed and
  then discarded when a custom dialect was supplied, so a limiter that installed
  `onThrottled` to answer in a protocol envelope silently dropped the one header
  the client's backoff depends on — and the client looked like it was ignoring a
  throttle rather than the server forgetting to say when to resume. A header the
  custom dialect already set is preserved.

  **The sweep clock moved beside the map it sweeps.** `lastCleanupAt` was
  module-level next to a per-limiter `Map`, so limiter A's sweep suppressed
  limiter B's for 30 seconds and left B holding expired keys while A's map — on the
  same clock — was clean.

  **Test seams.** `resetRateLimitForTests` and `getRateLimitBucketCountForTests`,
  plus `MAX_BUCKETS`. The bucket map was a closure local, so nothing outside
  `rateLimit()` could observe the cap or reset it — a cap nothing measures is a
  cap nothing has tested.

  **`RateLimitOptions.surface` is removed.** It was declared and never read: the
  kit has exactly one dialect, and `onThrottled` is how a second one is built. A
  field that changes nothing reads as "set this and the limiter knows what to do".
  **Migration:** pass the surface's envelope through `onThrottled(retryAfter, c)`
  instead.

  `routeBase.ts` no longer claims to ship an `IBaseRoute` chanfana shape. There
  never was one; the paragraph named a symbol a consumer could not import. The
  header now records that the chanfana half is genuinely unconverged rather than
  quietly dropping the note.

  ## `@rexezuge/web`

  **`ModalShell` renders in a portal.** Its header said it did and the component
  did not — `createPortal(…, document.body)` was in four of the five copies it
  converged from and was dropped on the way in, so a consumer inside a scrolling
  card got a clipped dialog from a file whose own documentation promised it would
  not. Falls back to an inline render when there is no `document`, which is exactly
  the previous behaviour.

  ## `@rexezuge/tooling`

  `validate-locales` now implements the three checks its header advertised:
  **empty values** (an empty string is indistinguishable from a missing key at
  runtime, so a locale can look complete in a diff and be blank on the page),
  **`{{placeholder}}` parity** (substitution is by name, so a dropped token renders
  a sentence with a hole in it and no error anywhere), and **`--call-sites=<dir>`**
  (bundle-to-bundle parity cannot see a key the application uses and the bundle
  lacks — with one shipped language the whole per-tag body is skipped). A `t('key',…)`
  default that disagrees with the bundle **fails**: one of the two is a bug, and the
  default is the one that renders verbatim the day the key goes missing.

  Call sites with computed keys are skipped rather than guessed at; a finding nobody
  can act on trains people to ignore the report. `flatten` now returns values as
  well as keys, which is what the placeholder check reads.

  ## What adoption surfaced, once a consumer actually took the packages

  Everything above was found by reading. Everything below was found by **adopting** —
  by Edge-Sonic, whose two remaining forks were the largest in the family. Each one is a
  place where "adopt the kit as it stands" would have cost a consumer a defect, or made the
  kit's own documented workflow impossible.

  ## `@rexezuge/d1`

  **`executeWithRetry` no longer reads `.success` off a `null`.** A result with **no**
  `success` member is a success. That is not hypothetical: `first()` answers `null` when
  there is no row, and `null` is the platform's own "no row, not an error" — the convention
  this package, `KvCache` and every layer above them share. Reading `.success` off it threw
  `Cannot read properties of null`, which turned every optional lookup into a
  `DatabaseError`. The test is now "a result that _says_ it failed", so `undefined`, `null` and
  a plain wrapped value all pass straight through.

  **`BIND_CEILING_PATTERN` is a pre-check, not a `NON_RETRYABLE_PATTERNS` row.** The first
  version of this change put it in the non-retryable list — where it could never win, because
  retryable is consulted first by design and `/too\s+many/i` is in it. `too many SQL
variables` therefore still retried three times with backoff, for ever, on a statement that
  fails identically each attempt. It is now checked before both lists, alongside the
  allowance pattern, and exported.

  ## `@rexezuge/runtime`

  **`tryGetRequestScope` and `SCOPE_MISSING_MESSAGE`.** A consumer whose route wants to react
  to the absence of a scope — rather than let it propagate — had exactly one option: copy the
  message out of the throw and compare strings against it across a package boundary. Reword
  the message and the branch silently stops matching, which is the one direction that produces
  no error anywhere. `tryGetRequestScope` is the answer checked by construction;
  `SCOPE_MISSING_MESSAGE` is for a caller that must react to the _specific_ failure.

  **`KvCache` is generic over its domain table.** `KvCache` now takes
  `KvDomains<D>` (defaulting to the kit's), and `buildKvKey` / `clampTtl` take it as an optional
  trailing argument. The registry was a closed union of the three domains the family shares,
  which made the whole cache unusable by any repo whose vocabulary is not that one — and the
  **policy** in that table is per-repo by definition: a cache holding artwork keyed by a
  file's mtime cannot share a lifetime with a cache of session profiles. Adopting the shared
  table under different names silently shortens a week-long cache to two minutes, with no error
  anywhere. What does **not** become open is the union: a consumer's registry is still a closed
  `Record<D, KvDomainDef>` over its own names, so a typo is still a throw rather than a new
  prefix. `KvCache<D>` also exposes its registry as `keyspaces`.

  **`getBytes` / `putBytes`, the metadata-free binary path.** `getBinary`/`putBinary` require
  an etag, because an entry that has an upstream entity to quote one for should carry it. A
  cache of _derived_ bytes — an extracted image, a rendered thumbnail — has no such entity, so
  its entries legitimately carry no metadata and `getBinary` answers `null` for all of them.
  Making every binary cache invent an etag to satisfy the reader is the wrong direction.

  **`KvPutOptions` is exported from the root barrel**, with the rest of the KV types.

  ## `@rexezuge/identity`

  **`UserEmailDAO` takes an optional `SubrequestMeter`.** It called `super(database)`, so a
  consumer whose every other statement is charged could not meter this one. A DAO that charges
  nothing does not under-report loudly — it spends a subrequest the ceiling never saw, and the
  failure surfaces as the platform terminating an invocation with no application error and
  nothing in the suite red.

  ## `@rexezuge/shared`

  **`timingSafeEqualStrings`.** Three repos carried a correct copy; the duplication is the
  defect, because three copies of a security primitive is three places for the next person to
  add an early return "just for the length check" — and that early return reintroduces exactly
  the leak the function exists to close. Not a password hash, and not a substitute for a KDF's
  own compare; both are stated in the header.

  ## `@rexezuge/http`

  **`RateLimitContext` gained `req.query` and `env`.** Both are needed by the extension point
  the kit already provides. `onThrottled` is how a caller answers in a dialect its own clients
  parse — and the Subsonic envelope is chosen by `?f=` and its callback name by `?callback=`,
  so a caller building one has to read both; without `query` the only route was a cast.
  `max` is a **resolver**, and a budget that comes from configuration has nowhere else to read
  it from. Both are optional, and both are absent on the canonical dialect's path.

  ## `@rexezuge/tooling`

  **`KIT_DEDUPE`, and it fixes the `link:` workflow this repo documents.** `@rexezuge/web`
  declares `react`, `react-dom` and `lucide-react` as peers, which under a registry install
  means neither package carries its own copy — so the two sides already agree. A `link:`
  install breaks that: the symlinked package directory has its own `node_modules`, and with
  `@rexezuge/*` inlined into Vite's pipeline the kit's React wins for its own imports while the
  consumer's wins for the app's. Two Reacts is not a warning — `useState` reads a module-level
  dispatcher only one of them initialises, so every hook inside a kit component throws
  `Cannot read properties of null (reading 'useState')`, and the failure names the kit rather
  than the install layout. `resolve.dedupe` points the bare specifier at one copy, and
  `KIT_DEDUPE` is exported for a consumer's own Vite config to use.

  **`./src/*` is reachable through `exports`.** The package lists `src` in `files` precisely so
  its scripts can "be run from disk with `tsx`" — and the exports map made that unreachable. A
  consumer adopting a script could not import another one it depended on.

  **`cli-args` and `wrangler-table` are portable under `noUncheckedIndexedAccess`.** Two index
  reads were typed as total, which is true in this package's own tsconfig and false in a
  consuming repo's. A script that only typechecks in its author's repository is a script a
  consumer cannot adopt.

### Patch Changes

- Updated dependencies [f1c78b0]
  - @rexezuge/errors@1.7.0
  - @rexezuge/shared@1.7.0

## 1.6.1

### Patch Changes

- Updated dependencies [e31fb9b]
  - @rexezuge/errors@1.6.1
  - @rexezuge/shared@1.6.1

## 1.6.0

### Patch Changes

- @rexezuge/errors@1.6.0
  - @rexezuge/shared@1.6.0

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

## 1.0.8

### Minor Changes

- Initial release: the family's HTTP layer, converged from the four copies each
  of `rateLimit`, `securityHeaders`, `accessAuth`, `ErrorMapper` and
  `routeBase` had in Durable-DAV, Durable-DAV-Router, Edge-Git and Edge-Sonic.
  Edge-Sonic's variants were the ones that had solved the defects the other three
  still carried, so those are the base. This is the one package in the kit that
  depends on `hono`/`chanfana`; the other eight stay framework-free so a repo
  can adopt the core without adopting a web framework.
