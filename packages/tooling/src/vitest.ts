/**
 * The unit-test Vitest config for the worker-and-packages half of the suite.
 *
 * Provenance: converged from all nine repos' `vitest.config.mts`. The coverage
 * block is Durable-DAV-Router's (the most complete: v8 provider, explicit
 * include/exclude patterns, thresholds with the reasoning for why they sit just
 * under the measured value); the alias block is the union of Durable-DAV's
 * `cloudflare:*` mocks, every repo's `@scope/* → src` workspace table, and the
 * shared `@/` + `~/` prefixes — see {@link ./vitest-aliases.js}.
 *
 * Canonical decisions:
 *
 * 1. **Every file matching `include` is reported** — Vitest 4 removed
 *    `coverage.all`, and an explicit `include` now covers files no test
 *    imported. That is the behaviour the source repos configured `all: true` for,
 *    and the reason it mattered: without it a brand-new module with no test is
 *    invisible rather than counted as zero, which is the exact regression this
 *    gate exists to catch.
 * 2. **The SPA is excluded here**, so this config and `defineWebVitestConfig()`
 *    partition the suite rather than each running all of it. The default covers
 *    every suite shape the family uses (`test/web/**`, `test/**​/web-*`,
 *    `apps/web/**`); see `defineRepoVitestConfig()` for the single-file
 *    `projects` composition the AWS/Mail-Meow/CalDAV repos use.
 * 3. **A custom `exclude` re-lists `node_modules`** — `test/` is a workspace
 *    project and therefore has its own, so without the re-list the glob reaches
 *    into `test/node_modules` and tries to run other packages' suites.
 * 4. **Thresholds are a consumer argument**, not a kit default. A floor is a
 *    per-repo ratchet measured against that repo's suite; the kit cannot know a
 *    number, and guessing one is how floors get lowered.
 * 5. **`@rexezuge/*` is never externalized** — see `KIT_NO_EXTERNAL`: the kit
 *    ships ESM `dist/` with bundler-style extensionless imports, which Node's
 *    resolver refuses, so the kit stays inside Vite's pipeline (the same
 *    resolver that bundles the worker).
 */

import { defineConfig, type Plugin } from 'vitest/config';
import { DEFAULT_CLOUDFLARE_MOCKS, DEFAULT_WORKSPACE_PACKAGES, KIT_NO_EXTERNAL, workspaceAliases } from './vitest-aliases.ts';
import type { VitestAlias } from './vitest-aliases.ts';

export type { VitestAlias } from './vitest-aliases.ts';

/**
 * Coverage thresholds, in the four figures Vitest gates on.
 */
export interface CoverageThresholds {
  readonly statements?: number;
  readonly branches?: number;
  readonly functions?: number;
  readonly lines?: number;
}

/**
 * What `defineUnitVitestConfig` accepts. Every field is optional: the defaults
 * cover the canonical monorepo layout, and a consumer overrides only what its
 * tree actually differs in.
 */
export interface UnitVitestConfigOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`. When supplied, `@scope/*`
   * workspace aliases are generated from `packages` (plus `background` under
   * `apps/`); when omitted, only the `cloudflare:*`, `@/` and `~/` aliases
   * apply and `aliases` carries the workspace table by hand.
   */
  readonly scope?: string;
  /**
   * Workspace package directory names. Defaults to the family superset; a repo
   * without a domain package keeps the default harmlessly (its alias never
   * matches).
   */
  readonly packages?: readonly string[];
  /**
   * Which `cloudflare:*` mocks to alias. Defaults to workers/sockets/workflows.
   */
  readonly mocks?: readonly string[];
  /**
   * Extra resolver entries, applied after the canonical ones (e.g. the `hono`
   * dedupe two repos carry, or an `/index.ts` exact entry).
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * Where the repo root is, as a file URL. Defaults to the directory this
   * factory is *called* from, which is the repo root's `vitest.config.mts`.
   * Pass `new URL('.', import.meta.url).href` explicitly from the caller —
   * never rely on this module's own URL, which points into `node_modules`.
   */
  readonly root?: string;
  /**
   * Which suites to collect. Defaults to the whole unit suite.
   */
  readonly include?: readonly string[];
  /**
   * Suite paths to skip, replacing the default. Defaults re-list
   * `node_modules`/`dist`/`integration` plus every SPA shape.
   */
  readonly exclude?: readonly string[];
  /**
   * `node_modules` specifiers to inline through Vite rather than externalize.
   * Defaults to `['dofs']` (Durable-DAV: `dofs` imports `cloudflare:workers`,
   * which Node rejects before `resolve.alias` is consulted).
   */
  readonly serverDepsInline?: readonly string[];
  /**
   * Resolver `noExternal` patterns. Defaults to keeping `@rexezuge/*` inside
   * Vite's pipeline; see `KIT_NO_EXTERNAL`.
   */
  readonly noExternal?: readonly (string | RegExp)[];
  /**
   * Vite plugins for the suite (rare on the backend half; the SPA half passes
   * `react()` here).
   */
  readonly plugins?: readonly Plugin[];
  /**
   * Setup files run before each test file (e.g. AWS's floci guard, Meow's
   * backend/web setups).
   */
  readonly setupFiles?: readonly string[];
  /**
   * Coverage `include` globs. Defaults to the worker plus every workspace
   * package's `src`.
   */
  readonly coverageInclude?: readonly string[];
  /**
   * Coverage `exclude` globs, merged with the canonical set.
   */
  readonly coverageExclude?: readonly string[];
  /**
   * Coverage floors. Omitted by default; a repo that wants them sets them.
   */
  readonly thresholds?: CoverageThresholds;
  /**
   * Where the coverage report is written.
   */
  readonly reportsDirectory?: string;
}

