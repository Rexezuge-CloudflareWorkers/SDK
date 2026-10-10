/**
 * The SPA's test and coverage gate.
 *
 * Provenance: converged from Durable-DAV-Router's and Mail-Otter's
 * `vitest.web.config.mts`, which are the two repos that gave the frontend its own
 * suite. Durable-DAV-Router's is the canonical shape — it is the one that records
 * *why* the split exists; Mail-Otter's contributes the React plugin and the
 * `apps/web/**` include.
 *
 * Canonical decisions:
 *
 * 1. **It is a separate config, not a `projects` entry in one.** With a single
 *    config the SPA suites ran under `node` and the worker suites under `jsdom`
 *    in the same pass, so a test could pass in one environment and fail in the
 *    other with neither run noticing.
 * 2. **`pool: 'threads'`, bounded, rather than one forked worker per file.** Each
 *    jsdom document is a whole browser environment; a fork per file exhausts
 *    memory on a constrained machine, and when it does the run dies partway with
 *    a bare "Worker exited unexpectedly" and no test reports a failure — which
 *    reads as a flaky suite rather than as an out-of-memory kill.
 * 3. **jsdom is set here for every file**, rather than a `@vitest-environment`
 *    pragma per file: these are the tests that need a DOM, and the pragma is one
 *    more place to forget.
 * 4. **`include` covers both shapes the repos use** — the root-suite `web-*`
 *    naming convention and suites bundled under `apps/web` — and the same globs
 *    are what `defineUnitVitestConfig()` excludes.
 */

import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import type { CoverageThresholds, VitestAlias } from './vitest';

/**
 * What `defineWebVitestConfig` accepts.
 */
export interface WebVitestConfigOptions {
  /**
   * Vite plugins the SPA needs — `@vitejs/plugin-react` for a React app. Passed
   * by the consumer rather than imported here, because the kit must stay
   * zero-dependency and the plugin belongs to the app, not the harness.
   */
  readonly plugins?: readonly Plugin[];
  /**
   * Extra resolver entries.
   */
  readonly aliases?: readonly VitestAlias[];
  /**
   * The repo root, as a file URL.
   */
  readonly root?: string;
  /**
   * Which suites to collect. Defaults to both shapes the source repos use.
   */
  readonly include?: readonly string[];
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
 * The default suite globs: the root-suite `web-*` convention and the
 * bundled-under-`apps/web` convention, so either layout works unchanged.
 */
const DEFAULT_INCLUDE: readonly string[] = ['test/**/web-*.test.{ts,tsx}', 'apps/web/**/*.test.{ts,tsx}'];

/**
 * Build the SPA's test config.
 *
 * ```ts
 * // vitest.web.config.mts
 * import react from '@vitejs/plugin-react';
 * import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';
 * export default defineWebVitestConfig({ plugins: [react()] });
 * ```
 */
export function defineWebVitestConfig(options: WebVitestConfigOptions = {}): ReturnType<typeof defineConfig> {
  const root = options.root ?? new URL('.', import.meta.url).href;
  const webSrc = fileURLToPath(new URL('apps/web/src', root));
  const aliases: VitestAlias[] = [{ find: /^@\//, replacement: `${webSrc}/` }, ...(options.aliases ?? [])];

  return defineConfig({
    ...(options.plugins !== undefined && { plugins: [...options.plugins] }),
    resolve: { alias: aliases },
    test: {
      globals: true,
      environment: 'jsdom',
      include: [...(options.include ?? DEFAULT_INCLUDE)],
      // Threads, bounded, rather than one forked worker per file — see the
      // header. A custom `exclude` replaces Vitest's defaults, so `node_modules`
      // must be re-listed.
      pool: 'threads',
      exclude: ['**/node_modules/**', '**/dist/**', 'test/integration/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        reportsDirectory: options.reportsDirectory ?? './coverage-spa',
        include: ['apps/web/src/**/*.{ts,tsx}'],
        exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/types.ts', '**/generated/**'],
        ...(options.thresholds !== undefined && { thresholds: { ...options.thresholds } }),
      },
    },
  });
}
