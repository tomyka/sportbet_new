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
- Agent teams: the roles are in `.claude/agents/`; which team fits which
  stage, and the rules a team works by (only the lead commits, each
  teammate in its own folders), are in `docs/agent-team.md`.

## Code rules (decision 5, and the walking skeleton)

- `packages/domain` imports only `zod`; `packages/db` never imports web code;
  `apps/web` reaches the database only through `@sportbet/db`, and never its
  `/testing` entry outside tests. `tools/migrate` (the production-copy
  reader) sits beside web: migrate -> db -> domain, and nothing imports
  migrate. Lint enforces it, including relative paths.
- A difference between sportbet's rules and the owner's rulings goes in
  `RuleSet` (`packages/domain/src/rules/rule-set.ts`), nowhere else: one
  field per difference, named after its catalogue rule and ruling, with a
  test under both `sportbetRules` and `ruledRules`. Every domain method a
  difference touches takes the rule set as a parameter; nothing reads a
  global.
- Stored points rows (`game_odds`, `point_results`, `point_standings`,
  `point_survivals`) and players' totals are derived only through
  `recalculateTournament` (`packages/domain/src/recalculation/`), one call
  per tournament and rule set; the per-area scorers behind it are internal.
  The database saves derived rows only through `recalculateUnderRuleSet`
  (`packages/db/src/recalculation/`): it reads what the rule set reads,
  calls `recalculateTournament` once and saves under the rule set's name.
- Domain values are fixed-point integers (`Points` in hundredths,
  `StandingsPoints` in ten-thousandths); no float is stored or compared.
  Floats appear only inside the crowd-odds formula, before `phpRound`, the
  port of PHP 8.4's `round()` proven by `packages/domain/test/php-reference/`.
- Invalid input to a domain factory or method is a typed refusal (a
  `Result`), never an exception; an impossible state throws.
- Every points row (`game_odds`, `match_points`, `standings_points`,
  `survival_points`) carries its `points_source` - `production`, `sportbet`
  or `ruled` - named by the caller of every repository function (for
  derived rows, through the rule set it passes to `recalculateUnderRuleSet`,
  whose name is the source), never
  defaulted, so a parity run can never overwrite or be read as the live
  `ruled` rows. Migrated rows keep sportbet's ids (saved with
  `overridingSystemValue`, then `advanceIdentitySequences`), except
  `survival_points`, whose derived rows share the table: every row there
  has its own generated id, and a production row keeps sportbet's in
  `sportbet_id`.
- Pages only load data (parse params, call a query) and return one
  component; markup lives in components, which have component tests.
- Colours exist only as the tokens in `apps/web/src/app/tokens.css`
  (sportbet's, light as the base and dark under `[data-theme='dark']`).
  Components use token utilities (`bg-rail`, `text-on-rail`) or
  `var(--color-...)`, never a literal, a palette class or a `dark:` variant;
  `apps/web/src/token-guard.test.ts` enforces it. The shell is told
  everything through `ShellView`; a navigation entry is added only with its
  page. Text is Lithuanian, written in the components (decision 13).
- Every query result is parsed with the domain schema before it leaves `db`.
- A rule held in both TypeScript and SQL is one `defineInvariant` in the
  domain (`packages/domain/src/invariant/`, e.g. `slugInvariant`): pattern,
  optional max length, and its own accepted and refused examples; the Zod
  schema comes from it, a pattern with a quote is refused, and so is an
  example the schema disagrees with. A rule on a whole number is a
  `defineRangeInvariant` beside it (e.g. `scoreSideInvariant`): a minimum,
  an optional maximum and its examples, rendered into the CHECK from
  validated integers; the domain's factories use its schema too. Each area lists its CHECKs as
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
  starts a container, migrates or builds a pool by hand. The one exception
  is the reader's end-to-end tests (`tools/migrate/test/reader*.test.ts`),
  since starting, loading and removing its own containers is what they
  test: they connect to the Postgres a `--keep` run leaves, and start a
  labelled container standing in for a crashed run's, only through
  `tools/migrate/test/support/reader-containers.ts`.
- Parity with sportbet beats a nicer rule: a constraint must accept every row
  production holds (e.g. slugs are `[a-z0-9-]`, up to 100, as sportbet
  validates them). Check the old code before tightening anything.
- A skipped or focused test is a lint error. Database and feature tests run in
  CI on real Postgres 18, before the deploy; E2E and smoke run again against
  staging after it. Write invisible characters in tests as escapes.
- The production-copy reader (`tools/migrate`) takes production data only
  from the latest nightly backup in the Oracle bucket, reads only
  `READ_COLUMNS` (`users`: `id` and `username`, never a name or email),
  loads only the throwaway Postgres it starts itself - it has no database
  URL option - and deletes the dump and both containers after every run. Its
  tests use only the synthetic dump built from the golden scenario; nothing
  of production goes to Vercel, Neon, GitHub, commits or logs. With
  `--parity` it also runs sportbet's own image
  (`sportbet-app:<commit>`, built on the PC from sportbet's
  commit, never pulled) on an internal Docker network beside its MySQL,
  labelled and removed like its containers, and keeps that copy's rows in
  memory only. The parity report may name a player by username, on the
  owner's PC only; what goes on an issue is the verdict and the counts per
  class.
- Migrations: change `packages/db/src/**/schema.ts`, then
  `pnpm --filter @sportbet/db db:generate --name <what>`; review and commit the
  SQL. Never edit a migration that has reached staging.

## Oracle account

The tenancy is Pay As You Go. Quota policy `always-free-caps` holds it at the
Always Free allowance (A1 only, 4 OCPU / 24 GB, 200 GB block storage) and
budget `always-free-watch` emails the owner on any real spend. With
sportbet-web, sportbet-ci and sportbet-new the account is exactly at the cap:
anything more is the owner's decision, made by changing the quota on purpose.
