import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/feature/**/*.test.ts'],
    setupFiles: ['../../packages/domain/src/network-guard-setup.ts'],
    globalSetup: ['tests/feature/global-setup.ts'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
