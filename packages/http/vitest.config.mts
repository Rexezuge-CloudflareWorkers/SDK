import { defineConfig } from 'vitest/config';

/**
 * The kit's own test gate — see `packages/runtime/vitest.config.mts` for why
 * this is hand-rolled rather than `defineUnitVitestConfig()`.
 *
 * Node, not workerd: the pieces worth testing here are the bucket store, the
 * client-IP derivation, the Retry-After arithmetic, and the header table — all
 * plain functions. The Hono context is a structural type this package accepts
 * rather than constructs, so a `Context` double is enough and the Workers pool
 * would buy nothing here.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
