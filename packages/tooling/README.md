# @rexezuge/tooling

Config factories, repo scripts, test helpers, and CI templates for the
Rexezuge-CloudflareWorkers family.

**Zero internal dependencies.** The config factories, the Pages proxy and the test
helpers import nothing from another `@rexezuge/*` package. The single exception is
`scripts/backup/encrypt-backup.ts`, which uses `@rexezuge/d1`'s AES-GCM so a backup
and the workers share one definition of "what an encryption key looks like"; that
dependency is declared on this package and is only ever resolved in a consumer
repo, where the kit is installed alongside `@rexezuge/d1`.

Everything here is a convergence of the same file copied across ten monorepos. Each
export carries a header comment naming the repos it came from and the decision the
convergence made — those headers are the documentation.

---

## 1. Config factories

Four factories, four lines of consumer wiring each.

### ESLint

```js
// eslint.config.mjs — the whole file
import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';

export default defineRepoLintConfig({ scope: '@my-app' });
```

Converged from Durable-DAV's 436-line `eslint.config.mjs` (the layered
`no-restricted-imports` boundary rules), Edge-Sonic's 730-line config (which lints
`test/**`, turns `unicorn/prefer-ternary` off with its reasons, and covers the
`import()` hole in `no-restricted-imports` with a matching `no-restricted-syntax`
rule), Mail-Meow's hard-error formatting gate, and AWS's `allowTypeImports` DAO
boundary.

The layer table is parameterized by `scope`, so `@my-app/api` is banned from
`apps/api` exactly as `@durable-dav/api` was. Canonical decisions:

- `prettier/prettier` is an **error**, not a warning. `pnpm run lint` is
  `eslint --fix --quiet` in most repos, and `--quiet` discards warnings — so a
  `prettier/prettier` warning is a silent no-op. Edge-Sonic had 242 files in that
  state: the gate had never run.
- `test/**` is **linted**, not ignored, with a narrow override block for Vitest
  idioms. The source repos ignored it, and ~200 KB of test code had accumulated
  violations nothing reported.
- `apps/web` gets `globals.node` **plus** `globals.browser`, and is banned from
  every `@scope/*` package — the SPA's own copy of a shared helper is the
  convention, and a lint gate that does not say so is a convention.

A consumer that needs `eslint-plugin-react-hooks` appends it, because the kit stays
zero-dependency and the plugin belongs to the app:

```js
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...defineRepoLintConfig({ scope: '@my-app' }),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
];
```

### Vitest — the worker and packages half

```ts
// vitest.config.mts
import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

export default defineUnitVitestConfig({
  coverageInclude: ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'],
  thresholds: { statements: 60, branches: 55, functions: 65, lines: 60 },
});
```

v8 coverage with the converged include/exclude patterns (scripts, tests, barrels,
generated files, type-only modules), `cloudflare:workers` / `cloudflare:sockets`
aliased to the bundled Node stand-ins, and `test/integration/**` plus every
`web-*` suite excluded so this config and the next one partition the suite rather
than each running all of it. Vitest 4 removed `coverage.all`; an explicit
`include` now reports files no test imported, which is the behaviour it was there
to get.

**Thresholds are a consumer argument, not a kit default.** A floor is a per-repo
ratchet measured against that repo's suite; the kit cannot know a number, and
guessing one is how floors get lowered.

### Vitest — the SPA half

```ts
// vitest.web.config.mts
import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';

export default defineWebVitestConfig({
  plugins: [react()],
  thresholds: { statements: 55, branches: 52, functions: 54, lines: 56 },
});
```

