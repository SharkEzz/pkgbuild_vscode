import { defineConfig } from 'vitest/config';

/** Base config shared by every package's vitest.config.ts. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Fixtures are read from disk by the parser and analyzer suites.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