/**
 * The SPA's suites, excluded here so the two configs partition the suite.
 *
 * Every shape the family uses: the `test/web/**` directory convention
 * (CalDAV-Bridge, Mail-Meow), the root-suite `web-*` naming convention
 * (Durable-DAV-Router), and suites bundled under `apps/web` (Mail-Otter).
 * `defineWebVitestConfig()` includes the same globs, so a file is collected by
 * exactly one config.
 */
const SPA_FILES: readonly string[] = ['test/web/**', 'test/**/web-*.test.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'];

/**
 * Coverage `exclude` globs converged from the source repos.
 *
 * The categories: build and test tooling (`scripts/` grows with project surface,
 * not complexity, and the god-file guard excludes it for the same reason), test
 * files, declarations, re-export barrels (`index.ts` carries no logic of its
 * own), model records, generated files (the SPA shell is a one-line HTML blob
 * with no logic to exercise), and type-only modules.
 */
const CANONICAL_COVERAGE_EXCLUDE: readonly string[] = [
  'scripts/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.d.ts',
  '**/index.ts',
  '**/types.d.ts',
  '**/model/**',
  '**/generated/**',
  '**/D1Types.ts',
  '**/ServiceEnv.ts',
  '**/env.d.ts',
];

/**
 * Build the unit-test config.
 *
 * ```ts
 * // vitest.config.mts
 * import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';
 * export default defineUnitVitestConfig({
 *   scope: '@myapp',
 *   thresholds: { statements: 60, branches: 55, functions: 65, lines: 60 },
 * });
 * ```
 */
export function defineUnitVitestConfig(options: UnitVitestConfigOptions = {}): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const coverageInclude = options.coverageInclude ?? ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'];
  const coverageExclude = [...CANONICAL_COVERAGE_EXCLUDE, ...(options.coverageExclude ?? [])];
  const baseAliases = workspaceAliases({
    scope: options.scope ?? '@unused',
    root,
    packages: options.scope === undefined ? [] : (options.packages ?? DEFAULT_WORKSPACE_PACKAGES),
    mocks: options.mocks ?? DEFAULT_CLOUDFLARE_MOCKS,
  });
  // A placeholder scope contributes no `@unused/*` entries; the mocks plus
  // `@/`/`~/` survive either way.
  const aliases = [
    ...baseAliases.filter((alias) => typeof alias.find !== 'string' || !alias.find.startsWith('@unused')),
    ...(options.aliases ?? []),
  ];

  return defineConfig({
    ...(options.plugins !== undefined && { plugins: [...options.plugins] }),
    resolve: { alias: aliases, noExternal: [...KIT_NO_EXTERNAL, ...(options.noExternal ?? [])] },
    test: {
      globals: true,
      environment: 'node',
      include: [...(options.include ?? ['test/**/*.test.{ts,tsx}'])],
      // `test` is a workspace project and therefore has its own node_modules;
      // without the re-list, the glob reaches into it.
      exclude: [...(options.exclude ?? ['**/node_modules/**', '**/dist/**', 'test/integration/**', ...SPA_FILES])],
      ...(options.setupFiles !== undefined && { setupFiles: [...options.setupFiles] }),
      server: {
        deps: {
          // A `node_modules` dependency is externalized by default, so Node's
          // own ESM loader resolves a `cloudflare:workers` specifier and rejects
          // the scheme before `resolve.alias` is ever consulted. Inlining routes
          // it back through Vite, where the alias applies.
          inline: [...(options.serverDepsInline ?? ['dofs'])],
        },
      },
      coverage: {
        provider: 'v8',
        // Vitest 4 removed `coverage.all`; an explicit `include` now reports
        // every matching file whether or not a test imported it, which is the
        // behaviour the source repos' `all: true` was there to get: a brand-new
        // module with no test is counted as zero rather than being invisible,
        // which is the exact regression this gate exists to catch.
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: options.reportsDirectory ?? './coverage',
        include: [...coverageInclude],
        exclude: coverageExclude,
        ...(options.thresholds !== undefined && { thresholds: { ...options.thresholds } }),
      },
    },
  });
}
