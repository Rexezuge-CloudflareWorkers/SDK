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

export { defineRepoLintConfig } from './eslint.ts';
export type { RepoLintConfigOptions } from './eslint.ts';

export { defineUnitVitestConfig } from './vitest.ts';
export type { CoverageThresholds, UnitVitestConfigOptions, VitestAlias } from './vitest.ts';

export { defineWebVitestConfig } from './vitest-web.ts';
export type { WebVitestConfigOptions } from './vitest-web.ts';

export { defineRepoVitestConfig } from './vitest-repo.ts';
export type { RepoBackendOptions, RepoVitestConfigOptions, RepoWebOptions } from './vitest-repo.ts';

export { defineIntegrationVitestConfig } from './vitest-integration.ts';
export type { IntegrationVitestConfigOptions } from './vitest-integration.ts';

export { DEFAULT_CLOUDFLARE_MOCKS, DEFAULT_WORKSPACE_PACKAGES, KIT_DEDUPE, KIT_NO_EXTERNAL, workspaceAliases } from './vitest-aliases.ts';
export type { VitestAlias as WorkspaceAlias, WorkspaceAliasesOptions } from './vitest-aliases.ts';

export { defineWebViteConfig, spaShellEmbedPlugin } from './vite.ts';
export type { ProxyEntry, SpaShellTarget, WebViteConfigOptions } from './vite.ts';

export { createPagesProxy } from './functions/pages-proxy.ts';
export type { Fetcher, PagesFunction, PagesFunctionContext, PagesProxyEnv, PagesProxyOptions } from './functions/pages-proxy.ts';

// --- Test helpers ---------------------------------------------------------
//
// Aliased in a Vitest config, not imported by application code, so the mocks stay
// where the suites can reach them.

export { DurableObject, RpcTarget, WorkflowEntrypoint } from './test/mocks/cloudflare-workers.ts';
export type { DurableObjectState, ExecutionContext } from './test/mocks/cloudflare-workers.ts';

export { createMigrationHelper, readMigrationFiles, splitSql } from './test/integration-migrations.ts';
export type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  MigrationFile,
  MigrationHelper,
  MigrationHelperOptions,
  MigrationRange,
} from './test/integration-migrations.ts';
