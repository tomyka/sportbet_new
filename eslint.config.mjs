import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import nextPlugin from '@next/eslint-plugin-next';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Decision 5: the direction of dependencies (web -> db -> domain, and
// migrate -> db -> domain beside web) is enforced.
const deepImport = {
  regex: '^@sportbet/[^/]+/(src|dist)(/|$)',
  message: 'Import another package through its entry point, not its files.',
};
// A relative import that climbs out of its own package (e.g. `../../db/src/client`
// from domain, or `../../../apps/web/src/env` from db) reaches another package's
// files without going through `@sportbet/*`, silently bypassing every rule below.
const crossPackageRelative = {
  regex: '^(\\.\\./)+(packages|apps|tools|db|domain|web|migrate)(/|$)',
  message:
    'Cross-package imports go through @sportbet/*, never a relative path.',
};
// A relative import of a package's own test-only entry (`./testing`,
// `../testing`), which runtime code must no more reach than `@sportbet/*/testing`.
const relativeTesting = {
  regex: '^(\\.\\.?/)+(.*/)?testing(/|$)',
  message: "Runtime code never imports its package's test-only entry.",
};
const restrictImports = (...patterns) => ({
  'no-restricted-imports': [
    'error',
    { patterns: [deepImport, crossPackageRelative, ...patterns] },
  ],
});

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      '**/.next/',
      '**/dist/',
      'packages/db/migrations/',
      '**/test-results/',
      '**/playwright-report/',
      '**/next-env.d.ts',
      '**/coverage/',
      '**/blob-report/',
      // Claude Code's agent worktrees: full copies of the repository.
      '.claude/worktrees/',
      // The quality kit: its scripts, its reports and the root configs it owns.
      'quality/',
      'reports/',
      '.stryker-tmp/',
      '**/*.d.ts',
      '*.config.*',
      '.dependency-cruiser.cjs',
    ],
  },
  // The quality kit's strict rules (no inline config, the complexity and size
  // budget, explicit boundary types) are switched on with the gate in CI (#25).
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  comments.recommended,
  {
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      // Decision 5: no `any`, no unchecked `as` (const assertions stay allowed).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Decision 5: every switch over a union is exhaustive, and a `default`
      // does not count as covering the missing cases.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'apps/web/smoke/**/*.ts'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectTypeOf'] },
      ],
    },
  },
  {
    files: ['apps/web/e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-skipped-test': 'error',
      'playwright/no-focused-test': 'error',
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: { '@next/next': nextPlugin },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  { rules: restrictImports() },
  {
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      ...restrictImports(relativeTesting, {
        regex: '^(?!zod$)(?!\\.\\.?/)',
        message:
          'domain imports only zod and its own files: no framework, database or I/O (decision 3).',
      }),
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'domain does no dynamic imports.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'time and randomness are injected into the domain.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'time and randomness are injected into the domain.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'time and randomness are injected into the domain.',
        },
      ],
    },
  },
  {
    files: ['packages/domain/src/**/*.test.ts'],
    rules: restrictImports({
      regex: '^(?!zod$|vitest$)(?!\\.\\.?/)',
      message: 'domain tests import only zod, vitest and domain files.',
    }),
  },
  {
    // db runtime code: never web, next or react (web -> db -> domain), and
    // never a test-only entry or test tooling - only packages/db/test and
    // db's own test entry (src/testing) may reach those (see the block below).
    files: ['packages/db/**/*.ts'],
    ignores: [
      'packages/db/test/**/*.ts',
      'packages/db/src/testing/**/*.ts',
      'packages/db/vitest.config.ts',
    ],
    rules: restrictImports(relativeTesting, {
      regex:
        '^(@sportbet/web|@sportbet/migrate|next|react|react-dom|@sportbet/domain/testing|vitest|@testcontainers/postgresql)(/|$)',
      message:
        "db must not depend on web or migrate (web -> db -> domain), nor on domain's test-only entry or test tooling outside tests.",
    }),
  },
  {
    files: ['packages/db/test/**/*.ts', 'packages/db/src/testing/**/*.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|@sportbet/migrate|next|react|react-dom)(/|$)',
      message: 'db must not depend on web or migrate (web -> db -> domain).',
    }),
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'apps/web/src/test-setup.ts'],
    rules: restrictImports({
      regex:
        '^(pg|drizzle-orm|@sportbet/migrate|@sportbet/db/testing|@sportbet/db/migrations|@sportbet/domain/testing)(/|$)',
      message:
        "web reaches the database only through @sportbet/db, and never its test helpers or its migrations, nor domain's test-only entry, nor the reader.",
    }),
  },
  {
    // The production-copy reader's runtime code (spec 2.2): db and domain
    // through their entry points, zod, mysql2, the container tooling and
    // Node built-ins - never web, next, react or a test-only entry.
    files: ['tools/migrate/**/*.ts'],
    ignores: [
      'tools/migrate/test/**/*.ts',
      'tools/migrate/src/**/*.test.ts',
      'tools/migrate/vitest.config.ts',
    ],
    rules: restrictImports(relativeTesting, {
      regex:
        '^(?!(@sportbet/db|@sportbet/db/migrations|@sportbet/domain|zod|mysql2|mysql2/promise|testcontainers|@testcontainers/mysql|@testcontainers/postgresql|node:[a-z/_]+)$)(?!\\.\\.?/)',
      message:
        'migrate imports only @sportbet/db (and its migrations entry), @sportbet/domain, zod, mysql2, the container tooling and Node built-ins (migrate -> db -> domain).',
    }),
  },
  {
    // Its tests may also reach the two test-only entries and vitest.
    files: ['tools/migrate/test/**/*.ts', 'tools/migrate/src/**/*.test.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|next|react|react-dom|pg|drizzle-orm)(/|$)',
      message:
        'migrate tests reach the database only through @sportbet/db and its test entry.',
    }),
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
