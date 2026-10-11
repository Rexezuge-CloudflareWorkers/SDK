import { defineConfig } from 'vitest/config';

/**
 * The kit's own test gate — globals on, so describe/it/expect/vi are ambient
 * exactly as they are under each consumer repo's vitest.config.mts. See the
 * identical file in @rexezuge/runtime and @rexezuge/tooling for the reasoning.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
