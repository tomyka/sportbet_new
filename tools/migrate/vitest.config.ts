import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The map, the dump checks and the fetch rules run with no container;
    // load.test.ts writes into the suite's test database, and reader.test.ts
    // runs the whole reader on a synthetic dump, on the MySQL and Postgres
    // containers it starts itself.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One test database for the run; files take turns so truncation cannot race.
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
});
