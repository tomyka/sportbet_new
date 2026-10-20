# Issue #45: gate-config edits for removing the production-copy reader (the owner applies)

`tools/migrate` is gone, so every gate file that names it must drop it. Agents
may not edit these files. Until all are made the gate fails (vitest cannot find
the `migrate` project, knip and dependency-cruiser name a missing workspace).

## 1. `vitest.config.ts`

Delete this line from `projects`:

```ts
      project('migrate', 'tools/migrate', 'vitest.config.ts'),
```

## 2. `knip.json`

Delete the workspace:

```json
    "tools/migrate": {
      "entry": ["src/bin/*.ts"]
    },
```

## 3. `quality/quality.config.json`

Delete the `testsOutsideGate` entry (and the comma after the entry before it):

```json
    {
      "glob": "tools/migrate/test/reader*.test.ts",
      "reason": "The reader end to end: starts its own MySQL, Postgres and sportbet image containers, and for parity needs sportbet's image built on the PC."
    }
```

## 4. `.dependency-cruiser.cjs`

Delete the two rules `nothing-imports-migrate` and `migrate-not-to-web`
(lines about 124 to 139), and reword the comments naming migrate at about
lines 52 and 74-76 (`migrate -> db -> domain beside web` becomes
`db -> domain beside web`; rule `db-not-to-web-or-migrate` may keep its name).

## 5. `eslint.config.mjs`

- Delete the two blocks `files: ['tools/migrate/**/*.ts']` (about lines 296-314)
  and `files: ['tools/migrate/test/**/*.ts', ...]` (about lines 315-322).
- Remove `@sportbet/migrate|` from the three import regexes (about lines 251,
  259 and 292) and drop "or migrate" / "nor the reader" from their messages.
- The comment at about line 69 and the `migrate` alternative in the regex at
  line 78 (`...|domain|web|migrate)`) may lose `migrate`.

## Verify

```
pnpm lint
node quality/gate.mjs check
```
