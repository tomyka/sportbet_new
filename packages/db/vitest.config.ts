import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['../domain/src/network-guard-setup.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One database for the run; files take turns so truncation cannot race.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
