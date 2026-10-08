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
  (`packages/db/src/recalculation/`), under a `TournamentLock`: it reads
  what the rule set reads, calls `recalculateTournament` once and saves
  under the rule set's name.
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
  `safeReturnPath`, `server/sign-in/guarded-pages.ts`; the cookie in
  `server/sign-in/return-path.ts`), for 15 minutes, and
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
  passes `predictionFormEntry` in sportbet's order, from both posted ids
  (the row's game and `gameID` must agree, issue 254), and written only by
  `savePrediction` (`packages/db/src/prediction/save.ts`): one transaction
  holding the game row and the player's own row (the lock order below),
  judged open at the moment that row is locked, the status a save
  switches back on (`statusAfterSave`, R-7, R-19, R-57) and the audit row
  for a saved score (`audit_prediction_games`, erased with the account,
  R-25; empty at switch-over, R-60). Accepted saves are limited per player
  (`predictionSaveLimits`); a post the form refuses does not count. Odds
  shown before a result - the list's panel and the save's answer - are
  computed on read from the votes (`CrowdOdds.forGame`, R-61), never
  stored: `game_odds` holds only what a scored game was scored with. Which
  lines the list shows and what each carries is decided in the domain
  (`shownPredictions`, `predictionLinesOf`). An id typed into a URL or form
  is read only by `idFromText` / `gameIdFromText`. The pages a guest may
  return to after sign-in are `GUARDED_PAGES`
  (`apps/web/src/server/sign-in/guarded-pages.ts`), each its path and its
  matcher; a guarded page sends a guest to sign in only through
  `signInAndReturn`.
- A player's standings table is one `StandingsTable`
  (`packages/domain/src/standings/standings-table.ts`): built at a moment
  from the tournament's teams, the player's rows and the season, its rows
  mended to the stage chain (R-78); it decides a row save (`saveRow`) and a
  reorder (`reorder`), says which boxes are open, and is what the page shows
  (`view()`, rebuilt on the client by `fromView`), so the page and the save
  answer every box through one module; the page posts every row as
  `entryOf` gives it. A stored value posted back unchanged (a place, a
  tick, a final place) is never judged again. A post passes
  `standingsFormEntry` / `reorderFormEntry` first. The player's rows are
  read only by `playerRowsIn`; the page's table is built by
  `loadStandingsPage`, a save's only by `loadLockedStandingsTable`
  (`packages/db/src/standings/table-repository.ts`:
  the posted team's tournament, never the request's; the player's missing
  rows seeded and all their rows locked by team; judged at the lock) and
  written only by `saveStandingsRow` / `saveStandingsOrder` through
  `decideUnderLock` (`packages/db/src/save-transaction.ts`), so a refused
  save writes nothing (joining seeds blank rows through
  `registerForTournament`). A reorder writes only places. A save
  recalculates nothing and switches nothing back on. Saves are limited per
  player (`standingsSaveLimits`). The ladder's saving - one queue, a row
  posting its place as last saved, the rollbacks - is the plain
  `createLadderSession` (`apps/web/src/components/standings/ladder-session.ts`).
- The standings deadline (ST-2) is `Season.standingsDeadline`; the SQL that
  the catalogue reads it with is only `standingsDeadlineSql`
  (`packages/db/src/season/standings-deadline-sql.ts`), and
  `packages/db/test/standings-deadline.test.ts` proves the two agree on every
  one of the domain's `standingsDeadlineExamples` (`@sportbet/domain/testing`).
- A game result is decided by `enterResult`
  (`packages/domain/src/result/enter-result.ts`), after the posted boxes
  pass `resultFormEntry` in UpdateResultRequest's order (-1 : -1 postpones,
  R-63; one box empty refused, R-64), and written only by `saveResult`
  (`packages/db/src/result/save.ts`): one transaction that refuses a frozen
  tournament (R-22, R-67), fills in and counts the game's blank rows (FI-1,
  R-7, R-32, R-39), removes a correction's mistaken fill-ins (FI-4, R-5),
  records the change in `audit_results` (who, the game, before and after,
  when; no IP; kept with the player forgotten when an account is deleted,
  R-69) and recalculates. Results saves and "Perskaičiuoti taškus" are
  limited per account (`resultSaveLimits`, `recalculateAllLimits`); a post
  the form refuses does not count. Fill-ins are written only by
  `saveResult` and `registerForTournament`.
- The lock order, held by every writer (`packages/db/src/recalculation/lock.ts`):
  the tournament's recalculation lock (`lockTournamentForRecalculation`,
  whose `TournamentLock` `recalculateUnderRuleSet` requires, so no
  recalculation runs without it - `recalculateLocked` for a caller that
  writes nothing else, the reader included), then the game row (a result
  `FOR NO KEY UPDATE`, a prediction `FOR SHARE`), then the game's
  `match_predictions` rows by player, then `tournament_players` through
  `lockPlayerStatuses`, by player then tournament, each player's set locked
  once. A prediction save takes no tournament lock and waits at most 5 s for
  a row lock (then 503, "Spėjimas neišsaugotas"). A standings save takes no
  tournament or game lock: it locks only the player's `standings_predictions`
  rows of the tournament, by team, waiting at most 5 s, and reads the
  season's games unlocked.
- Roles (R-26 amended) are `player`, `results-manager` and `superadmin`,
  re-read with the session on every request; sportbet's levels map through
  `roleOfSportbetLevel`. An admin page or route is gated only by
  `adminGate(permission)` (`apps/web/src/server/admin/gate.ts`) with the
  permission it needs (`isAdmin`, `mayEnterResults`, `mayRecalculate`); a
  refusal goes home. Laravel's 422 summary and the 429 body are built only
  by `server/request/laravel-answers.ts`.
- The league table, the game page (`/main`, `PLAYER_HOME`), `/leaderboard`
  and the hub's guest panels read a tournament only through
  `loadTournamentStanding` (`packages/db/src/dashboard/standing.ts`): its
  rule set's rows, totals, listed players (the tournament's until slice 12
  narrows it to a league, R-73), usernames and scored predictions' origins.
  What the pages show - table rows, history (R-17, R-72), tiles (R-71),
  feed, deck, odds (`gameOdds`, R-61), leaderboard rows (R-18, R-77) - is
  decided in the domain (`packages/domain/src/dashboard/`); the Vilnius
  day is the domain's `vilniusDay`. A fully correct game is only
  `isFullyCorrect`; the three "correct score" counts are named after their
  sportbet pages (`countsAsBingo`, `isExactScore`, `isFeedBingo`).
  `/leaderboard` and the guest "Lyderiai" offer read the board through
  Next's data cache (`server/leaderboard.ts`, at most once a minute); any
  write that changes points or who is listed calls `pointsChanged()`
  (`server/points-changed.ts`) after it.
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
