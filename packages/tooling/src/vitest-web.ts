/**
 * The SPA's test and coverage gate.
 *
 * Provenance: converged from all nine repos' SPA suites — Durable-DAV-Router's
 * and Mail-Otter's `vitest.web.config.mts` (the two repos that gave the frontend
 * its own file), Mail-Meow's and CalDAV-Bridge's `projects` entries (the two
 * that keep backend and SPA in one file), and AWS-AccessBridge's
 * extension-split `dom` project. Durable-DAV-Router's file is the canonical
 * shape — it is the one that records *why* the split exists; Mail-Otter's
 * contributes the React plugin and the `apps/web/**` include; CalDAV-Bridge
 * contributes `happy-dom` and the `test/web/**` directory convention;
 * Mail-Meow contributes `setupFiles` and the note that projects do not inherit
 * the root `resolve`.
 *
 * Canonical decisions:
 *
 * 1. **A DOM for every file here**, rather than a `@vitest-environment` pragma
 *    per file: these are the tests that need a DOM, and the pragma is one more
 *    place to forget. `jsdom` is the family default (seven repos);
 *    `happy-dom` is CalDAV-Bridge's, and is one option away.
 * 2. **`pool: 'threads'`, bounded, rather than one forked worker per file.** Each
 *    jsdom document is a whole browser environment; a fork per file exhausts
 *    memory on a constrained machine, and when it does the run dies partway with
 *    a bare "Worker exited unexpectedly" and no test reports a failure — which
 *    reads as a flaky suite rather than as an out-of-memory kill.
 * 3. **`include` covers every shape the family uses** — the `test/web/**`
 *    directory convention, the root-suite `web-*` naming convention, and suites
 *    bundled under `apps/web` — and the same globs are what
 *    `defineUnitVitestConfig()` excludes, so a file is collected by exactly one
 *    config.
 * 4. **Projects do not inherit the root `resolve`** (Mail-Meow): a
 *    single-file `projects` composition must repeat the alias table per
 *    project. `defineRepoVitestConfig()` does that; two-file repos get it from
 *    these factories directly.
 * 5. **`@/` means the SPA here, not the API worker.** The unit config maps
 *    `@/` to `apps/api/src`; this config maps both `@/` (Mail-Otter's SPA
 *    source) and `~/` (Mail-Meow's and CalDAV-Bridge's SPA tests) to
 *    `apps/web/src`. Workspace `@scope/*` imports still resolve to the
 *    packages, so web tests reach shared logic the same way backend tests do.
 */

import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CLOUDFLARE_MOCKS, DEFAULT_WORKSPACE_PACKAGES, KIT_NO_EXTERNAL, workspaceAliases } from './vitest-aliases.ts';
import type { VitestAlias } from './vitest-aliases.ts';
import type { CoverageThresholds } from './vitest.ts';

/**
 * What `defineWebVitestConfig` accepts.
 */
export interface WebVitestConfigOptions {
  /**
   * The consuming repo's npm scope, e.g. `'@myapp'`. When supplied, `@scope/*`
   * workspace aliases are generated so web tests reach shared logic; when
   * omitted, only the `cloudflare:*`, `@/` and `~/` aliases apply.
   */
  readonly scope?: string;
  /**
   * Workspace package directory names. Defaults to the family superset.
   */
  readonly packages?: readonly string[];
  /**
   * Which `cloudflare:*` mocks to alias. Defaults to workers/sockets/workflows.
   */
  readonly mocks?: readonly string[];
  /**
   * Vite plugins the SPA needs — `@vitejs/plugin-react` for a React app. Passed
   * by the consumer rather than imported here, because the kit must stay
   * zero-dependency and the plugin belongs to the app, not the harness.
   */
  readonly plugins?: readonly Plugin[];
  /**
   * Extra resolver entries, applied after the canonical ones.
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * The repo root, as a file URL.
   */
  readonly root?: string;
  /**
   * The DOM implementation. `jsdom` is the family default; `happy-dom` is
   * CalDAV-Bridge's (lighter, and sufficient for its hook/service suites).
   */
  readonly environment?: 'jsdom' | 'happy-dom';
  /**
   * Which suites to collect. Defaults to every shape the family uses.
   */
  readonly include?: readonly string[];
  /**
   * Suite paths to skip, replacing the default.
   */
  readonly exclude?: readonly string[];
  /**
   * Setup files run before each test file.
   */
  readonly setupFiles?: readonly string[];
  /**
   * `node_modules` specifiers to inline through Vite rather than externalize.
   */
  readonly serverDepsInline?: readonly string[];
  /**
   * Resolver `noExternal` patterns, merged after {@link KIT_NO_EXTERNAL}.
   */
  readonly noExternal?: readonly (string | RegExp)[];
  /**
   * Coverage `include` globs. Defaults to the SPA source.
   */
  readonly coverageInclude?: readonly string[];
  /**
   * Coverage `exclude` globs, merged with the canonical set.
   */
  readonly coverageExclude?: readonly string[];
  /**
   * Coverage floors. Omitted by default; see `defineUnitVitestConfig`.
   */
  readonly thresholds?: CoverageThresholds;
  /**
   * Where the coverage report is written. Separate from the unit config's, so
   * the two gates never overwrite each other's report.
   */
  readonly reportsDirectory?: string;
}

