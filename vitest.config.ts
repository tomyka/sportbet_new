// Quality-gate test config. Protected from agent edits.
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

export default defineConfig({
  test: {
    include: quality.testGlobs.map((g) => (g.startsWith('**') ? g : `**/${g}`)),
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**'],
    allowOnly: false,
    passWithNoTests: false,
    sequence: { shuffle: false },
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
