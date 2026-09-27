import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import nextPlugin from '@next/eslint-plugin-next';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Decision 5: the direction of dependencies (web -> db -> domain) is enforced.
const deepImport = {
  regex: '^@sportbet/[^/]+/(src|dist)(/|$)',
  message: 'Import another package through its entry point, not its files.',
};
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns: [deepImport, ...patterns] }],
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
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
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
    rules: restrictImports({
      regex: '^(?!zod$)(?!\\.\\.?/)',
      message:
        'domain imports only zod and its own files: no framework, database or I/O (decision 3).',
    }),
  },
  {
    files: ['packages/domain/src/**/*.test.ts'],
    rules: restrictImports({
      regex: '^(?!zod$|vitest$)(?!\\.\\.?/)',
      message: 'domain tests import only zod, vitest and domain files.',
    }),
  },
  {
    files: ['packages/db/**/*.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|next|react|react-dom)(/|$)',
      message: 'db must not depend on web (web -> db -> domain).',
    }),
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.tsx', 'apps/web/src/test-setup.ts'],
    rules: restrictImports({
      regex: '^(pg|drizzle-orm|@sportbet/db/testing)(/|$)',
      message:
        'web reaches the database only through @sportbet/db, and never its test helpers.',
    }),
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
