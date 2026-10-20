# Collapse RuleSet to one rule set (issue #46): spec and plan

Status: PLAN ONLY. No code, no gate config and no decisions text is changed by
this document. Written 2026-10-20 after #45 (the production-copy reader and
parity checker are gone).

## 1. Why, and what "collapse" means

`RuleSet` (`packages/domain/src/rules/rule-set.ts`) has two instances.
`sportbetRules` reproduced the retired PHP app so the parity checker could prove
every stored row; `ruledRules` is what the app runs (all 60 or so call sites in
`apps/web` pass `ruledRules`; `sportbetRules` is read by no runtime code, only
by `packages/domain/src/testing.ts` as the builders' default and by about 75 test
files). With the old app retired and `tools/migrate` removed, `sportbetRules` has
no oracle left to serve, and every rule-set branch costs a parameter, a second
test and a field that can drift.

Target state:

- No `RuleSet` type, no `sportbetRules`, no `ruledRules`, no `RULE_SET_NAMES`,
  no `rules` parameter anywhere.
- A rule is code in the module that applies it, named after its catalogue rule
  (R-number), with its number as a named constant when it is a figure.
- One points source for live rows: `LIVE_SOURCE = 'ruled'`.
- No migration and no stored row changes. Stored points must be identical before
  and after every slice (section 8, the no-change proof).

## 2. Every RuleSet field

Legend: S = sportbetRules value, R = ruledRules value. "Reads" lists the
non-test files that read the field. Collapse means the R behaviour stays and the
S branch is deleted. "Constant" means the figure stays as a named constant in the
module that applies it (the figure is a business ruling meaningful on its own).

