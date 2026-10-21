# CLAUDE.md

sportbet_new is the TypeScript rebuild of [sportbet](https://github.com/tomyka/sportbet)
(PHP / Laravel), which it replaced: the old app is retired and this is the live
app.

**Read `docs/decisions.md` first.** It records what was decided before any
code - stack, database, safety rules, parity bar, infrastructure - and why.
Do not reopen a decision there without the owner.

The rules this app reproduces started from the old repo's `CLAUDE.md` and
`CONTEXT.md` (`D:\Projects\sportbet`), which stay the source of the original
rules. Never invent a scoring,
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
  `/testing` entry outside tests. Lint enforces it, including relative paths.
- A ruling is code in the module that applies it, named after its
  catalogue rule, its figure a named constant when it is published on /rules
  or /help. Changing a ruling that moves stored points is a change of that
  constant, a test, an entry in `docs/owner-rulings.md` and a
  `recalculateAll` run (the R-138 precedent). There is no rule-set parameter
  and no global switch.
- Stored points rows (`game_odds`, `point_results`, `point_standings`,
  `point_survivals`) and players' totals are derived only through
  `recalculateTournament` (`packages/domain/src/recalculation/`), one call
  per tournament; the per-area scorers behind it are internal.
  The totals of the stored rows are summed only by
  `sumTournamentTotals`, which `recalculateTournament` uses too; outside
  it, the database reads them only through `loadTournamentTotals`.
  The database saves derived rows only through `recalculateAndSave`
  (`packages/db/src/recalculation/`), under a `TournamentLock`: it reads
  the tournament's inputs, calls `recalculateTournament` once and saves
  under `LIVE_SOURCE`; an inconsistent database throws.
- Domain values are fixed-point integers (`Points` in hundredths,
  `StandingsPoints` in ten-thousandths); no float is stored or compared.
  Floats appear only inside the crowd-odds formula, before `phpRound`, the
  port of PHP 8.4's `round()` proven by `packages/domain/test/php-reference/`. The
  other float is `barPercent` (the payments meter's width, slice 12c): it ports
  PHP's double arithmetic through `phpRoundScaled` so it agrees with sportbet at
  float ties.
- Invalid input to a domain factory or method is a typed refusal (a
  `Result`), never an exception; an impossible state throws. The one
  exception is a posted form checked field by field, as Laravel reports
  every field (`predictionFormEntry`): its refusal lists the fields' errors.
- Every points row (`game_odds`, `match_points`, `standings_points`,
  `survival_points`) is saved under `LIVE_SOURCE` (`ruled`, `packages/db/src/points/names.ts`,
  not exported from `@sportbet/db`) and read only through `liveRows`
  (`packages/db/src/points/live.ts`), never by a default or a bare source
  filter; web never names a source. The only queries without it are the
  deletions of a deleted game's or player's own rows and season/admin.ts's
  "does a points row name this round" read (`packages/db/test/points-scope.test.ts`
  lists them and fails on any other file that touches a points table). The `production` and `sportbet` rows in the live database are
  retired history: nothing reads or writes them, and they are not deleted
  without the owner (`packages/db/test/points.test.ts` proves every loader and
  total ignores them). Migrated rows keep sportbet's
  ids (saved with `overridingSystemValue`, then `advanceIdentitySequences`), except
  `survival_points`, whose derived rows share the table: every row there
  has its own generated id.
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
  unique index that refuses a second spelling, and registration's uniqueness check (`isEmailRegistered`, with `isUsernameHeld` and `takeRegistrationLock` in `packages/db/src/account/identity.ts`, used by `createAccount`, `updateProfileNames` and `confirmEmailChange`), never a lookup; no ILIKE,
  `unaccent` or citext touches an address (`packages/db/test/account.test.ts`).
  Sign-in state is cookies the server signs or hashes, or checks again on
  every read (`sb_signin_open`, `sb_intended`, `sb_return`), all in
  `apps/web/src/server/cookies.ts` (`__Host-sb_session`, `__Host-sb_signin`,
  `__Host-sb_signin_open`, `__Host-sb_register`, `__Host-sb_intended`, `__Host-sb_flash`, `__Host-sb_return`, `__Host-sb_confirm`, `__Host-sb_google`), each sealed value bound to its purpose (`apps/web/src/server/sealed.ts`); a session is started, read, extended and ended
  only through `apps/web/src/server/session/session.ts` (confirming an address
  change ends the account's other sessions, R-132: `endOtherSessions`). A `__Host-` cookie
  is cleared with its own flags and Max-Age 0, never `cookies().delete()`.
  A one-time message is a sealed `__Host-sb_flash` set by a route handler
  and forwarded once by `proxy.ts` (`server/flash.ts`) - only for a document load
  (`isDocumentLoad`: `Sec-Fetch-Dest` document or absent, not a prefetch), so a
  router prefetch or script fetch from the outgoing page cannot consume it - which passes on only
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
  missing, a late joiner's fill-ins (only for a game scored or locked ahead of
  its tip-off, R-128) scored through
  `recalculateAndSave`. An account is created only by `createAccount`,
  in one transaction with its settings and its tournament. An emailed code
  is minted and mailed only by `sendEmailedCode` and checked only by
  `checkEmailedCode` / `verifyEmailedCode` (`apps/web/src/server/emailed-code.ts`):
  sign-in, registration, an admin's confirmation (`admin_action`) and the
  profile's `email_change` and `account_deletion`. The mailer is asked
  (`mayDeliver`) before a code is issued, so a refusal leaves the live code.
- An account's names change through `updateProfileNames`; its address only
  through `requestEmailChange` (parked in `pending_email` once the code is
  mailed to the new address), `confirmEmailChange` (after the code check,
  purpose `email_change`; the old address then gets a notice) and
  `cancelEmailChange` (`packages/db/src/account/`, R-24). `players.pending_email`
  is written only by those three writers. The profile's deletion is
  `deleteAccount` with `by: 'self'`, followed by `expireBoard` and
  `endSession`; its code is purpose `account_deletion`, and its removal of the
  player's login codes covers `pending_email` by exact equality. A self-deletion
  records no audit row (R-130) and the last superadmin's is refused (R-131); it
  claims its `account_deletion` code inside `deleteAccount`'s transaction, so the
  code is spent only when the account is deleted (`code-spent`), and a lock
  timeout or `AccountBusyError` answers 503. Of a pending address only the
  `email_change` codes are removed, of the current address every code. A form
  refusal's typed values are cut by bytes (`cutToBytes`) to fit the flash cookie;
  the profile's flash kinds are `account-refused`, `code-refused` and the
  `profileInfoSchema` list.
- Google sign-in (slice 19) is the authorization code flow with PKCE, `state`
  and `nonce`, written by hand behind `OAuthProvider`
  (`apps/web/src/server/google/`): `liveGoogleProvider` is the only code naming
  Google's hosts, `fixtureGoogleProvider` the one tests and the CI E2E use,
  chosen by `GOOGLE_PROVIDER` (optional and `live` where `SPORTBET_ENV` is
  staging or production, where `fixture` is refused; required and explicit in
  ci and local). The browser binding is the sealed `__Host-sb_google` cookie
  (purpose `google-oauth`): the callback asks Google nothing until it, and the
  query's `state`, check out, and clears it on every outcome. What is decided
  is `googleSignInPlan` (`packages/domain/src/account/google-sign-in.ts`), in
  sportbet's order: a `sub` already linked signs in; an unverified address
  (only the JSON boolean `true` verifies) is refused; the exact-address
  account is linked and signs in; else, while registration is open, an account
  is made. `players.google_id` is written only by `createAccount` (which
  derives the username under the registration lock) and `linkGoogleId`
  (`packages/db/src/account/google.ts`, never overwriting, one row, no place in
  the lock order); Google never writes `email`, `name` or `surname` of an
  existing account, and a verified address held by an account already linked to
  another Google account signs nobody in (R-135). The redirect URI is `APP_URL` + `/auth/google/callback`,
  never from the request. `googleEnv()` is read by the Google routes alone
  (like `reminderEnv`): a missing or bad value stops no other page.
- A player's league in a tournament is `tournament_players.selected_league_id`,
  tied by a foreign key to their membership; it is moved only by
  `selectLeague` (`packages/db/src/league/select.ts`). Every tournament has
  one public league (`ensurePublicLeague`), which joining and
  `saveTournamentPlayers` put every player in. Who a table shows is
  `loadRoster`; `league_members.is_guest` is read only there, by the hub's
  two participant counts (`packages/db/src/hub/repository.ts`, which mirror
  sportbet's: guests out, listed status ignored, R-87) and by the player's
  own league list (`league/list.ts`).
- A league is created by `foundLeague`, edited by `editLeague`, entered by
  `sendLeagueInvite` + `joinFromInvite`, left by `exitLeague`, ended by
  `removeLeague` and handed over by `handOverLeague`
  (`packages/db/src/league/`), each deciding through the domain function of
  its name (`packages/domain/src/league/decide.ts`) under the lock order; a
  leave or delete moves the selection to the public league first. A posted
  form is checked field by field by `leagueFormEntry`, and a posted league
  id is read only by `readIdField`. Update and invite answer in
  sportbet's order (an admin of that league first: 404, then the form); search
  validates `leagueID` and `query` first (422), then checks the admin (404). R-20
  reads `tournament_players`; `is_admin` is set only by `foundLeague` and
  `handOverLeague` (R-105). Players are found only by `searchPlayers`
  (`name_fold`, only players of the league's tournament, R-88, `leagueSearchLimits`).
- What members paid is recorded only by `savePayments`, where to send the
  fee only by `saveDetails` (`packages/db/src/league/payments.ts`), each
  through `recordPayments` / `paymentDetailsFormEntry` and
  `mayManagePayments` (a private league's admins; the public league is the
  superadmin's, slice 14) under the lock order; the posted `paid[memberId]` is
  checked field by field as Laravel reports it. Money is `Cents`; every
  number format of the fee panel and the payments page is in
  `packages/domain/src/league/money.ts` (one amount format, R-123), pots only
  by `pots` (a guest's amount is left out, R-88). The fee panel is
  only `feePanel` (R-104, R-124: a guest sees no
  money at all), the IBAN only `packages/domain/src/league/iban.ts`. The dashboard's panel and the league's
  active messages (R-122) come from `loadDashboardLeague`.
- A tournament's hub data (status, start date, sport, description, public
  switch) is its `TournamentProfile`, beside `Tournament`, never in it. A
  tournament, its profile and its registration window are read together
  only through the catalogue (`packages/db/src/tournament/catalogue.ts`).
  The hub's and the tournament pages' data come from `packages/db/src/hub/`
  (`loadHub`, `loadTournamentPage`, `loadRegistrationForm`,
  `findVisibleTournament`), which apply R-50 and R-55;
  what a guest's panels list is decided in the domain (`guestPanels`), and
  the next games through `Game.isOpenAt`. Sign-up joins only public tournaments
  (R-50), for both its tournament and whether it is open at all. Actions that
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
  (`packages/domain/src/standings/standings-table.ts`): built
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
  rows seeded and all their rows locked by team; the season read after
  those locks, its games unlocked) and
  written only by `saveStandingsRow` / `saveStandingsOrder` through
  `decideUnderLock` (`packages/db/src/save-transaction.ts`), so a refused
  save writes nothing (joining seeds blank rows through
  `registerForTournament`). A reorder writes only places. A save
  recalculates nothing and switches nothing back on. Saves are limited per
  player (`standingsSaveLimits`). The ladder's saving - one queue, a row
  posting its place as last saved, the rollbacks - is the plain
  `createLadderSession` (`apps/web/src/components/standings/ladder-session.ts`).
  A save judged against the closing result committing at the same moment can
  land on either side of it, as in production (no cross-lock).
- The standings deadline (ST-2) is an event, not an instant: standings close
  once every game of their round (the first at or after the deadline round
  with any game) has a result (sportbet a4618c6). It is
  `Season.standingsCloses` (never, open or closed; `isStandingsOpen`), a
  function of the season's games and no moment, so the page names no date
  (R-80, R-128); its SQL rendering is only `standingsClosesSql`
  (`packages/db/src/season/standings-closes-sql.ts`), and
  `packages/db/test/standings-closes.test.ts` proves the two agree on every
  one of the domain's `standingsDeadlineExamples`
  (`@sportbet/domain/testing`); no production query reads that SQL today.
  Registration does not follow it: it closes at the first game's start
  (R-128, `isRegistrationOpenWindowAt`);
  `recalculateTournament` never reads the deadline.
- A survival pick is decided by `SurvivalRun.withPick`
  (`packages/domain/src/survival/survival-run.ts`), after the post passes
  `survivalPickFormEntry`, in sportbet's order (`SurvivalPick::decide`; R-81),
  and written only by `saveSurvivalPick` (`packages/db/src/survival/save.ts`):
  one transaction on the posted team's tournament, the round's game rows
  locked FOR SHARE, then the player's statuses (`lockPlayerStatuses`) as
  the mutex of their picks, judged under the lock. A save recalculates
  nothing and switches nothing back on; saves are limited per player
  (`survivalSaveLimits`). What the survival page and summary show comes
  from the picks folded against the games (`foldSurvival`, the one derivation
  recalculation stores its rows from too); a card
  is offered only when `withPick` accepts it, and another player's pending
  pick shows "Pasirinkta" until its game starts (R-82, R-101).
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
- A tournament, round, game or team is changed by an admin only through the
  writers of `packages/db/src/{tournament,season,team}/admin*.ts`
  (`createTournament`, `updateTournament`, `insertRound`, `updateRound`,
  `deleteRound`, `insertGame`, `updateGame`, `deleteGame`,
  `insertPlaceholderTeams`, `renameTeam`, `saveStandingsFacts`), each deciding
  through the domain function of its name (`packages/domain/src/admin/`) in one
  transaction under the lock order and re-reading what it judges under the
  lock. Only a round update that moves a number, stage, rate or flag, a scored
  game's update, `saveStandingsFacts` and, in a tournament that plays
  survival, every game insert, update (scored or not) and delete recalculate
  (R-139: which game decides a survival pick can change, so stored survival
  points are never stale; `recalculateWhenSurvival`); a tournament edit, a
  round insert or delete, and in a tournament without survival an unscored
  game's insert, update or delete cannot move a stored point
  (`recalculateTournament` reads no end date or deadline round) and R-22,
  R-67 and R-110 refuse a frozen or finished tournament. Blank prediction rows are seeded only by
  `seedBlankRows` (`packages/db/src/joining/`) and `saveResult`'s fill-ins.
  A destructive admin action (`ConfirmableAction`: `delete-game`, `delete-user`,
  `change-role`, `delete-league`, `delete-league-message`) waits
  for a fresh emailed code (`admin_action`, sent only to the admin's own
  address; the action is sealed in `__Host-sb_confirm`, one per browser, and
  the code is bound to it - hashed with `actionBinding(action)`, a digest of
  the action's fields, so a code mailed for one action never confirms another,
  and a new request voids the admin's earlier code) through
  `apps/web/src/server/admin/confirm/`. Deleting a game (`deleteGame`)
  removes that game's own `game_odds` and `match_points` rows, under every
  `points_source`: one of two removals of points rows outside
  `recalculateTournament`, because the game ceases to exist (their foreign
  keys restrict, so nothing else can drop them); the other is `deleteAccount`'s
  (below). `deleteGame` re-reads its actor (a superadmin, under a shared role
  lock) and its tournament (the admin's working one) under its own locks. It is refused while a
  survival pick names one of the game's teams in its round (R-125,
  `survivalPickCounts`), as `deleteRound` refuses `has-picks`.
- A player is removed only by `deleteAccount`
  (`packages/db/src/account/deletion.ts`), which removes the deleted player's
  own derived rows (their `match_points`, `standings_points`, `survival_points`
  and predictions) outside `recalculateTournament`, because the player ceases
  to exist - the second exception beside `deleteGame` - and runs no
  recalculation: with R-99 no other player's stored point or `game_odds` row
  moves. A scored game keeps the `game_odds` row it was
  scored with (read from the live rows); odds are computed from the votes only for a game without a row,
  and `saveResult` forgets its game's row first so a result entry still scores
  from the votes as they stand. A join or a league founded while the
  deletion takes its locks starts the attempt again (`raced`), never a lock
  out of turn. A role is changed only by
  `changeRole`; the last-superadmin guard locks every superadmin row first
  (`lockSuperadmins`), not a count; every foreign key to `players` is cascade,
  set null or in `PLAYER_ROWS_DELETED` (`player-fk-coverage.test.ts` reads
  `information_schema`, so a new `restrict` key not handled there fails CI). A
  league whose owner is deleted goes to its longest-standing full member
  (earliest membership, ties by the membership row id), a guest only when no
  full member is left (R-113). The audit trail (`audit_admin_actions`) keeps role
  changes and admin deletions (R-117). The admin's hide of a player
  (`setAdminHidden`) is per tournament (R-115). The league messages are written
  only by `insertMessage`, `updateMessage`, `deleteMessage` (a results manager
  may list, insert and edit; only a superadmin deletes, R-116).
- The Euroleague schedule is read only through `EuroleagueFeed`
  (`packages/db/src/import/feed.ts`: `liveEuroleagueFeed` is the only code
  naming the host, `fixtureEuroleagueFeed` the one tests use), chosen by
  `EUROLEAGUE_FEED`: optional and `live` when `SPORTBET_ENV` is staging or
  production, required and explicit in ci and local, so a forgotten setting
  fails closed. The live fetch follows no redirect, reads at most 5 MB, gives
  each attempt 15 s (three attempts fit the routes' `maxDuration = 60`), and
  the parser takes at most 2000 games and club names of at most 100
  characters without a control character. The network guard
  (`installNetworkGuard`, `packages/domain/src/network-guard.ts`, in every
  Vitest project's `setupFiles`) and the lint ban on the `fetch` global in
  domain and db outside the feed adapter are wired by the owner's gate-config
  edits (`docs/superpowers/plans/slice-15-gate-config-edits.md`); until they
  are applied they are not in force. The guard wraps only `globalThis.fetch`
  (`node:http` and undici bypass it): the real sandbox is
  `EUROLEAGUE_FEED=fixture` in ci and local plus the lint ban once wired. The
  host is named only in `feed.ts`, tests included (`seasonUrl`). An import is
  decided only by `planEuroleagueImport` and written only by
  `applyEuroleagueImport`: under the tournament lock, waiting at most 5 s for
  any lock (then 503), it plans again, locks only the rows of the games the plan
  moves `FOR UPDATE` in id order, judges the plan once more under them and
  writes (R-13, R-93, R-94, R-96, R-110); a game it leaves where it is is not
  locked. It is refused with `plan-changed` when the plan's fingerprint changed
  since the preview; imported rounds follow the tournament's survival switch
  (R-129). `DetailedResult` (`packages/domain/src/shared/result.ts`) is the
  `Result` variant whose refusal is an object: use it when a refusal carries
  details; a plain string refusal stays `Result`. The `euroleague-import`
  command prints Lithuanian refusal text, as sportbet's CLI does: the one
  db-layer exception to "text lives in components"; it strips control
  characters from every line it prints.
- A prediction reminder (R-97, R-98) is decided only by `dueReminders`
  (`packages/domain/src/reminder/`, with `reminderTimeOf`), read and marked
  only through `packages/db/src/reminder/` (`loadReminderCandidates`,
  `loadReminderRecipients`, `stillDueGames`, `markReminded`; `reminded_at` is
  written only by `markReminded`, and `clearReminded`), and its setting written only by
  `setReceiveReminders`. The only sender is `POST /api/cron/reminders`
  (`apps/web/src/app/api/cron/reminders/route.ts`): protected by a bearer
  `CRON_SECRET` compared as SHA-256 digests in constant time, skipped by the
  proxy's matcher, holding a `job_leases` row (`takeJobLease`) against
  overlapping runs, marking a reminder only after it was sent (a failed mark is `unmarked`, logged
  by kind, and never stops the run), bounding each send by a timeout, logging counts
  through `logInfo` and nothing personal. A reminder's one-click unsubscribe
  link carries a signature bound to the player and the purpose
  `reminders-unsubscribe` (`server/reminders/unsubscribe-link.ts`). The mail's
  text is written in `apps/web/src/server/mail/reminder-mail.ts`, its inline
  colours the one other exception to the token rule (`mail-frame.ts` and
  `reminder-mail.ts`, the mail files named in `token-guard.test.ts`). Staging calls the route every 15 minutes from the
  `reminders` GitHub Actions workflow with `STAGING_CRON_SECRET`; production
  uses a systemd timer installed at switch-over. Anything the middleware
  imports reads `process.env` key by key: Vercel's edge runtime passes an env
  object that is not a plain object (`z.record` refuses it; `reminderEnvSchema`
  and `feedEnvSchema` read each key), and a bad value must never stop the
  whole site. `CRON_SECRET` and `APP_URL` are therefore not in `env()`: the
  cron route alone reads them, lazily (`reminderEnv`), and answers 503 when
  they are missing or bad.
- The lock order, held by every writer (`packages/db/src/recalculation/lock.ts`):
  the tournament's recalculation lock (`lockTournamentForRecalculation`,
  whose `TournamentLock` `recalculateAndSave` requires, so no
  recalculation runs without it - `recalculateInOwnTransaction` for a caller that
  writes nothing else, the tests included), then the game row (a result
  `FOR NO KEY UPDATE`, a prediction `FOR SHARE`), then the game's
  `match_predictions` rows by player, then `tournament_players` through
  `lockPlayerStatuses`, by player then tournament, each player's set locked
  once. A prediction save takes no tournament lock and waits at most 5 s for
  a row lock (then 503, "Spėjimas neišsaugotas"). A standings save takes no
  tournament or game lock: it locks only the player's `standings_predictions`
  rows of the tournament, by team, waiting at most 5 s, and reads the
  season's games unlocked. A survival pick takes no tournament lock: the
  round's game rows FOR SHARE in id order, then `lockPlayerStatuses`,
  waiting at most 5 s. An admin change or delete of a game takes the game row `FOR UPDATE` after the
  tournament lock; so does the Euroleague import, for the moved games' rows
  only, in id order (a result save takes the tournament lock before its game
  row, so the import's tournament lock already serializes it). A league writer takes the league row `FOR UPDATE`,
  then the league's invite rows, then its members by player, then
  `lockPlayerStatuses` by player; it holds no tournament, game or
  prediction lock. The account writers (`deleteAccount`, `changeRole`) take every superadmin's
  `player_settings` row `FOR UPDATE` by player id before anything else;
  `deleteAccount` then takes the recalculation lock of every tournament, in
  tournament id order (the one writer that holds several),
  the player's `match_predictions` by game, the leagues they own, belong to or
  are invited to by league id, and last their `tournament_players` rows. A
  league selection (`selectLeague`) takes the league row
  `FOR SHARE` first (so it cannot deadlock a delete), then the membership
  row `FOR SHARE`, then `lockPlayerStatuses`.
- Roles (R-26 amended) are `player`, `results-manager` and `superadmin`,
  re-read with the session on every request; sportbet's levels map through
  `roleOfSportbetLevel`. An admin page or route is gated only by
  `adminGate(permission)` (`apps/web/src/server/admin/gate.ts`) with the
  permission it needs (`isAdmin`, `mayEnterResults`, `mayRecalculate`); a
  refusal goes home. Laravel's 422 summary and the 429 body are built only
  by `server/request/laravel-answers.ts`.
- The league table, the game page (`/main`, `PLAYER_HOME`), `/leaderboard`,
  the hub's guest panels, the summaries (`/summary/prediction/results`,
  `/summary/prediction/standings`), the chart (`/summary/chart`) and compare
  (`/compare/{userID}`) read a tournament only through
  `loadTournamentStanding` (`packages/db/src/dashboard/standing.ts`): its
  live rows, totals, the players of its `RosterScope` (`loadRoster`,
  `packages/db/src/league/roster.ts`: the whole tournament for `/leaderboard`
  and the hub's panels, the public league at full-member level for the
  tournament page, the viewer's selected league for everything else;
  `leagueRoster` decides, R-73), usernames and scored predictions' origins.
  What the pages show - table rows, history (R-17, R-72), tiles (R-71),
  feed, deck, odds (`gameOdds`, R-61), leaderboard rows (R-18, R-77) - is
  decided in the domain (`packages/domain/src/dashboard/`); the Vilnius
  day is the domain's `vilniusDay`. A fully correct game is only
  `isFullyCorrect`; the three "correct score" counts are named after their
  sportbet pages (`countsAsBingo`, `isExactScore`, `isFeedBingo`).
  `/leaderboard` and the guest "Lyderiai" offer read the board through
  Next's data cache (`server/leaderboard.ts`, at most once a minute); a
  write that can move a stored point or change who is listed says so in its
  result (`BoardEffect.boardChanged`, `packages/db/src/board-effect.ts`: true
  when it recalculated, changed a listing or changed the season, decided in the writer), and web
  passes that result to `expireBoard` (`server/points-changed.ts`), the one
  place that expires the cache, only when it is true. Every game and round writer
  (`insertGame`, `updateGame`, `deleteGame`, `insertRound`, `updateRound`,
  `deleteRound`) says true, though some move no point: the cached public
  league reads the season (`earnedPointsOf`, `placedAtScoredGames`). Only
  `createTournament` (a new tournament has no player, row or cached read) and
  `insertPlaceholderTeams` (a blank team has no final place, so no medal) say
  nothing, and web expires nothing after them. What the summaries, chart and
  compare show is decided in the domain (`packages/domain/src/summary/`);
  points counted at an unscored game count at the latest scored one only
  through `placedAtScoredGames`; no summary queries `tournament_players`.
A chart line is drawn in the player's own colour (`ChartLine.colour`, sportbet's
`colors.color_code`, R-136: migrated from sportbet, written by no code since,
read by `loadChartColours`, validated by `chartColourInvariant`,
`packages/domain/src/summary/chart-colour.ts`, CHECK `players_chart_colour_format`)
or else in its position's `--color-series-n`, decided only by `lineColour`
(`apps/web/src/components/summary/chart-svg.tsx`); a colour is validated data,
never a token, and no component writes a literal. The ten series tokens are an
`@theme static` block so the build keeps all of them.
- `/rules` and `/help` show only what `rulesPage` and `helpPage` return (R-100); their figures come from the areas' published figures
  (`publishedMatchFigures`, `publishedSerijaExamples`,
  `publishedStandingsFigures`, `gameOddsHundredths`), never a typed number. What
  they say of the standings deadline, the serija order and a short standings
  table is what the code does (R-106, R-133; the partial-table sentence is
  R-133 Q5's wording). The facts of the tournament they describe are the
  domain's `TournamentFacts` (`tournamentFactsSchema`, absent value
  `NO_TOURNAMENT_FACTS`), read only by `loadTournamentFacts` and chosen only by
  `findDescribedTournament` (the player's own tournament, else the first
  unfinished visible hub card); the pages call only `loadRulesPageData` and
  `loadHelpPageData` (`server/described-tournament.ts`). Sentences shared by
  /rules, /help and the survival page live only in
  `components/static/shared-texts.ts`. Every navigation path is a
  `shell-paths.ts` constant, each static page one `PageEntry` in
  `nav-entries.ts` with its audiences as data. `/privacy` is sportbet's text with
  R-108's three fixes (R-134); a change to it goes to the owner as a word diff.
- Web imports `@sportbet/db/<area>` (`packages/db/src/entries/`, one
  entry per area, listed in `packages/db/package.json` `exports`) for code that
  never touches the points tables, so a mutant in a db schema file re-runs few
  tests (#36); the barrel `@sportbet/db` still exports everything. A new entry
  goes in `src/entries/` and `exports`; `packages/db/test/entry-points.test.ts`
  guards that no entry reaches `points/schema.ts` and that each exports only the
  barrel's bindings.
- Database and feature tests get their database from `@sportbet/db/testing`:
  `startTestDatabase` in a global setup, `useTestDatabase` at the top of each
  test file (connects, empties every table before each test, closes). No test
  starts a container, migrates or builds a pool by hand.
- Parity with sportbet beats a nicer rule: a constraint must accept every row
  the live database holds (e.g. slugs are `[a-z0-9-]`, up to 100, as sportbet
  validates them). Check the old code before tightening anything.
- A skipped or focused test is a lint error. Database and feature tests run in
  CI on real Postgres 18, before the deploy; E2E and smoke run again against
  staging after it. Write invisible characters in tests as escapes.
- The production-copy reader and parity checker (`tools/migrate`) were removed
  (#45): the old app is retired and the live database has moved on. Nothing of
  production goes to Vercel, Neon, GitHub, commits or logs.
- Migrations: change `packages/db/src/**/schema.ts`, then
  `pnpm --filter @sportbet/db db:generate --name <what>`; review and commit the
  SQL. Never edit a migration that has reached staging.

## Oracle account

The tenancy is Pay As You Go. Quota policy `always-free-caps` holds it at the
Always Free allowance (A1 only, 4 OCPU / 24 GB, 200 GB block storage) and
budget `always-free-watch` emails the owner on any real spend. With
sportbet-web, sportbet-ci and sportbet-new the account is exactly at the cap:
anything more is the owner's decision, made by changing the quota on purpose.


## Quality gates (enforced automatically)

This project has deterministic quality gates. They run automatically through Claude Code hooks:

- After every file edit: the file is formatted and lint-fixed; remaining lint problems are reported back to you.
- When you finish: `node quality/gate.mjs all` runs (format, lint, strict typecheck, suppression markers,
  tests with coverage thresholds, CRAP score, dead code, architecture rules, mutation testing of changed files).
  If anything fails you will be sent back to fix it.

Rules:

- Write tests together with the code. Every test must assert observable behaviour, not just execute code.
- When mutation testing reports surviving mutants, add or strengthen assertions so each mutant would fail a test.
- Keep functions small and simple (cyclomatic complexity <= 10, CRAP <= 30). Split rather than suppress.
- Never edit gate configuration (eslint.config.mjs, tsconfig.strict.json, tsconfig.base.json, vitest.config.ts,
  stryker.config.mjs, knip.json, .dependency-cruiser.cjs, quality/**, .claude/settings.json, and each package's
  tsconfig.json, tsconfig.strict.json and vitest*.config.ts). These edits are blocked. The owner adapts the kit
  to the workspace only without weakening it (#25).
- The gate covers the three packages as vitest projects (vitest 4.1.11, the version Stryker's runner works
  with), one strict typecheck per package, knip workspaces and the repo's layering in dependency-cruiser.
  A new test file must be run by a project or be named, with its reason, in `quality/quality.config.json`
  `testsOutsideGate` (today web's feature, smoke and E2E suites suites);
  otherwise the test gate fails.
- The gate needs Docker (the db project starts its Postgres with Testcontainers) and runs
  once per working tree at a time (`quality/lock.mjs`: a second run waits up to `QUALITY_GATE_LOCK_WAIT_MIN`
  minutes, default 30).
- CI: `ci.yml`'s `check` job runs the kit's tests and `check` once per push (#57), with the black-box
  `feature` job beside it; `.github/workflows/quality.yml`'s `gate` job runs `check` and mutation of the changed files on
  pull requests, not again on a push. The full mutation
  run is split into `mutation.fullShards` shards (`quality/quality.config.json`; `mutation --full --shard i/N`,
  each caching its incremental file, then `mutation --merge` scores the whole against `breakFull`); it runs
  every Sunday at 02:17 UTC (skipped when main has not moved since the last full run) and by hand (dispatch with `mutation_full`); shards are split by each file's
  measured cost from the previous run (the profile the merge saves).
- Operational information is logged only through `logInfo` (`apps/web/src/server/log.ts`), one JSON line,
  never anything personal; failures stay `console.error` by error kind.
- Never add suppression comments (eslint-disable, @ts-ignore, @ts-expect-error, istanbul/v8/c8 ignore, Stryker disable),
  `any`, or non-null assertions `!`. They are rejected.
- If you believe a gate is wrong for a specific case, stop and explain it to the user instead of working around it.
- Useful commands: `node quality/gate.mjs check`, `node quality/gate.mjs mutation`, `node quality/fix.mjs`,
  `node quality/crap.mjs --top 20`.
