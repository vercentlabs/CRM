import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The baseline schema migration runs against a real database when TEST_DATABASE_URL is set.
    testTimeout: 30_000,
  },
});
