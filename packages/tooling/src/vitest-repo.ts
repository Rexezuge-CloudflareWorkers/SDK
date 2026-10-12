/**
 * The single-file `projects` composition: backend (`node`) plus SPA (DOM).
 *
 * Provenance: AWS-AccessBridge (split by `.ts`/`.tsx` extension),
 * Mail-Meow (split by `test/web/**` directory, with per-project `setupFiles`
 * and the React plugin on the web project), CalDAV-Bridge (split by directory
 * with `happy-dom`). The two-file repos (Durable-DAV-Router, Mail-Otter) keep
 * `defineUnitVitestConfig()` + `defineWebVitestConfig()`; this factory is the
 * same two halves as `projects` entries in one file, sharing one root coverage
 * gate.
 *
 * Canonical decisions (all three sources agree):
 *
 * 1. **Coverage lives at the root**, not per project: one floor for the whole
 *    unit suite. (Durable-DAV-Router's warning about a shared floor stands for
 *    the two-file split; within one file the three sources all gate once.)
 * 2. **Each project repeats the alias table.** Vitest projects do not inherit
 *    the root `resolve` (Mail-Meow), so a suite resolving `@scope/*`
 *    differently from its sibling fails like a product bug. Both entries carry
 *    the full table — backend with `@/` → API, web with `@/` + `~/` → SPA.
 * 3. **The web project keeps `pool: 'threads'`** and its DOM from
 *    `defineWebVitestConfig()`; the backend project keeps `environment:
 *    'node'` and `server.deps.inline` from `defineUnitVitestConfig()`.
 */

import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CLOUDFLARE_MOCKS, DEFAULT_WORKSPACE_PACKAGES, KIT_NO_EXTERNAL, workspaceAliases } from './vitest-aliases.ts';
import type { VitestAlias } from './vitest-aliases.ts';
import type { CoverageThresholds } from './vitest.ts';

/**
 * The backend half of the `projects` pair.
 */
export interface RepoBackendOptions {
  /**
   * Which suites to collect. Defaults to the whole unit suite minus SPA and
   * integration shapes.
   */
  readonly include?: readonly string[];
  /**
   * Suite paths to skip, replacing the default.
   */
  readonly exclude?: readonly string[];
  /**
   * Setup files run before each backend test file.
   */
  readonly setupFiles?: readonly string[];
  /**
   * `node_modules` specifiers to inline through Vite. Defaults to `['dofs']`.
   */
  readonly serverDepsInline?: readonly string[];
  /**
   * Extra resolver entries for the backend project only.
   */
  readonly aliases?: readonly VitestAlias[];
}

/**
 * The SPA half of the `projects` pair.
 */
export interface RepoWebOptions {
  /**
   * The DOM implementation. `jsdom` is the family default; `happy-dom` is
   * CalDAV-Bridge's.
   */
  readonly environment?: 'jsdom' | 'happy-dom';
  /**
   * Which suites to collect. Defaults to every SPA shape the family uses.
   */
  readonly include?: readonly string[];
  /**
   * Suite paths to skip, replacing the default.
   */
  readonly exclude?: readonly string[];
  /**
   * Setup files run before each SPA test file.
   */
  readonly setupFiles?: readonly string[];
  /**
   * Vite plugins the SPA needs (`react()` for JSX).
   */
  readonly plugins?: readonly Plugin[];
  /**
   * Extra resolver entries for the web project only.
   */
  readonly aliases?: readonly VitestAlias[];
}

/**
 * What `defineRepoVitestConfig` accepts.
 */
