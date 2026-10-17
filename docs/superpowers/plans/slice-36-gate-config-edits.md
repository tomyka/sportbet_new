# Issue #36: gate-config edits for the narrow @sportbet/db entry points (the owner applies)

Web and the reader now import `@sportbet/db/<area>` entry points
(`packages/db/src/entries/*.ts`, listed in `packages/db/package.json` `exports`)
for code that never touches the points tables, so a static mutant in a db schema
file re-runs far fewer tests (Stryker, web and migrate projects: 974 tests
before, 146 after). Two gate files must allow the new paths; agents may not edit
them. Until both are made the gate fails on lint and architecture, nothing else.

## 1. `.dependency-cruiser.cjs`

Rule `cross-package-through-entry-points`, its `pathNot` list. After the line

```js
          '^packages/db/src/(index|migrations)\.ts$',
```

add:

```js
          '^packages/db/src/entries/[a-z-]+\.ts$',
```

Without it: 112 violations, one per web or migrate import of an entry.

## 2. `eslint.config.mjs`

The `tools/migrate/**` runtime block (about line 309). The negative-lookahead
allow-list currently starts

```
'^(?!(@sportbet/db|@sportbet/db/migrations|@sportbet/domain|zod|...
```

Insert `@sportbet/db/(?:account|admin|connection|edge|import|league|points|prediction|reminder|result|standings|tournament)|`
after `@sportbet/db/migrations|`, so it reads

```
'^(?!(@sportbet/db|@sportbet/db/migrations|@sportbet/db/(?:account|admin|connection|edge|import|league|points|prediction|reminder|result|standings|tournament)|@sportbet/domain|zod|...
```

Without it: 22 lint errors, all in `tools/migrate/src`. The web block needs no
change (it bans only `/testing` and `/migrations`). knip needs nothing.

## Verify

```
pnpm lint
node quality/gate.mjs check
```

Checked by the agent against copies of both configs kept outside the repo:
depcruise reports no violations and eslint over web, migrate and db reports 0
errors.
