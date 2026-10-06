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
  The totals of one rule set's stored rows are summed only by
  `sumTournamentTotals`, which `recalculateTournament` uses too; outside
  it, the database reads them only through `loadTournamentTotals`.
  The database saves derived rows only through `recalculateUnderRuleSet`
  (`packages/db/src/recalculation/`): it reads what the rule set reads,
  calls `recalculateTournament` once and saves under the rule set's name.
- Domain values are fixed-point integers (`Points` in hundredths,
  `StandingsPoints` in ten-thousandths); no float is stored or compared.
  Floats appear only inside the crowd-odds formula, before `phpRound`, the
  port of PHP 8.4's `round()` proven by `packages/domain/test/php-reference/`.
- Invalid input to a domain factory or method is a typed refusal (a
  `Result`), never an exception; an impossible state throws. The one
  exception is a posted form checked field by field, as Laravel reports
  every field (`predictionFormEntry`): its refusal lists the fields' errors.
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
- An email address is an identity (sportbet #41): stored normalized
  (`normalizeEmail`), and looked up only by exact equality
  (`findAccountByEmail`). `email_fold()` / `foldEmail` is the key of the
  unique index that refuses a second spelling, and registration's uniqueness check (`isEmailRegistered`), never a lookup; no ILIKE,
  `unaccent` or citext touches an address (`packages/db/test/account.test.ts`).
  Sign-in state is cookies the server signs or hashes, or checks again on
  every read (`sb_signin_open`, `sb_intended`, `sb_return`), all in
  `apps/web/src/server/cookies.ts` (`__Host-sb_session`, `__Host-sb_signin`,
  `__Host-sb_signin_open`, `__Host-sb_register`, `__Host-sb_intended`, `__Host-sb_flash`, `__Host-sb_return`), each sealed value bound to its purpose (`apps/web/src/server/sealed.ts`); a session is started, read, extended and ended
  only through `apps/web/src/server/session/session.ts`. A `__Host-` cookie
  is cleared with its own flags and Max-Age 0, never `cookies().delete()`.
  A one-time message is a sealed `__Host-sb_flash` set by a route handler
  and forwarded once by `proxy.ts` (`server/flash.ts`), which passes on only
  the shapes the server writes; where sign-in returns is `__Host-sb_return`,
  kept only for a guarded page's path (`guardedReturnPath`, then
  `safeReturnPath`, `server/sign-in/return-path.ts`), for 15 minutes, and
  forgotten by `startSession` and `endSession` themselves.
  The mail transport follows `SPORTBET_ENV` (staging: `resend-allow-list`,
  production: `resend`, Mailpit only locally and in CI).
- Joining a tournament is decided by `joinTournament`
  (`packages/domain/src/joining/`) and written only by
  `registerForTournament` (`packages/db/src/joining/`): rows inserted where
  missing, a late joiner's fill-ins scored through
  `recalculateUnderRuleSet`. An account is created only by `createAccount`,
  in one transaction with its settings and its tournament. An emailed code
  is checked only through the shared code check (sign-in and registration).
- A tournament's hub data (status, start date, sport, description, public
  switch) is its `TournamentProfile`, beside `Tournament`, never in it. A
  tournament, its profile and its registration window are read together
  only through the catalogue (`packages/db/src/tournament/catalogue.ts`).
  The hub's and the tournament pages' data come from `packages/db/src/hub/`
  (`loadHub`, `loadTournamentPage`, `loadRegistrationForm`,
  `findVisibleTournament`), which apply R-50 and R-55 through the rule set;
  what a guest's panels list is decided in the domain (`guestPanels`), and
  the next games through `Game.isOpenAt`. Sign-up asks `joinableOnSignUp`
  (R-50) for both its tournament and whether it is open at all. Actions that
  leave a message or must not be prefetched are route handlers answering a
  real 303, not Server Actions.
- A match prediction is decided by `predictMatch`
  (`packages/domain/src/prediction/predict-match.ts`), after the posted pair
  passes `predictionFormEntry` in sportbet's order, and written only by
  `savePrediction` (`packages/db/src/prediction/save.ts`): one transaction
  holding the player's own row (issue 254), judged open at the moment that
  row is locked, then the player's `tournament_players` rows in tournament
  id order (anything else locking both takes them in that order), the
  status a save switches back on (`statusAfterSave`, R-7, R-19, R-57) and
  the audit row for a saved score (`audit_prediction_games`, erased with
  the account, R-25; empty at switch-over, R-60). Saves are limited per
  player (`predictionSaveLimits`). Odds shown before a result - the list's
  panel and the save's answer - are computed on read from the votes
  (`CrowdOdds.forGame`, R-61), never stored: `game_odds` holds only what a
  scored game was scored with. Which lines the list shows and what each
  carries is decided in the domain (`shownPredictions`,
  `predictionLinesOf`). Each page a guest may return to after sign-in has
  its path builder and its matcher together in `GUARDED_PAGES`
  (`components/shell/shell-paths.ts`), checked by `guardedReturnPath`.
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
  `READ_COLUMNS` (`users`: `id`, `username`, `name`, `surname` and `email` - the owner's consent, slice 4b - never a Google id, token or password),
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
