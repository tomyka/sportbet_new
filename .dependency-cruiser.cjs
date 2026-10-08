// Architecture rules. Protected from agent edits.
// The kit's rules, over every workspace package's src (#25), then the repo's
// layering (decision 5, as CLAUDE.md states it): the same rules lint holds in
// eslint.config.mjs, proved a second way on the resolved import graph.

// A package's source, its test files and its test-only entries.
const PACKAGE_SRC = '^(apps|packages|tools)/[^/]+/src/';
const TEST_FILE = '\\.(test|spec)\\.[cm]?tsx?$';
// Test-only code that lives in src: db's and domain's test entries, and web's
// component-test setup. Runtime code never imports them (rule below).
const TEST_ONLY_SRC = [
  '^packages/db/src/testing/',
  '^packages/domain/src/testing\\.ts$',
  '^apps/web/src/test-setup\\.ts$',
];
// A package from node_modules, however pnpm lays it out.
const npm = (names) => `(^|/)node_modules/(${names})/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make code hard to change and test.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-test-imports-in-src',
      severity: 'error',
      comment: 'Production code must not import test files.',
      from: { pathNot: TEST_FILE },
      to: { path: TEST_FILE },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment:
        "Production code must not depend on devDependencies (each package's own package.json).",
      from: { path: PACKAGE_SRC, pathNot: [TEST_FILE, ...TEST_ONLY_SRC] },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },

    // Decision 5: the direction of dependencies, web -> db -> domain, and
    // migrate -> db -> domain beside web.
    {
      name: 'domain-imports-only-zod',
      severity: 'error',
      comment:
        'domain imports only zod and its own files: no framework, database or I/O (decision 3).',
      from: { path: '^packages/domain/src/', pathNot: TEST_FILE },
      to: { pathNot: ['^packages/domain/src/', npm('zod')] },
    },
    {
      name: 'domain-tests-import-only-zod-and-vitest',
      severity: 'error',
      comment: 'domain tests import only zod, vitest and domain files.',
      from: { path: `^packages/domain/src/.*${TEST_FILE}` },
      to: {
        pathNot: [
          '^packages/domain/(src|test)/',
          npm('zod|vitest|@vitest/[^/]+'),
        ],
      },
    },
    {
      name: 'db-not-to-web-or-migrate',
      severity: 'error',
      comment: 'db must not depend on web or migrate (web -> db -> domain).',
      from: { path: '^packages/db/' },
      to: { path: ['^apps/', '^tools/', npm('next|react|react-dom')] },
    },
    {
      name: 'web-reaches-the-database-only-through-db',
      severity: 'error',
      comment:
        'web reaches the database only through @sportbet/db, never its migrations, nor the reader, nor a driver of its own.',
      from: { path: '^apps/web/src/' },
      to: {
        path: [
          npm('pg|drizzle-orm'),
          '^packages/db/src/migrations\\.ts$',
          '^tools/',
        ],
      },
    },
    {
      name: 'runtime-not-to-test-only-entries',
      severity: 'error',
      comment:
        'Runtime code never imports a test-only entry (@sportbet/db/testing, @sportbet/domain/testing) or test tooling.',
      from: { path: PACKAGE_SRC, pathNot: [TEST_FILE, ...TEST_ONLY_SRC] },
      to: {
        path: [
          ...TEST_ONLY_SRC,
          npm('vitest|@vitest/[^/]+|@testing-library/[^/]+'),
        ],
      },
    },
    {
      name: 'cross-package-through-entry-points',
      severity: 'error',
      comment:
        'Another package is reached only through its package.json exports, never its files.',
      from: { path: '^((apps|packages|tools)/[^/]+)/' },
      to: {
        path: '^(apps|packages|tools)/',
        pathNot: [
          '^$1/',
          '^packages/domain/src/(index|testing)\\.ts$',
          '^packages/db/src/(index|migrations)\\.ts$',
          '^packages/db/src/testing/index\\.ts$',
        ],
      },
    },
    {
      name: 'nothing-imports-migrate',
      severity: 'error',
      comment:
        'The production-copy reader sits beside web: nothing imports it.',
      from: { pathNot: '^tools/migrate/' },
      to: { path: '^tools/migrate/' },
    },
    {
      name: 'migrate-not-to-web',
      severity: 'error',
      comment:
        'migrate -> db -> domain: the reader never reaches web, next or react.',
      from: { path: '^tools/migrate/' },
      to: { path: ['^apps/', npm('next|react|react-dom')] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|reports|\\.stryker-tmp|\\.next)/' },
    tsPreCompilationDeps: true,
    // No tsConfig: there is no root project (each package has its own), and
    // no package uses `paths`; @sportbet/* resolves through the workspace's
    // node_modules links and each package.json's exports.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
