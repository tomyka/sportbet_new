# CLAUDE.md

sportbet_new is the TypeScript rebuild of [sportbet](https://github.com/tomyka/sportbet)
(PHP / Laravel), which stays in production until this project reaches parity.

**Read `docs/decisions.md` first.** It records what was decided before any
code - stack, database, safety rules, parity bar, infrastructure - and why.
Do not reopen a decision there without the owner.

The rules this app must reproduce are specified in the old repo's
`CLAUDE.md` and `CONTEXT.md` (`D:\Projects\sportbet`). Never invent a scoring,
ranking or league rule: if those files do not state it, ask the owner.

## Workflow

- Every substantive request becomes a GitHub issue in `tomyka/sportbet_new`,
  closed when its acceptance criteria are met.
- Substantial work goes brainstorm -> spec -> plan before code.
- Trunk-based: work lands on `main`.

## Code rules (decision 5, and the walking skeleton)

- `packages/domain` imports only `zod`; `packages/db` never imports web code;
  `apps/web` reaches the database only through `@sportbet/db`, and never its
  `/testing` entry outside tests. Lint enforces it, including relative paths.
- Pages only load data (parse params, call a query) and return one
  component; markup lives in components, which have component tests.
- Every query result is parsed with the domain schema before it leaves `db`.
- A rule held in both TypeScript and SQL is one `defineInvariant` in the
  domain (`packages/domain/src/invariant/`, e.g. `slugInvariant`): pattern,
  optional max length, and its own accepted and refused examples; the Zod
  schema comes from it, a pattern with a quote is refused, and so is an
  example the schema disagrees with. Each area lists its CHECKs as
  `InvariantCheck`s beside its table (e.g. `tournamentInvariantChecks`) and
  builds the table's checks from that list with `invariantCheck`
  (`packages/db/src/invariant.ts`), the only place a pattern reaches SQL;
  `INVARIANT_CHECKS` (`packages/db/src/schema.ts`) gathers every area's list.
  `packages/db/test/invariant-checks.test.ts` proves each listed CHECK agrees
  with its invariant on every example (`describeInvariantCheck`), and fails
  on any CHECK in the database that is neither listed nor in its commented
  `NON_INVARIANT_CHECKS` allowlist.
- Database and feature tests get their database from `@sportbet/db/testing`:
  `startTestDatabase` in a global setup, `useTestDatabase` at the top of each
  test file (connects, empties every table before each test, closes). No test
  starts a container, migrates or builds a pool by hand.
- Parity with sportbet beats a nicer rule: a constraint must accept every row
  production holds (e.g. slugs are `[a-z0-9-]`, up to 100, as sportbet
  validates them). Check the old code before tightening anything.
- A skipped or focused test is a lint error. Database and feature tests run in
  CI on real Postgres 18, before the deploy; E2E and smoke run again against
  staging after it. Write invisible characters in tests as escapes.
- Migrations: change `packages/db/src/**/schema.ts`, then
  `pnpm --filter @sportbet/db db:generate --name <what>`; review and commit the
  SQL. Never edit a migration that has reached staging.

## Oracle account

The tenancy is Pay As You Go. Quota policy `always-free-caps` holds it at the
Always Free allowance (A1 only, 4 OCPU / 24 GB, 200 GB block storage) and
budget `always-free-watch` emails the owner on any real spend. With
sportbet-web, sportbet-ci and sportbet-new the account is exactly at the cap:
anything more is the owner's decision, made by changing the quota on purpose.