Converged from Durable-DAV-Router's and Mail-Otter's `vitest.web.config.mts`:
jsdom for every file, `pool: 'threads'` bounded rather than a fork per file (a
jsdom document per fork is what exhausts memory and dies with a bare "Worker
exited unexpectedly"), and both suite-naming conventions collected
(`test/**/web-*.test.{ts,tsx}` and `apps/web/**/*.test.{ts,tsx}`).

### Vite — the SPA build

```ts
// apps/web/vite.config.ts
import react from '@vitejs/plugin-react';
import { defineWebViteConfig, spaShellEmbedPlugin } from '@rexezuge/tooling/vite';

export default defineWebViteConfig({
  plugins: [react(), tailwindcss()],
  proxy: {
    '/user': { target: 'http://localhost:8787', changeOrigin: true },
    '/rest': { target: 'http://localhost:8787', changeOrigin: true },
  },
  // The ONE repo-specific piece, passed in rather than hardcoded: the worker and
  // the generated-module path differ per repo.
  spaShell: { path: 'apps/api/src/generated/spa-shell.ts' },
});
```

`spaShellEmbedPlugin(target)` is the converged body of all eight copies of the
`spa-shell-embed` plugin, including Edge-Sonic's fix of skipping a build that
emitted no `dist/index.html` rather than throwing. Paths resolve from the directory
the build runs in — **not** from this module, which would point inside
`node_modules`.

---

## 2. Pages proxy

```ts
// functions/[[path]].ts
import { createPagesProxy } from '@rexezuge/tooling/functions/pages-proxy';

export const onRequest = createPagesProxy();
```

The converged `functions/[[path]].ts` shim, verified against Durable-DAV,
Mail-Meow and Edge-Git. It strips hop-by-hop and client-forwarding headers, sets
`X-Forwarded-Host/Proto/Uri` from values it reads off the request rather than the
client, replaces `X-Forwarded-For` from `CF-Connecting-IP` (never conditionally —
that is the defect Mail-Meow recorded fixing), forwards the body as a stream with
`duplex: 'half'` for anything but GET/HEAD, and hands the request to
`env.API_WORKER`.

Structural `Fetcher` / `PagesFunction` types: no `@cloudflare/workers-types`
import, so the module typechecks without a generated `worker-configuration.d.ts`.

`createPagesProxy({ forwardClientIp: false })` is the Edge-Sonic variant, for a
worker that refuses `X-Forwarded-For` outright.

---

## 3. Test helpers

### `test/mocks/cloudflare-workers` — the `cloudflare:workers` stand-in

```ts
// test/mocks/cloudflare-workers.ts  (copy this file verbatim)
// vitest.config.mts — defineUnitVitestConfig already aliases it
{ find: 'cloudflare:workers', replacement: 'test/mocks/cloudflare-workers.ts' }
```

Converged from the eight copies: `DurableObject`, `RpcTarget` (present because
`dofs`' `Fs` extends it, and its absence is a module-load failure rather than a
test failure), and `WorkflowEntrypoint`. The ambient `DurableObjectState` /
`ExecutionContext` shapes are declared locally, so it typechecks inside the kit and
still typechecks against a consumer's generated types.

### `test/integration-migrations` — applying the migration directory

```ts
import { createMigrationHelper } from '@rexezuge/tooling/test/integration-migrations';

const migrations = createMigrationHelper({ migrationsDir: new URL('../../migrations', import.meta.url).pathname });

beforeAll(async () => {
  await migrations.applyMigrations(env.DB); // every file, in wrangler's order
});

it('upgrades a pre-0004 database', async () => {
  await migrations.applyMigrations(env.DB, { to: '0003_href_prefix_mode.sql' }); // seed the old shape
  await migrations.applyMigrations(env.DB, { from: '0004_user_identity.sql' }); // then the one under test
});
```

A factory, because every source repo hardcodes where its migrations live. Generic
over a structural `D1DatabaseLike` — `prepare`, and `batch` when the binding has it
— so a fake D1, a real D1 under workerd, and Miniflare's D1 all satisfy it. The
splitter is trigger-aware, and each file is one `batch()` whose failure names the
file and the statement.

---

## 4. Scripts

Every script is a standalone `.ts` entrypoint. Copy the `scripts/` tree into the
repo (that is the intended use — they resolve paths relative to the repository they
run in), or run it straight out of the installed package:

```bash
pnpm exec tsx node_modules/@rexezuge/tooling/src/scripts/<name>.ts [args]
```

| Script                       | What it does                                                                     | Usage                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `check-god-files.ts`         | 300-line warn / 400-line critical guard, warn-only by default, with an allowlist | `--root <dir>` `--allowlist <file>` `--soft 300` `--hard 400` `--fail-on-hard` |
| `ensure-spa-shell-stub.ts`   | writes the empty `spa-shell.ts` stub when absent; never overwrites               | `[repo-root]`                                                                  |
| `verify-spa-shell.ts`        | rejects a missing, stubbed, or half-refreshed SPA shell                          | `[repo-root]`                                                                  |
| `validate-locales.ts`        | two-way key parity, empty values, `{{placeholder}}` parity, base-locale bundle   | `[locales-dir]`                                                                |
| `verify-migrations.ts`       | migration names, numbering, digests against the lock; read-only                  | `[migrations-dir]`                                                             |
| `migrations-lock.ts`         | `--write` for the above: add-only lock update                                    | `[migrations-dir]`                                                             |
| `prepare-wrangler-config.ts` | materializes `wrangler.jsonc` and provisions the resources it names              | env-driven                                                                     |
| `init-secrets.ts`            | creates the declared Secrets Store entries, generate-if-absent                   | env-driven                                                                     |
| `backup/encrypt-backup.ts`   | compresses and AES-GCM-encrypts an exported dump                                 | `BACKUP_ENCRYPTION_KEY`                                                        |

The rules each script enforces live in a module beside it, so the gates are unit
tested here: `god-files` rules in `check-god-files.ts`, `spa-shell` rules in
`spa-shell.ts`, locale rules in `validate-locales.ts`, migration rules in
`verify-migrations.ts`.

### The three that are gates, not chores

**`check-god-files.ts`** keeps every source repo's thresholds but makes the verdict
warn-only until the repo opts in with `--fail-on-hard`. The reason is in the
module: a ceiling set above the largest file in the tree measures nothing, and
Durable-DAV's own notes record ten files just over 300 with a hard limit that had
never fired. `scripts/god-files.allowlist.json` (a JSON array of repo-relative
paths, or `dir/` prefixes) records the known offenders so the report names only
what is new.

**`verify-migrations.ts` / `migrations-lock.ts`** exist because D1 records which
migrations it applied but not what they contained, so editing an applied migration
is invisible to every other tool. The lock is forward-only, `--write` is add-only
(an `edited` finding survives a write), and a squashed baseline exempts exactly the
set a squash rewrites or absorbs.

**`verify-spa-shell.ts`** is the only thing standing between a fresh clone and a
deploy that serves a blank page: both `apps/web/dist/` and the generated
`spa-shell.ts` are gitignored, and `postinstall` writes a deliberately empty stub.
Known limit, stated in the module: a _stale but self-consistent_ pair passes.

### The backup helpers

`backup/{d1-target,destination-config,naming,retention,encrypt-backup}.ts` are the
generic half of Edge-Sonic's backup suite — the rules, not the upload jobs.
`d1-target.ts` refuses to export a database that was auto-provisioned moments ago,
`destination-config.ts` fails closed on an unencrypted destination, `naming.ts`
pins the artifact format (the workflow's upload glob and this prefix are one fact in
two places), `retention.ts` rejects a bad window rather than defaulting one, and
`encrypt-backup.ts` does the crypto in-process with the kit's own AES-GCM.

**Left local, deliberately:** `s3-prune.ts`, `upload-s3.ts`, `upload-webdav.ts`,
`webdav-target.ts` (destination-specific: S3 credentials, rclone, and a WebDAV
client are per-repo configuration rather than shared rules), `compare-reference.ts`
and `change-email.ts` (business logic and personal-data operations, respectively —
neither is tooling).

---

## 5. GitHub templates

`src/github/` holds the converged family workflows and composite actions:

```
src/github/
  workflows/continuous-integration.yml      # the superset of nine repos' CI jobs
  workflows/continuous-deployment.yml       # workflow_run-gated deploy, worker + pages
  workflows/scheduled-version-update.yml   # .github/.version bump
  workflows/backup-main.yml                # secret-gated mirrors to Azure DevOps / GitLab
  actions/setup-env/action.yml             # pnpm + node store cache
  actions/retry-step/action.yml            # retry a bash command, annotate the attempts
  dependabot.yml                           # weekly, with the @rexezuge/* group
```

Copy the tree to the repo root. Placeholders are marked `REPLACE` and listed at the
top of each file; the one that must change for the workflows to run at all is the
`pnpm --filter @<scope>/web build` invocation in `continuous-integration.yml` and
`continuous-deployment.yml`.

---

## 6. Verifying this package

```bash
pnpm --filter @rexezuge/tooling exec tsc -p tsconfig.json
pnpm --filter @rexezuge/tooling typecheck
pnpm --filter @rexezuge/tooling test
```