export interface RepoVitestConfigOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`.
   */
  readonly scope: string;
  /**
   * Workspace package directory names. Defaults to the family superset.
   */
  readonly packages?: readonly string[];
  /**
   * Which `cloudflare:*` mocks to alias. Defaults to workers/sockets/workflows.
   */
  readonly mocks?: readonly string[];
  /**
   * The repo root, as a file URL.
   */
  readonly root?: string;
  /**
   * Extra resolver entries applied to *both* projects (e.g. the `hono`
   * dedupe). Per-project extras go on `backend.aliases` / `web.aliases`.
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * Resolver `noExternal` patterns, merged after {@link KIT_NO_EXTERNAL}.
   */
  readonly noExternal?: readonly (string | RegExp)[];
  /**
   * The backend half. Omitted fields take the `defineUnitVitestConfig`
   * defaults.
   */
  readonly backend?: RepoBackendOptions;
  /**
   * The SPA half. Omitted fields take the `defineWebVitestConfig` defaults.
   */
  readonly web?: RepoWebOptions;
  /**
   * Coverage `include` globs. Defaults to the worker, the SPA and every
   * workspace package's `src`.
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
 * Backend suites excluded from the backend project: the SPA shapes live in the
 * web project, and integration is its own config.
 */
const BACKEND_EXCLUDE: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  'test/integration/**',
  'test/web/**',
  'test/**/web-*.test.{ts,tsx}',
  'apps/web/**/*.test.{ts,tsx}',
];

/**
 * SPA suite shapes collected by the web project.
 */
const WEB_INCLUDE: readonly string[] = ['test/web/**/*.test.{ts,tsx}', 'test/**/web-*.test.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'];

/**
 * Coverage `exclude`: the union of the unit and web halves' canonical sets.
 */
const CANONICAL_COVERAGE_EXCLUDE: readonly string[] = [
  'scripts/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.d.ts',
  '**/index.ts',
  '**/types.d.ts',
  '**/types.ts',
  '**/model/**',
  '**/generated/**',
  '**/D1Types.ts',
  '**/ServiceEnv.ts',
  '**/env.d.ts',
];

/**
 * Build the single-file `projects` config.
 *
 * ```ts
 * // vitest.config.mts
 * import { defineRepoVitestConfig } from '@rexezuge/tooling/vitest-repo';
 * export default defineRepoVitestConfig({
 *   scope: '@myapp',
 *   web: { environment: 'happy-dom' },
 *   thresholds: { statements: 87, branches: 77, functions: 88, lines: 90 },
 * });
 * ```
 */
export function defineRepoVitestConfig(options: RepoVitestConfigOptions): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const packages = options.packages ?? DEFAULT_WORKSPACE_PACKAGES;
  const mocks = options.mocks ?? DEFAULT_CLOUDFLARE_MOCKS;
  const noExternal = [...KIT_NO_EXTERNAL, ...(options.noExternal ?? [])];
  const backend = options.backend ?? {};
  const web = options.web ?? {};

  const backendAliases = [
    ...workspaceAliases({ scope: options.scope, root, packages, mocks }),
    ...(options.aliases ?? []),
    ...(backend.aliases ?? []),
  ];
  // `@/` means the SPA in the web project (Mail-Otter's SPA source imports
  // through it); the workspace table's `@/` → API entry is dropped and the
  // SPA's own prepended. `~/` → SPA either way.
  const webSrc = fileURLToPath(new URL('apps/web/src', root));
  const webAliases: VitestAlias[] = [
    { find: /^@\//, replacement: `${webSrc}/` },
    { find: /^~\//, replacement: `${webSrc}/` },
    // Drop the workspace table's `@/`/`~/` (RegExp) entries — the SPA's own
    // prepended above win — and keep the `@scope/*` + `cloudflare:*` strings.
    ...workspaceAliases({ scope: options.scope, root, packages, mocks }).filter((alias) => typeof alias.find === 'string'),
    ...(options.aliases ?? []),
    ...(web.aliases ?? []),
  ];

  return defineConfig({
    test: {
      projects: [
        {
          resolve: { alias: backendAliases, noExternal },
          test: {
            name: 'backend',
            globals: true,
            environment: 'node',
            include: [...(backend.include ?? ['test/**/*.test.{ts,tsx}'])],
            exclude: [...(backend.exclude ?? BACKEND_EXCLUDE)],
            ...(backend.setupFiles !== undefined && { setupFiles: [...backend.setupFiles] }),
            server: { deps: { inline: [...(backend.serverDepsInline ?? ['dofs'])] } },
          },
        },
        {
          ...(web.plugins !== undefined && { plugins: [...web.plugins] }),
          resolve: { alias: webAliases, noExternal },
          test: {
            name: 'web',
            globals: true,
            environment: web.environment ?? 'jsdom',
            include: [...(web.include ?? WEB_INCLUDE)],
            exclude: [...(web.exclude ?? ['**/node_modules/**', '**/dist/**', 'test/integration/**'])],
            pool: 'threads',
            ...(web.setupFiles !== undefined && { setupFiles: [...web.setupFiles] }),
          },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: options.reportsDirectory ?? './coverage',
        include: [
          ...(options.coverageInclude ?? [
            'apps/api/src/**/*.ts',
            'apps/background/src/**/*.ts',
            'apps/web/src/**/*.{ts,tsx}',
            'packages/**/src/**/*.ts',
          ]),
        ],
        exclude: [...CANONICAL_COVERAGE_EXCLUDE, ...(options.coverageExclude ?? [])],
        ...(options.thresholds !== undefined && { thresholds: { ...options.thresholds } }),
      },
    },
  });
}
