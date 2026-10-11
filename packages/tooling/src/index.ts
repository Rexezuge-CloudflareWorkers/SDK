/**
 * `@rexezuge/tooling` — the tooling layer of the kit.
 *
 * The config factories and the test helpers are re-exported here, so a consumer has
 * one import for everything its `*.config.mts` files and its mocks need. The
 * scripts under `scripts/` are **not** re-exported: they resolve paths relative to
 * the repository they run in, so they are run from disk with `tsx`, not imported.
 * See `README.md` for the copy-in recipe and the per-script usage.
 *
 * The zero-dependency rule: nothing here imports another `@rexezuge/*` package. The
 * one exception in the tree is `scripts/backup/encrypt-backup.ts`, which uses
 * `@rexezuge/d1`'s AES-GCM so the backup and the workers share one definition of
 * "what an encryption key looks like"; that dependency is declared on the package
 * and is only ever resolved in the consumer's repo, where the kit is installed
 * alongside `@rexezuge/d1`.
 */

export { defineRepoLintConfig } from './eslint';
export type { RepoLintConfigOptions } from './eslint';

export { defineUnitVitestConfig } from './vitest';
export type { CoverageThresholds, UnitVitestConfigOptions, VitestAlias } from './vitest';

export { defineWebVitestConfig } from './vitest-web';
export type { WebVitestConfigOptions } from './vitest-web';

export { defineWebViteConfig, spaShellEmbedPlugin } from './vite';
export type { ProxyEntry, SpaShellTarget, WebViteConfigOptions } from './vite';

export { createPagesProxy } from './functions/pages-proxy';
export type { Fetcher, PagesFunction, PagesFunctionContext, PagesProxyEnv, PagesProxyOptions } from './functions/pages-proxy';

// --- Test helpers ---------------------------------------------------------
//
// Aliased in a Vitest config, not imported by application code, so the mocks stay
// where the suites can reach them.

export { DurableObject, RpcTarget, WorkflowEntrypoint } from './test/mocks/cloudflare-workers';
export type { DurableObjectState, ExecutionContext } from './test/mocks/cloudflare-workers';

export { createMigrationHelper, readMigrationFiles, splitSql } from './test/integration-migrations';
export type { D1DatabaseLike, D1PreparedStatementLike, MigrationFile, MigrationHelper, MigrationHelperOptions, MigrationRange } from './test/integration-migrations';
