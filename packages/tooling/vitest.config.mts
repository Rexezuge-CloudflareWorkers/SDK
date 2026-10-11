import { defineConfig } from 'vitest/config';

/**
 * The kit's own test gate.
 *
 * Not defineUnitVitestConfig(): that factory describes a consumer monorepo layout,
 * and none of it exists here. What it shares with every consumer repo is the part
 * that matters: globals is on, so describe/it/expect/vi are ambient exactly as they
 * are under each repo's own vitest.config.mts. A suite that has to import them
 * explicitly reads as if the runner were configured differently from the one the
 * suites were written against, which is how a test ends up green in the kit and red
 * in the repo.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
