// Architecture rules. Protected from agent edits.
// Add your own layering rules at the bottom (examples included, commented out).
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
      from: { pathNot: '\\.(test|spec)\\.[cm]?tsx?$' },
      to: { path: '\\.(test|spec)\\.[cm]?tsx?$' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not depend on devDependencies.',
      from: { path: '^src', pathNot: '\\.(test|spec)\\.[cm]?tsx?$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    // Example layering rule: domain code must not reach into infrastructure.
    // {
    //   name: 'domain-is-pure',
    //   severity: 'error',
    //   from: { path: '^src/domain' },
    //   to: { path: '^src/(infra|api|ui)' },
    // },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|reports|\\.stryker-tmp)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