| Field | S / R | Reads | Collapse |
|---|---|---|---|
| `movedGameReopens` (LR-2, R-13) | always / only-before-tip-off | `round/game.ts` (`locksWhenMovedAt`) | Delete field and the `always` branch. `postpone(now)` and `reschedule(tipOff, now)` lose `rules`. |
| `currentRound` (LR-3, R-6, R-40) | earliest-unplayed-game / soonest-next-game | `round/season.ts` `currentRound(now, rules)`; callers in `survival-run`, `survival-page`, `survival-summary`, `tournament-context`, db `dashboard`, `prediction/page`, `prediction/repository`, `summary/results`, `survival/save`, web `admin/results/page.tsx` | Delete the field and the earliest-unplayed branch (and any helper only it used). `Season.currentRound(now)` stays: it is the real rule. |
| `stageRates` (LR-4, R-10) | null / `STAGE_RATES` | `round/round.ts`, `rules/rules-page.ts` | Delete field. `STAGE_RATES` (`round/stage.ts`) is already the constant; `Round.create` always checks it; the `null` (admin may set any rate) branch goes. |
| `finishedTournamentsFrozen` (LR-6, R-21, R-22) | false / true | `round/season.ts` `mayRecalculateAt` | Delete field; `mayRecalculateAt(now)` is `!isFinishedAt(now)`. |
| `differenceSlope` (MS-6, R-138) | 1 / 2 | `prediction/match-scoring.ts`, `rules/rules-page.ts`, web `rules-margin-card.tsx`, `rules-match-card.tsx` (via page data) | Constant `SCORING_BALANCE.differenceSlope = 2` beside `EUROLEAGUE_POINTS` in `match-scoring.ts`. |
| `exactDifferenceBonus` (R-42, R-138) | 20 / 30 | `match-scoring.ts`, `rules-page.ts` | Constant (30), same object. |
| `exactScoreBonus` (R-42, R-138) | 50 / 100 | `match-scoring.ts` (`marginParts`, `isExactScore`), `rules-page.ts` | Constant (100). `isExactScore(points)` loses `rules`. |
| `survivalMultiplier` (SU-1, R-138) | 1 / 2 | `survival/survival-fold.ts` | Constant `SURVIVAL_MULTIPLIER = 2` in `survival-fold.ts`. `survivalPays`, `survivalGroundPays` lose `rules`. |
| `missingOddsScoreAtOne` (CO-5) | true / false | `odds/crowd-odds.ts`, `recalculation/recalculation.ts`, `rules/input-reads.ts` | Delete. `CrowdOdds.missing()` is deleted outright (R makes it a programmer error to ask). `crowdFor` loses the `'stored'` branch. |
| `crowdOddsCountFilledIn` (CO-6, R-2, R-9) | true / false | `crowd-odds.ts`, `rules-page.ts` | Delete. `CrowdOdds.forGame(votes)` counts real votes only. `oddsCountRealOnly` in `rulesPage` becomes a literal true or is removed with the sentence that depended on it (check `rules-texts.ts`: the "shown under ruledRules only" note). |
| `fillInsOfMistakenResultRemoved` (FI-4, R-5) | false / true | `fill-in/fill-in.ts` | Delete the field; the removal is unconditional. |
| `survivalRegularSeasonOnly` (SU-7, R-10) | false / true | `round/round.ts`, `survival/survival-run.ts` (`playsSurvival`) | Delete; the regular-season test is unconditional. |
| `survivalScoredFromStoredRows` (SU-10, R-5) | true / false | `recalculation/survival-points.ts`, `survival/stored-survival.ts`, `rules/input-reads.ts` | Delete with all sportbet-only survival code (section 3, slice 1). |
| `positionsGetCrowdBonus` (ST-4, R-35) | true / false | `standings/standings-scoring.ts` | Delete; an exact position never gets the crowd bonus. |
| `standingsBonusPopulation` (ST-5, ST-7, R-3, R-36) | saved-that-column / saved-anything | `standings-scoring.ts` | Delete; keep the saved-anything population. |
| `placesScoredOnlyFromFinalTable` (ST-8, R-14) | false / true | `standings-scoring.ts` | Delete; unconditional. |
| `unscoredPlaceStoresNull` (ST-6, ST-8, R-14) | false / true | `standings-scoring.ts` | Delete; null (UNDECIDED) always. |
| `everyPageRanksByFullTotal` (RA-1, R-18) | false / true | `ranking/league-table.ts` (`rankPlayers`, `totalCents`) | Delete; every page ranks by the full total. The `page` argument may remain only if another thing still varies by page (tie order, section below); otherwise drop it. |
| `tieOrder` (RA-3, R-30) | per-page / lithuanian | `league-table.ts`, `survival/survival-summary.ts` | Delete; `lithuanianOrder` always. `phpSpaceship` (the numeric-username float compare) is then dead: delete it, and the second float exception in CLAUDE.md. `unicodeCiCompare` stays (used by `hub/medal-tally.ts`). |
| `adminHideSeparate` (RA-4, R-19) | false / true | `player/player-status.ts`, `account/account-deletion.ts` | Delete; `hiddenByAdmin()` is unconditional; the `stored.adminHidden && !adminHideSeparate` fold-in branch in `PlayerStatus.fromStored` goes. |
| `rankHistoryFromWhenEarned` (RA-5, R-17) | false / true | `ranking/rank-history.ts`; doc mentions in `dashboard/earned-points.ts`, `league-history.ts` | Delete; unconditional. Reword the doc comments that say "under sportbetRules". |
| `leaderboardCountsEachListedTournament` (RA-4, R-77) | false / true | `dashboard/leaderboard.ts` | Delete; unconditional. |
| `leaderboardPublicTournamentsOnly` (R-50, R-77) | false / true | `dashboard/leaderboard.ts` | Delete; unconditional. |
| `switchOff.afterFillIns` (PL-1, R-7) | 5 / 20 | `player-status.ts`, `rules-page.ts`, web `rules-overview-card.tsx`, `rules-texts.ts` (via page data) | Constant `SWITCH_OFF_AFTER_FILL_INS = 20` in `player-status.ts` (a business figure, shown on /rules). |
| `switchOff.countedPer` | lifetime / tournament | `player-status.ts` (`keyFor`) | Delete; the key is the tournament. The `LIFETIME` key, `keyFor` and the `rules` argument of `fillInCount`, `isSwitchedOffIn`, `afterFillInWithdrawn`, `isListedIn`, `getsFillInsIn` and the `listedPlayers`-style helper at the file's end go. This is the widest signature change in the domain (47 references in `player-status.ts`, 124 test cases in its test). |
| `switchOff.realPredictionResetsCount` | false / true | `player-status.ts` | Delete; unconditional. |
| `onlyAScoreSwitchesBackOn` (PL-1, R-57) | false / true | `prediction/predict-match.ts` | Delete; unconditional. |
| `lateJoinersFilledIn` (PL-2, R-9) | false / true | `fill-in/fill-in.ts` | Delete; unconditional. |
| `hubFinishedFollowsR21` (LR-6, R-55) | false / true | `hub/hub.ts` `hubGroup` | Delete; keep `isFinishedWindowAt`. The `profile.status === 'finished'` and `allScored` branches die; then check whether `window.games`, `window.allScored`, `window.endsAt` and `status` have another reader (knip and `tsc` find leftovers). |
| `nonPublicTournamentsHidden` (R-50) | false / true | `hub/hub.ts`, `joining/joining.ts` (`joinableOnSignUp` and two more) | Delete; `joinableOnSignUp(isPublic)` is `isPublic`. |
| `lastLeagueCountedPer` (R-29) | account / tournament | `league/decide.ts` (`decideLeave`) | Delete; count this tournament only. Then `otherLeaguesAnywhere` is unread: drop it from the input and from `packages/db/src/league/exit.ts` and its SQL. |
| `memberSearch` (R-88) | every-account / tournament-players | `packages/db/src/league/search.ts` | Delete; keep the tournament-players query, drop the every-account query. |
| `collectedPotLeavesGuestsOut` (R-88) | false / true | `league/money.ts` (`pots`) | Delete; unconditional. `pots` loses `rules`, so do `feePanel` and the payments functions in `league/payments.ts` and `league/fee-panel.ts` (they only passed it through). |
| `feeDueHiddenFromGuests` (R-104, R-124) | false / true | `league/fee-panel.ts` | Delete; unconditional. |
| `name` | 'sportbet' / 'ruled' | db: `dashboard/standing.ts`, `hub/repository.ts`, `points/totals.ts`, `prediction/page.ts`, `recalculation/repository.ts`, `result/save.ts`, `survival/page.ts` | Replaced by `LIVE_SOURCE` (section 4). |