/**
 * The default suite globs: every shape the family uses — the `test/web/**`
 * directory convention, the root-suite `web-*` convention, and the
 * bundled-under-`apps/web` convention — so any layout works unchanged.
 */
const DEFAULT_INCLUDE: readonly string[] = ['test/web/**/*.test.{ts,tsx}', 'test/**/web-*.test.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'];

/**
 * Coverage `exclude` globs for the SPA half.
 */
const CANONICAL_COVERAGE_EXCLUDE: readonly string[] = ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/types.ts', '**/generated/**'];

/**
 * Build the SPA's test config.
 *
 * ```ts
 * // vitest.web.config.mts
 * import react from '@vitejs/plugin-react';
 * import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';
 * export default defineWebVitestConfig({ scope: '@myapp', plugins: [react()] });
 * ```
 */
export function defineWebVitestConfig(options: WebVitestConfigOptions = {}): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const webSrc = fileURLToPath(new URL('apps/web/src', root));
  // The workspace table maps `@/` to the API worker; here `@/` means the SPA,
  // so drop its `@/`/`~/` entries and prepend the SPA's own. String finds
  // (`@scope/*`, `cloudflare:*`) survive; a placeholder scope contributes none.
  const scopePart = workspaceAliases({
    scope: options.scope ?? '@unused',
    root,
    packages: options.packages ?? DEFAULT_WORKSPACE_PACKAGES,
    mocks: options.mocks ?? DEFAULT_CLOUDFLARE_MOCKS,
  }).filter((alias) => typeof alias.find === 'string' && !alias.find.startsWith('@unused'));
  const aliases: VitestAlias[] = [
    { find: /^@\//, replacement: `${webSrc}/` },
    { find: /^~\//, replacement: `${webSrc}/` },
    ...scopePart.filter((alias) => typeof alias.find === 'string' && (alias.find.startsWith('cloudflare:') || options.scope !== undefined)),
    ...(options.aliases ?? []),
  ];

  return defineConfig({
    ...(options.plugins !== undefined && { plugins: [...options.plugins] }),
    resolve: { alias: aliases, noExternal: [...KIT_NO_EXTERNAL, ...(options.noExternal ?? [])] },
    test: {
      globals: true,
      environment: options.environment ?? 'jsdom',
      include: [...(options.include ?? DEFAULT_INCLUDE)],
      // Threads, bounded, rather than one forked worker per file — see the
      // header. A custom `exclude` replaces Vitest's defaults, so `node_modules`
      // must be re-listed.
      pool: 'threads',
      exclude: [...(options.exclude ?? ['**/node_modules/**', '**/dist/**', 'test/integration/**'])],
      ...(options.setupFiles !== undefined && { setupFiles: [...options.setupFiles] }),
      ...(options.serverDepsInline !== undefined && {
        server: { deps: { inline: [...options.serverDepsInline] } },
      }),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: options.reportsDirectory ?? './coverage-spa',
        include: [...(options.coverageInclude ?? ['apps/web/src/**/*.{ts,tsx}'])],
        exclude: [...CANONICAL_COVERAGE_EXCLUDE, ...(options.coverageExclude ?? [])],
        ...(options.thresholds !== undefined && { thresholds: { ...options.thresholds } }),
      },
    },
  });
}
