/**
 * The unit-test Vitest config for the worker-and-packages half of the suite.
 *
 * Provenance: converged from the eight repos' `vitest.config.mts`. The coverage
 * block is Durable-DAV-Router's (the most complete: v8 provider, explicit
 * include/exclude patterns, thresholds with the reasoning for why they sit just
 * under the measured value); the alias block is Durable-DAV's, which is the only
 * one that also aliases `cloudflare:workers` and `cloudflare:sockets` to the
 * Node mocks.
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
 *    partition the suite rather than each running all of it. Every SPA suite is
 *    named `web-*`. One number could not honestly describe both halves: the SPA's
 *    presentational modules pulled a shared floor down 16 points, so a change
 *    adding legitimate code in `apps/api` could fail the gate on the strength of
 *    files two directories away.
 * 3. **A custom `exclude` re-lists `node_modules`** — `test/` is a workspace
 *    project and therefore has its own, so without the re-list the glob reaches
 *    into `test/node_modules` and tries to run other packages' suites.
 * 4. **Thresholds are a consumer argument**, not a kit default. A floor is a
 *    per-repo ratchet measured against that repo's suite; the kit cannot know a
 *    number, and guessing one is how floors get lowered.
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * One `{ find, replacement }` pair for Vitest's resolver.
 */
export interface VitestAlias {
  readonly find: string | RegExp;
  readonly replacement: string;
}

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
   * Extra resolver entries, applied after the canonical ones.
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * Where the repo root is, as a file URL. Defaults to the directory this
   * factory is *called* from, which is the repo root's `vitest.config.mts`.
   */
  readonly root?: string;
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
 * Every SPA suite is named `web-*`. `defineWebVitestConfig()` includes the same
 * glob, so a file is collected by exactly one config.
 */
const SPA_FILES = 'test/**/web-*.test.{ts,tsx}';

/**
 * The canonical alias set.
 *
 * Built relative to the consumer's repo root rather than the kit's directory,
 * so the factory describes *their* layout. A Vitest config is a standalone file
 * with no module graph to share through, and a suite resolving a workspace
 * import differently from its sibling fails in a way that looks like a product
 * bug — which is why these are stated once, here, rather than duplicated.
 */
function canonicalAliases(root: string): VitestAlias[] {
  const at = (relative: string): string => fileURLToPath(new URL(relative, root));
  return [
    { find: 'cloudflare:workers', replacement: at('test/mocks/cloudflare-workers.ts') },
    { find: 'cloudflare:sockets', replacement: at('test/mocks/cloudflare-sockets.ts') },
    { find: /^@\//, replacement: `${at('apps/api/src')}/` },
    { find: /^~\//, replacement: `${at('apps/web/src')}/` },
  ];
}

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
 * export default defineUnitVitestConfig();
 * ```
 */
export function defineUnitVitestConfig(options: UnitVitestConfigOptions = {}): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const coverageInclude = options.coverageInclude ?? ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'];
  const coverageExclude = [...CANONICAL_COVERAGE_EXCLUDE, ...(options.coverageExclude ?? [])];
  const aliases = [...canonicalAliases(root), ...(options.aliases ?? [])];

  return defineConfig({
    resolve: { alias: aliases },
    test: {
      globals: true,
      environment: 'node',
      include: ['test/**/*.test.{ts,tsx}'],
      // `test` is a workspace project and therefore has its own node_modules;
      // without the re-list, the glob reaches into it.
      exclude: ['**/node_modules/**', '**/dist/**', 'test/integration/**', SPA_FILES],
      server: {
        deps: {
          // A `node_modules` dependency is externalized by default, so Node's
          // own ESM loader resolves a `cloudflare:workers` specifier and rejects
          // the scheme before `resolve.alias` is ever consulted. Inlining routes
          // it back through Vite, where the alias applies.
          inline: ['dofs'],
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