R-138 and R-100: the four R-138 numbers, the switch-off count and the stage rates
are the figures `/rules` and `/help` publish. They stay named constants (the
"published figures" modules already take them from `rules`; they will read the
constants instead), so "a typed number never appears on a page" still holds.

Note on the unconditional fields: the catalogue and `docs/owner-rulings.md` keep
saying why each is the rule; only the claim "and sportbet differs" goes.

## 3. Functions that take `rules` (domain, db, web)

The count is 275 `RuleSet` mentions in 233 files incl. tests. By layer.

### Domain (drop the parameter)

- `round/game.ts`: `postpone`, `reschedule`, private `locksWhenMovedAt`.
- `round/season.ts`: `currentRound`, `mayRecalculateAt`.
- `round/round.ts`: `Round.create`/validation takes `rules` for stage rates and survival flag.
- `round/game-admin.ts`, `context/tournament-context.ts`: pass-through only.
- `prediction/match-scoring.ts`: `marginParts`, `marginAndBingo`, `scoreMatch` (the `{crowd, rules}` basis becomes `{crowd}`), `isExactScore`.
- `prediction/published-figures.ts`, `rules/rules-page.ts`, `rules/help-page.ts`, `rules/pages.ts`: `rulesPage(facts)`, `publishedMatchFigures()`.
- `prediction/predict-match.ts`, `prediction/predictions-list.ts`: pass-through.
- `odds/crowd-odds.ts`: `forGame(votes)`; `missing` deleted.
- `recalculation/recalculation.ts`: `recalculateTournament(inputs)`; `scoreGames`, `crowdFor` lose `rules` and the `'stored'` branch.
- `recalculation/survival-points.ts`: `survivalPoints(source, season)`; delete `storedSurvival`, `refoldAtEntry`, `refold`, `byPlayerThenRound`, the `'survival-scored-from-picks'` refusal and the `rows` variant of `SurvivalSource` (and `StoredSurvivalRow`).
- `survival/stored-survival.ts` (109 lines) and its test (254): delete the file. `survival/survival-fold.ts`: delete `survivalAtResultEntry`; `survivalPays`, `survivalGroundPays`, `foldSurvival` lose `rules`. `survival/survival-run.ts`, `survival-page.ts`, `survival-summary.ts`: drop `rules`.
- `rules/input-reads.ts` (+ test): delete; `InputReads` and `inputReadsOf` have no remaining question to answer (odds are always "stored else votes", survival always "picks").
- `standings/standings-scoring.ts`: `scoreStandings(inputs, outcomes)`; the run carries no rules.
- `fill-in/fill-in.ts`, `joining/joining.ts`, `player/player-status.ts`, `account/account-deletion.ts`: as in the table.
- `ranking/league-table.ts`, `ranking/rank-history.ts`, `dashboard/leaderboard.ts`, `dashboard/league-table-rows.ts`, `dashboard/league-history.ts`, `dashboard/dashboard.ts`, `league/roster.ts`: drop `rules`.
- `hub/hub.ts`, `hub/guest-panels.ts`, `league/{decide,money,fee-panel,payments}.ts`, `import/import-plan.ts` (check what it reads), `golden/golden-snapshot.ts`.
- `testing.ts` line 93: the builder default `rules: RuleSet = sportbetRules` goes; the builders produce ruled-world fixtures. This default is the single biggest source of silent test churn (section 6, risk 2).
- `index.ts`: stop exporting `RuleSet`, `RuleSetName`, `RULE_SET_NAMES`, `sportbetRules`, `ruledRules`, `inputReadsOf`, `InputReads`, `phpSpaceship` (not exported today), `refoldStoredSurvival`, the stored-survival types.

