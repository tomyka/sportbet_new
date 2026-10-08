// Quality-gate mutation testing config. Protected from agent edits.
// quality/gate.mjs overrides "mutate" and the break threshold for changed-files runs.
import { readFileSync } from 'node:fs';

const quality = JSON.parse(
  readFileSync(
    new URL('./quality/quality.config.json', import.meta.url),
    'utf8',
  ),
);

export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [...quality.sourceGlobs, ...quality.testGlobs.map((g) => `!${g}`)],
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 60, break: quality.mutation.breakFull },
  concurrency: 4,
  timeoutMS: 10000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
