/**
 * The integration-suite Vitest config.
 *
 * Provenance: the eight `test/integration/vitest.config.mts` workerd suites
 * plus CalDAV-Bridge's `node:sqlite` suite. Every one hand-writes the same
 * `@scope/* → src` workspace table (8–20 entries) beside its own harness
 * wiring; this factory generates that table from `scope` so the two cannot
 * drift apart — a suite resolving a workspace import differently from the unit
 * suite fails in a way that looks like a product bug.
 *
 * What the factory does not do, deliberately: the workerd suites' `plugins`
 * (`@cloudflare/vitest-pool-workers`), `pool` and migration-SQL `define` are
 * harness wiring that belongs to the repo, and importing the workerd plugin
 * here would make the tooling package undownloadable for a consumer without
 * it. The factory takes them as opaque pass-through and returns them
 * untouched. CalDAV-Bridge's suite passes none of them (plain `node` +
 * `node:sqlite`, no coverage); the workerd suites pass all three.
 */

import { defineConfig, type Plugin } from 'vitest/config';
import type { Pool } from 'vitest/node';
import { DEFAULT_WORKSPACE_PACKAGES, workspaceAliases } from './vitest-aliases.ts';
import type { VitestAlias } from './vitest-aliases.ts';

/**
 * What `defineIntegrationVitestConfig` accepts.
 */
export interface IntegrationVitestConfigOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`.
   */
  readonly scope: string;
  /**
   * Workspace package directory names. Defaults to the family superset.
   */
  readonly packages?: readonly string[];
  /**
   * The repo root, as a file URL.
   */
  readonly root?: string;
  /**
   * Extra resolver entries, applied after the workspace table (e.g. the
   * `hono` dedupe two repos carry).
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * Which suites to collect. Workerd suites use
   * `test/integration/​**​/*.int.test.ts`; CalDAV-Bridge's sqlite suite uses
   * `test/integration/​**​/*.test.ts`.
   */
  readonly include?: readonly string[];
  /**
   * The Vitest plugins (the workerd `cloudflareTest()` plugin). Typed as the
   * runner's own plugin so a workerd plugin is accepted and nothing new is
   * imported — this package stays dependency-free.
   */
  readonly plugins?: readonly Plugin[];
  /**
   * The pool (the workerd `cloudflarePool()`). The runner's own `Pool` type,
   * so a custom pool is accepted without importing its provider.
   */
  readonly pool?: Pool;
  /**
   * Compile-time defines (the migration SQL/SQLite bundle each suite injects).
   * Opaque, passed through.
   */
  readonly define?: Readonly<Record<string, string>>;
  /**
   * SSR `noExternal` (workerd suites list `hono`, `chanfana` and their scope).
   * Passed through untouched.
   */
  readonly ssrNoExternal?: readonly string[];
}

/**
 * Build the integration-suite config.
 *
 * ```ts
 * // test/integration/vitest.config.mts — workerd suite
 * import { cloudflareTest, cloudflarePool } from '@cloudflare/vitest-pool-workers';
 * import { defineIntegrationVitestConfig } from '@rexezuge/tooling/vitest-integration';
 * export default defineIntegrationVitestConfig({
 *   scope: '@myapp',
 *   define: { __INTEGRATION_MIGRATION_SQL__: JSON.stringify(migrationSql) },
 *   plugins: [cloudflareTest({ wrangler: { configPath: './test/integration/wrangler.test.jsonc' } })],
 *   pool: cloudflarePool({ wrangler: { configPath: './test/integration/wrangler.test.jsonc' } }),
 * });
 * ```
 *
 * ```ts
 * // test/integration/vitest.config.mts — sqlite suite (no workerd)
 * import { defineIntegrationVitestConfig } from '@rexezuge/tooling/vitest-integration';
 * export default defineIntegrationVitestConfig({
 *   scope: '@myapp',
 *   include: ['test/integration/**​/*.test.ts'],
 * });
 * ```
 */
export function defineIntegrationVitestConfig(options: IntegrationVitestConfigOptions): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const aliases = [
    ...workspaceAliases({ scope: options.scope, root, packages: options.packages ?? DEFAULT_WORKSPACE_PACKAGES, mocks: [] }),
    ...(options.aliases ?? []),
  ];

  return defineConfig({
    ...(options.define !== undefined && { define: { ...options.define } }),
    ...(options.plugins !== undefined && { plugins: [...options.plugins] }),
    resolve: { alias: aliases },
    test: {
      globals: true,
      environment: 'node',
      include: [...(options.include ?? ['test/integration/**/*.int.test.ts'])],
      ...(options.pool !== undefined && { pool: options.pool }),
    },
    ...(options.ssrNoExternal !== undefined && { ssr: { noExternal: [...options.ssrNoExternal] } }),
  });
}