### Database

- Signatures that take `rules: RuleSet`: `recalculation/{repository,all,lock}.ts` (`recalculateUnderRuleSet`, `recalculateAll`), `hub/repository.ts` (10 mentions), `result/{save,page}.ts`, `joining/repository.ts`, `season/{admin,admin-games}.ts`, `team/admin.ts`, `tournament/admin.ts`, `prediction/{save,page,repository,single-game}.ts`, `dashboard/{standing,league-table,leaderboard,dashboard}.ts`, `admin/pages.ts`, `league/{payments,search,roster,exit,dashboard}.ts`, `summary/{standings,results,league-view,compare,chart}.ts`, `survival/{save,request,page,summary}.ts`, `player/repository.ts`, `account/registration.ts`, `import/{state,preview,command,apply}.ts`, `bin/euroleague-import.ts`, `points/totals.ts`. All drop `rules`; where the code used `rules.name` as the source filter it uses `LIVE_SOURCE`.
- `recalculateUnderRuleSet` is renamed `recalculateLive` (or kept under its name until the end: see open question 4). It reads `game_odds` rows saved under `LIVE_SOURCE` for games with a row (R-99), else votes; saves under `LIVE_SOURCE`.
- Delete: `loadInputsUnderRuleSet` and its `'production'` read (only the golden db test calls it), `loadStoredSurvivalRows`, `loadInputsToSave`'s two-way split, `InputReads` plumbing in `loadTournamentInputs`, the `reads.survival === 'stored-rows'` branch, `rows.ts` branches on `source === 'production'` (lines near 192 and 280), and the survival loader's "derived, not a stored row" guard.
- `recalculation/lock.ts`: comment only.
- `league/exit.ts`: stop counting leagues anywhere. `league/search.ts`: single query.
- `counts.ts` / `countPointsRows` / `STORED_TABLES`: these are the reader's load report and probably dead since #45 (exported from `index.ts`, so knip does not flag them). Check in slice 5 and delete if no reader remains. Same for `tournament/snapshot.ts`'s `production` field (the snapshot saver survives only for tests and `apps/web/tests/support/registration.ts`).

### Web (`apps/web`)

About 60 mechanical call sites pass `rules: ruledRules` (pages, route handlers,
`server/**`). They only delete an argument and an import. Real changes:
`components/rules/rules-view.test.tsx` and `rules-parity.test.tsx` (303 lines;
compares sportbet and ruled pages: delete the parity half, keep the ruled
assertions), `described-tournament.ts` (`rulesPage(ruledRules, ...)`),
`server/leaderboard.ts`, `server/admin/**`, `server/leagues/{search-players,leave-league}.ts`,
`server/register/*`, `server/public-league.ts`, `server/import/import.ts`.

### Tests

- Tests that run under both sets (`describe.each([sportbetRules, ruledRules])`,
  the 16 `sportbetRules` uses in `rule-set.test.ts`, the "difference" tests
  CLAUDE.md demands): delete the sportbet case, keep the ruled one.
- Parity-only tests, delete: `rules/rule-set.test.ts` (its DIFFERENCES map and
  the "sportbet and ruled disagree on every key" generator; replace with a
  small test that each published figure constant has its value),
  `rules/input-reads.test.ts`, `survival/stored-survival.test.ts`,
  `packages/db/test/golden.test.ts`'s sportbet half and the
  `loadInputsUnderRuleSet reads what each rule set reads` test,
  `GOLDEN_POINTS_SPORTBET` in `golden/golden-snapshot.ts`,
  `apps/web/src/components/rules/rules-parity.test.tsx`'s sportbet half,
  `phpSpaceship` tests in `ranking/league-table.test.ts`, the stored-rows tests
  in `recalculation.test.ts`, and the `loadStoredSurvivalRows` tests.
- Keep: `GOLDEN_POINTS_RULED` and `packages/domain/src/golden/golden.test.ts`
  as the ruled regression (its expected numbers must not change in any slice),
  `packages/domain/test/php-reference/` (proves `phpRound`, which live crowd odds
  still use).
- Tests that are single-set today and use the `testing.ts` default
  (`sportbetRules`): each is converted by hand against `docs/owner-rulings.md`,
  never by editing a ruled expectation to match output (risk 2).

## 4. `points_source`: minimal safe design

