// Quality-gate test config. Protected from agent edits.
//
// One run over the workspace (#25): each package's tests run under that
// package's own vitest config, as a vitest project, and one coverage report
// holds the kit's thresholds over `sourceGlobs`.
//
// Outside the gate, as black-box suites that ci.yml runs on their own:
// - apps/web's feature suite (vitest.feature.config.ts): drives the built
//   Next app against its own database, not the source under coverage;
// - apps/web's smoke suite (vitest.smoke.config.ts): runs against a deployed
//   staging URL;
// - apps/web's E2E suite (Playwright, e2e/): a browser against a server;
// - tools/migrate/test/reader*.test.ts: the reader end to end, which builds
//   and starts its own MySQL, Postgres and sportbet image containers and,
//   for parity, needs sportbet's image built on the PC.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

interface QualityConfig {
  sourceGlobs: string[];
  testGlobs: string[];
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
}

const quality = JSON.parse(
  readFileSync(
    new URL('./quality/quality.config.json', import.meta.url),
    'utf8',
  ),
) as QualityConfig;

// What the kit's own root config set for every test, held in every project.
const gateTest = {
  allowOnly: false,
  sequence: { shuffle: false },
};

export default defineConfig({
  test: {
    passWithNoTests: false,
    projects: [
      {
        extends: './packages/domain/vitest.config.ts',
        root: './packages/domain',
        test: { name: 'domain', ...gateTest },
      },
      {
        extends: './packages/db/vitest.config.ts',
        root: './packages/db',
        test: { name: 'db', ...gateTest },
      },
      {
        extends: './tools/migrate/vitest.config.ts',
        root: './tools/migrate',
        test: {
          name: 'migrate',
          ...gateTest,
          // The reader's end-to-end tests: see the header.
          exclude: ['**/node_modules/**', 'test/reader*.test.ts'],
        },
      },
      {
        extends: './apps/web/vitest.component.config.ts',
        root: './apps/web',
        test: { name: 'web', ...gateTest },
      },
    ],
    coverage: {
      provider: 'v8',
      include: quality.sourceGlobs,
      exclude: quality.testGlobs,
      reporter: ['text-summary', 'json', 'html'],
      reportsDirectory: 'coverage',
      thresholds: quality.coverage,
    },
  },
});
