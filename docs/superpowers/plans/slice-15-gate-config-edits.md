# Slice 15: gate-config edits for the network guard (the owner applies)

Task 1 of `2026-10-13-euroleague-import.md`: no test may reach a host but
this machine. The guard's source is written and unit-tested:

- `packages/domain/src/network-guard.ts` - `installNetworkGuard` wraps
  `globalThis.fetch` and throws `network is closed in tests: <host>` for any
  host but `localhost`, `127.0.0.1` and `::1`.
- `packages/domain/src/network-guard-setup.ts` - the Vitest setup file that
  calls it. One shared file; every project lists it.

The files below are gate configuration, which agents may not edit. Make the
edits by hand. A test's own `vi.stubGlobal('fetch', ...)` runs after the setup
file and still wins.

Until they are made, exactly these fail, and nothing else in the slice:

- `packages/domain/src/network-guard.test.ts` ("is installed in this project: the global fetch refuses a remote host")
- `packages/db/test/network-guard.test.ts` ("refuses a remote host before any connection is made")
- `tools/migrate/test/network-guard.test.ts` (same name)
- knip: `Unused files: packages/domain/src/network-guard-setup.ts`

## Who edits what

The owner edits files 1 to 4 and 6. File 5 is `apps/web/vitest.component.config.ts`:
the owner edits it too (the other option, a line in `apps/web/src/test-setup.ts`,
is web-dev's file and is not needed).

## 1. `packages/domain/vitest.config.ts`

Current:

```ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

Add the line after `include`:

```ts
    setupFiles: ['src/network-guard-setup.ts'],
```

## 2. `packages/db/vitest.config.ts`

Current:

```ts
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
```

Add after `include` (path from the config's root, `packages/db`):

```ts
    setupFiles: ['../domain/src/network-guard-setup.ts'],
```

## 3. `tools/migrate/vitest.config.ts`

Current:

```ts
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
```

Add after `include` (root `tools/migrate`):

```ts
    setupFiles: ['../../packages/domain/src/network-guard-setup.ts'],
```

## 4. `apps/web/vitest.feature.config.ts`

Current:

```ts
    environment: 'node',
    include: ['tests/feature/**/*.test.ts'],
    globalSetup: ['tests/feature/global-setup.ts'],
```

Add after `include` (root `apps/web`):

```ts
    setupFiles: ['../../packages/domain/src/network-guard-setup.ts'],
```

The suite talks to the started app and Mailpit on `localhost` /
`127.0.0.1`, which the guard lets through.

## 5. `apps/web/vitest.component.config.ts`

Current:

```ts
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
```

Replace the `setupFiles` line with:

```ts
    setupFiles: [
      '../../packages/domain/src/network-guard-setup.ts',
      'src/test-setup.ts',
    ],
```

The root `vitest.config.ts` runs each of files 1 to 3 and 5 as a project with
`root` set to its package, so the same relative paths resolve there.

## 6. `eslint.config.mjs`

Insert one new block between the `packages/db/test/**` block and the
`apps/web/src/**` block. Quoted so the spot can be found:

```js
  {
    files: ['packages/db/test/**/*.ts', 'packages/db/src/testing/**/*.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|@sportbet/migrate|next|react|react-dom)(/|$)',
      message: 'db must not depend on web or migrate (web -> db -> domain).',
    }),
  },
  // >>> insert the block below here <<<
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
```

The block:

```js
  {
    // Slice 15: the Euroleague feed is reached only through EuroleagueFeed.
    // domain and db never use the `fetch` global; the live adapter
    // (packages/db/src/import/feed.ts) is the one place that names the host
    // and may use it, with the guard and the tests.
    files: ['packages/domain/**/*.ts', 'packages/db/**/*.ts'],
    ignores: [
      'packages/db/src/import/feed.ts',
      'packages/domain/src/network-guard.ts',
      'packages/domain/src/network-guard-setup.ts',
      '**/*.test.ts',
      'packages/db/test/**/*.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'reach the Euroleague feed only through EuroleagueFeed (packages/db/src/import/feed.ts).',
        },
      ],
    },
  },
```

Why the ignores: `feed.ts` types its injected `fetchFn` as `typeof fetch`
and uses `fetch` as `euroleagueFeedOf`'s default; `network-guard.ts` wraps it;
tests call or type it (the guard proofs, `import-feed.test.ts`). The config
currently sets no `no-restricted-globals` for these files; if it ever does,
merge the `fetch` entry into that list, since a later block replaces an earlier
one's list.

## Verify

```
pnpm test:unit
pnpm test:db
pnpm test:migrate
pnpm lint
node quality/gate.mjs check
```

Must be green afterwards: the three network-guard proof tests (domain, db,
migrate); knip no longer reporting `network-guard-setup.ts`; `pnpm lint`
clean. To see the lint rule bite, add `void fetch;` to any
`packages/domain/src/**` or `packages/db/src/**` file other than `feed.ts`,
watch `pnpm lint` fail, then remove it.