Facts: the enum `points_source` is `['production', 'sportbet', 'ruled']`, built
in `packages/db/src/points/names.ts` as `['production', ...RULE_SET_NAMES]`.
CHECK constraints in `packages/db/src/points/schema.ts` (lines about 206-221)
speak of `'production'` (a production survival row has `sportbet_id`, no
`stored_row_id`). The live database holds old `production` and `sportbet` rows
(migrated data and parity runs) next to live `ruled` rows. Postgres cannot drop
an enum value without recreating the type.

Design:

1. Keep the enum values and every stored row. No migration. Move the literal
   list into `names.ts`: `POINTS_SOURCES = ['production', 'sportbet', 'ruled'] as const`
   (same order), with a comment that `production` and `sportbet` rows are
   retired history that no code reads or writes. `db:generate` must produce no
   new migration; that is the slice's check.
2. One constant, `export const LIVE_SOURCE = 'ruled' satisfies PointsSource`, in
   `names.ts`. Every writer saves under it; every reader filters on it. Nothing
   defaults: a query still has an explicit source predicate, so an unfiltered
   query can never sum the retired rows into a total.
3. The low-level `points/repository.ts` and `points/rows.ts` functions (about
   a dozen take `source: PointsSource`) lose the parameter and use `LIVE_SOURCE`
   inside, in one place. `PointsSource` stays an exported type only for the
   schema and the tests that seed retired rows.
4. `deleteGame` and `deleteAccount` keep removing points rows under every source
   (their foreign keys restrict, as CLAUDE.md says): untouched.
5. One test (`packages/db/test`) seeds `production` and `sportbet` rows beside
   `ruled` rows and proves every loader and `loadTournamentTotals` ignores them.
   This replaces the old guarantee "a parity run can never be read as the live
   rows" with a direct one.
6. The `production`-only branches in `rows.ts` and the schema's CHECKs stay (the
   CHECKs are on the table; removing them is a migration, a separate owner
   decision, see open question 1).

New wording for the CLAUDE.md rule "Every points row carries its `points_source`":
"Every points row (`game_odds`, `match_points`, `standings_points`,
`survival_points`) is saved and read under `LIVE_SOURCE` (`ruled`)
(`packages/db/src/points/names.ts`); a query always filters on it, never
defaults. The `production` and `sportbet` rows in the live database are retired
history: nothing reads or writes them, and they are not deleted without the
owner. Migrated rows keep sportbet's ids ... [unchanged]".

## 5. CLAUDE.md and docs wording to change (owner approves decisions text)

### CLAUDE.md (project)

1. Opening paragraph: "stays in production until this project reaches parity" is
   stale since the retirement; and "The rules this app must reproduce are
   specified in the old repo's `CLAUDE.md`" (the old repo is still the source of
   the original rules; owner words).
2. Code rules, bullet "A difference between sportbet's rules and the owner's
   rulings goes in `RuleSet`...": replace by "A ruling is code in the module that
   applies it, named after its catalogue rule, its figure a named constant when
   it is published on /rules or /help. Changing a ruling that moves stored points
   is a change of that constant, a test, an entry in `docs/owner-rulings.md` and
   a `recalculateAll` run (the R-138 precedent). There is no rule-set parameter
   and no global switch."
3. Bullet "Stored points rows ... derived only through `recalculateTournament`":
   drop "per tournament and rule set" and "under the rule set's name"; "reads
   what the rule set reads" becomes "reads the tournament's inputs".
4. Bullet "Domain values are fixed-point integers": delete the `phpSpaceship`
   sentence (the survival summary's tie order under `sportbetRules`); keep
   `barPercent` pending open question 2.
5. Bullet "Every points row ... carries its `points_source`": section 4 wording.
6. Bullet "Parity with sportbet beats a nicer rule: a constraint must accept every
   row production holds": reword to "every row the live database holds" (owner).
7. Mentions to update in place: `RuleSet.memberSearch` (league bullet, near
   "Players are found only by `searchPlayers`"), `RuleSet.collectedPotLeavesGuestsOut`
   (payments bullet), "apply R-50 and R-55 through the rule set" (hub bullet),
   "both rule sets (R-128 ...)" (standings deadline bullet), "from the rule set's
   stored rows and the picks" (survival bullet), "Under `ruledRules` a scored game
   keeps the `game_odds` row ... (`inputReadsOf`: `'stored-else-votes'` ...)"
   (account deletion bullet: it becomes "a scored game keeps the `game_odds` row
   it was scored with"), "its rule set's rows, totals" (dashboard `loadTournamentStanding`
   bullet), "everything under `ruledRules` (R-100)" (`/rules` bullet), and the lock
   order bullet's "`recalculateUnderRuleSet` requires" (name per open question 4).
8. Section "Code rules" heading refers to nothing else; no change.

### docs/decisions.md (owner approves; do not edit history, add a dated note)

- Decision 4: extend the `2026-10-20 (#45)` note with `2026-10-20 (#46): RuleSet
  is collapsed to the ruled behaviour; the enum values stay.`
- Decision 7 (parity checker recomputes every row, "switch between tournaments"):
  superseded in fact by the switch of 2026-10-19; add a one-line note, as #45 did
  for decision 4.
- Decision 10 last bullet "which the parity checker (decision 7) depends on".
- Decision 11 "so the parity checker (decision 7) can prove every row" (past
  rationale; leave, note).
- "Settled in the core-schema spec", bullet "Points sources": rewrite per
  section 4.
- "Settled in the parity-checker spec": the two oracles, the pass bar
  (`sportbetRules` equals sportbet's recalculation), and "One recalculation
  operation ... used by the reader, the golden db test and the web's result entry"
  become a single dated note "retired with #45/#46; the operation is
  `recalculateUnderRuleSet`, used by the web".

### docs/owner-rulings.md

About 20 passages end with "A `RuleSet` field: `sportbetRules` keeps ..." or "in
both rule sets" (lines 58, 110, 129, 174, 229, 242, 269, 293, 303, 315, 338, 451,
452, 455, 465, 491, 695, 715, 817-818, 903, 911). The rulings stand; add one note
at the top ("`RuleSet` was collapsed in #46: where a ruling says 'a `RuleSet`
field' or names `sportbetRules`, only the ruled behaviour remains in the code")
and leave the individual entries as history. Owner decides whether to edit each.
Also `docs/phase-2-inventory.md` line about 607 (`new-code-wrong`), and
`.claude/agents/qa.md` (mentions `RuleSet`/`ruledRules`): update after the
collapse; the latter is agent config, ask the owner.

Old specs and plans (`docs/superpowers/specs|plans/*`) are dated history: leave.
`.github/workflows/ci.yml` line 30 comment ("The build of sportbet's image for the
parity tests") is stale after #45 (not a gate file; devops may fix it, the
timeout may shrink).

## 6. Gate-config edits for the owner

None required. Checked: `eslint.config.mjs`, `knip.json`,
`.dependency-cruiser.cjs`, `vitest.config.ts`, `stryker.config.mjs` and
`quality/*.json` name no `RuleSet`, `rule-set` or `sportbetRules` path, and
`quality/crap-baseline.json` does not exist, so no stale baseline entries.
Deleted source files shrink what the gates run and nothing else. One thing to
watch, not an edit: mutation testing of changed files (`breakChanged` 60) will
score the large mechanical diffs; the slices below stay within what that run
finishes in because each touches one cluster. If a slice is too heavy for the
stop-hook mutation run, the owner may run it with `node quality/gate.mjs check`
and the full mutation in CI.

## 7. Slices (each leaves main green; domain before db before web within each)

Each slice is vertical over its cluster: it removes the fields, the sportbet
branches, the tests of the sportbet side, and the `rules` parameter of every
function whose last read of the rule set disappears, with its db and web callers
in the same commit (TypeScript excess-property checks make a half-dropped
parameter a compile error). `RuleSet` shrinks field by field, so
`rule-set.test.ts`'s DIFFERENCES map is updated in every slice.

Preflight (owner, before slice 1): decisions wording of section 5 approved; a
restore of the latest backup into a throwaway Postgres (restore-runbook) so the
no-change proof (section 8) has data.

**Slice 1: sportbet-only survival, odds and ranking machinery** (riskiest in
effect on stored points; mechanically contained).
Fields removed: `survivalScoredFromStoredRows`, `missingOddsScoreAtOne`,
`crowdOddsCountFilledIn`, `survivalRegularSeasonOnly`, `tieOrder`,
`everyPageRanksByFullTotal`, `rankHistoryFromWhenEarned`.
Deletes: `survival/stored-survival.ts`, `survivalAtResultEntry`, the stored-rows
variant of `SurvivalSource` and its refusals, `rules/input-reads.ts`,
`InputReads` and the production-rows inputs in `db/src/recalculation/repository.ts`,
`loadStoredSurvivalRows`, `loadInputsUnderRuleSet`, `CrowdOdds.missing`,
`phpSpaceship` and the per-page order, `SURVIVAL_MULTIPLIER` folded in here too
(`survivalMultiplier`), the `rows.ts` production-only parsing that becomes
unreachable. Estimated removal: about 900 lines (about 350 src, about 550 tests
incl. `stored-survival.test.ts`, the golden db sportbet half,
`GOLDEN_POINTS_SPORTBET`).
Tests: ruled golden (domain and db) unchanged; the `recalculation.test.ts`
ruled cases unchanged.

**Slice 2: scoring and standings** (R-138 figures, standings).
Fields: `differenceSlope`, `exactDifferenceBonus`, `exactScoreBonus`,
`positionsGetCrowdBonus`, `standingsBonusPopulation`,
`placesScoredOnlyFromFinalTable`, `unscoredPlaceStoresNull`.
Adds `SCORING_BALANCE` (constants). `scoreMatch`, `marginParts`, `isExactScore`,
`scoreStandings` and the published-figures modules lose `rules`; `/rules` figures
read the constants. Estimated removal: about 450 lines (about 150 src, 300 tests:
the 24 `sportbetRules` uses in `match-scoring.test.ts` and 15 in
`standings-scoring.test.ts`).
Tests: `published-figures.test.ts` and the `rules-view` tests assert the same
published numbers as today (R-138: 2, 30, 100, doubled survival).

**Slice 3: rounds, players, fill-ins** (riskiest by breadth: `PlayerStatus` has 47
references and 124 test cases; `Season.currentRound` has about 12 callers).
Fields: `movedGameReopens`, `currentRound`, `stageRates`,
`finishedTournamentsFrozen`, `fillInsOfMistakenResultRemoved`, `lateJoinersFilledIn`,
`switchOff` (+ constant), `onlyAScoreSwitchesBackOn`, `adminHideSeparate`.
Estimated removal: about 900 lines (about 250 src, about 650 tests, mostly
`player-status.test.ts`, `season.test.ts`, `game.test.ts`, `fill-in.test.ts`).
Split in two commits if the diff passes about 1,500 touched lines: (3a) players
and fill-ins (`player-status`, `fill-in`, `predict-match`, `joining` fill-ins,
`account-deletion`), (3b) rounds (`game`, `season`, `round`, `stage` and their
callers).
Tests: the `PlayerStatus` tests keep the ruled `describe` blocks and are not
renumbered.

**Slice 4: leaderboard, hub, joining and leagues.**
Fields: `leaderboardCountsEachListedTournament`, `leaderboardPublicTournamentsOnly`,
`hubFinishedFollowsR21`, `nonPublicTournamentsHidden`, `lastLeagueCountedPer`,
`memberSearch`, `collectedPotLeavesGuestsOut`, `feeDueHiddenFromGuests`.
Also removes now-unread data: `otherLeaguesAnywhere` (domain input, db query),
the every-account member search query, hub's `status === 'finished'` and
`allScored` window reads if unread. Estimated removal: about 600 lines (about
200 src, 400 tests).
By now `RuleSet` has only `name` left.

**Slice 5: delete RuleSet, `LIVE_SOURCE`, docs.**
Removes `RuleSet`, `ruledRules`, `sportbetRules`, `RULE_SET_NAMES`, `RuleSetName`
and every remaining `rules` parameter and `ruledRules` argument (about 60 web
call sites and the db pass-throughs), adds `LIVE_SOURCE`, drops the `source`
parameters of `points/repository.ts` and `points/rows.ts`, renames or keeps
`recalculateUnderRuleSet` (open question 4), removes `counts.ts` and
`snapshot.production` if dead, deletes `rule-set.ts` and `rule-set.test.ts` (a
small `points-source.test.ts` and the ignore-retired-rows db test replace them),
removes the `testing.ts` default, applies the approved CLAUDE.md and decisions.md
text. Mostly mechanical; estimated removal about 500 lines (about 350 src, 150
tests) with about 250 touched without net change.
Total across the slices: about 3,300 lines removed (about 1,100 src, about 2,200
tests); additions about 300 (constants, the retired-rows test).

Order rationale: slice 1 removes the largest sportbet-only code and proves the
no-change method on the riskiest stored-points path first; slices 2-4 are
independent of each other (they can be reordered or run by separate teammates in
separate folders: domain scoring, domain players, db/hub); slice 5 only runs when
the type is empty.

Rollback: every slice is one commit on `main` (trunk-based) with no migration
and no data change, so `git revert` of a slice restores the previous code against
the same database; stored rows are identical either way. Slice 5's only
irreversible part is not in this plan: purging old `production` and `sportbet`
rows (open question 1).

## 8. Risks and the no-change proof

Top risks:

1. **Stored points move.** The R-138 scoring, survival, standings and odds code
   all sits in the slices. Mitigation: `GOLDEN_POINTS_RULED` must not change in
   any slice (a changed golden file in a diff is a stop); and an owner-run check
   on a restored backup: run `recalculateAll` with the previous build and with the
   slice's build into two throwaway databases and diff `game_odds`, `match_points`,
   `standings_points` and `survival_points` under `ruled` (should be empty); the
   restore runbook already restores the backup. With the parity checker gone this
   diff is the only proof against live-shaped data.
2. **Tests converted to the wrong numbers.** `testing.ts` defaults to
   `sportbetRules`, so many single-set tests currently assert sportbet numbers
   (20/50 bonuses, 5-miss switch-off, lifetime counts). Rewriting an expectation
   to match output hides a regression. Rule: a ruled expectation that already
   exists is never edited; a converted test takes its numbers from
   `docs/owner-rulings.md` or from the existing ruled twin, or is deleted if it
   only proved sportbet. The qa agent reviews each slice's test diff for edits to
   expected values.
3. **Breadth and half-dropped parameters.** `PlayerStatus` and `Season.currentRound`
   touch domain, db and web; a param dropped in domain breaks callers in every
   package, so the commit must be atomic across packages (and passes `tsc` and the
   architecture rules together). Also the lock-order, `recalculateUnderRuleSet` and
   `TournamentLock` contracts are load-bearing: slice 5 must not change any lock,
   only arguments.

Other risks: knip flags exports orphaned by a deleted field (delete them in the
same slice); the mutation gate on a large diff; a missed `rules.name` source filter
(an unfiltered read of the retired rows), covered by the retired-rows test in
slice 5 and by keeping the filter predicate explicit in slices 1-4 (`rules.name`
still exists then).

## 9. What must NOT be collapsed

- Real product rules that were never a difference: `Game.isOpenAt`, locks,
  `Season.currentRound`, `mayRecalculateAt`'s frozen-finished rule (R-22),
  `isRegistrationOpenWindowAt`, `standingsClosesSql`/`Season.standingsCloses`,
  the survival pick rules (`SurvivalRun.withPick`), the lock order.
- The R-99 behaviour that a scored game keeps its `game_odds` row (the only odds
  read after the collapse is "stored under `LIVE_SOURCE`, else computed from the
  votes"); `saveResult` forgetting its game's row first.
- `phpRound` and the floats inside the crowd-odds formula, proven by
  `packages/domain/test/php-reference/`: live odds come from them, and a change
  would move stored `game_odds` for every game. `phpRoundScaled` / `barPercent`
  (the payments meter) stay for the same reason pending open question 2.
  Only `phpSpaceship` goes (its sole caller was the sportbet tie order).
- `unicodeCiCompare` (medal tally), `lithuanianOrder`.
- `STAGE_RATES`, `EUROLEAGUE_POINTS`, the R-138 numbers, the 20-miss switch-off:
  business figures, kept as named constants (section 2).
- The `points_source` enum, its CHECK constraints, `PointsSource` type, every
  migration, `deleteGame`'s and `deleteAccount`'s removal under every source.
- The format union (decision 11): football will bring its own rule differences
  through `format`, not through a revived `RuleSet`; the exhaustive switches stay.
- Catalogue and ruling documents (`docs/superpowers/specs/*catalogue*`,
  `docs/owner-rulings.md`): the reasons for each rule stay.

## 10. Open questions for the owner

1. Purge the retired `production` and `sportbet` rows, and later drop the enum
   values and their CHECKs? It is one-way (needs a migration that recreates the
   enum type and a backup first). This plan does not do it; recommendation: not
   now, revisit after a few weeks of live running.
2. Keep `barPercent` / `phpRoundScaled` (payments meter agrees with sportbet at
   float ties)? With no oracle the PHP-tie behaviour is only a display detail;
   recommendation: keep, simplify later on its own issue.
3. Approve the wording in section 5 (CLAUDE.md bullets 1, 2, 6; decisions.md
   notes for decisions 4 and 7, the core-schema "Points sources" bullet and the
   parity-checker block). Should `docs/owner-rulings.md` entries be edited one by
   one or only get the top note?
4. Rename `recalculateUnderRuleSet` / `TournamentLock` consumers (for example
   `recalculateLive`)? The name appears in CLAUDE.md, the lock-order text and many
   tests; recommendation: keep `recalculateUnderRuleSet` until a calmer moment, or
   rename in slice 5 only if the owner wants the churn.
5. A changed ruling after the collapse (for example a later R-139) moves stored
   points by changing a constant and running "Perskaičiuoti taškus". Confirm this
   is the intended process (it matches R-138's retroactive change), instead of
   keeping a second rule set for "preview" runs.
6. Keep a frozen `GOLDEN_POINTS_SPORTBET` as documentation of what sportbet
   scored? Recommendation: delete; git history and the old repo hold it.
7. Is anything outside this repo (an admin script, staging seed `seed-staging.mjs`
   in `packages/db/dist`, a runbook) calling `sportbetRules` or reading
   `production` or `sportbet` rows? The in-repo search found only `dist` build
   output (regenerated by the build) and tests.
