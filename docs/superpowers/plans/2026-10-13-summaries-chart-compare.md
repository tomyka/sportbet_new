# Slice 11: summaries, chart and compare - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-7, web-dev takes tasks 8-13, qa and architect review each task, and only the lead commits.

**Goal:** `/summary/prediction/results`, `/summary/prediction/standings`, `/summary/chart` and `/compare/{userID}`, plus the "Suvestinė" navigation block, at sportbet's URLs and texts, under R-85, R-86 and R-102 (#28).

**Architecture:** The pages are read-only. Each `packages/db` loader reads the tournament through `loadTournamentStanding`: the listed players (R-73), the rule set's rows, the totals and the usernames. On top of that it reads only what its page needs: the season, the round names, started predictions, standings predictions and team outcomes. The domain decides everything shown: `predictionVerdict`, `standingsVerdict`, `resultsSummary`, `standingsSummary`, `pointsChart` and `comparePlayers`. Each `apps/web` page loads and returns one component. Nothing writes, locks, recalculates or calls `pointsChanged()`.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-summaries-chart-compare-design.md`. Rulings R-17, R-18, R-30, R-72, R-73, R-85, R-86, R-102.

## Decisions taken while planning (refine the spec; record them in it in Task 14)

1. **No `summaryShown`.** `tournamentContext` (`packages/domain/src/context/tournament-context.ts`) already computes `nav.summary` as `started || season.hasAnyResult()`, which is `NavVisibility::showSummary`, and `shell-for.ts` already passes it to the shell. The spec's new function is dropped. The nav entries read `view.nav.summary`.
2. **One placement of earned points.** `leagueHistory` moves points counted at a game that is not scored yet to the latest scored game (R-72). That move becomes one exported function, `placedAtScoredGames(season, earned)` in `dashboard/earned-points.ts`. `leagueHistory`, `pointsChart` and `comparePlayers` all use it, so the chart's last value and compare's rounds cannot drift from the table.
3. **A stage's verdict is pending until the stage is decided.** sportbet's `teams.quarterfinal` / `semifinal` are null until an admin sets them. Here a `TeamOutcome`'s ticks are booleans, so a tick's actual value is `outcomes.stageDecided(stage) ? outcome.playOffs : null` (ST-6), and likewise for the Final Four. The final's `teamFinal` is `outcome.finalPlace` (null until entered), and its `teamSemifinal` is the Final Four's actual value. The place is judged against `outcome.place` as stored, as sportbet's view judges `teams.group_position`.
4. **Round names have one reader.** `prediction/page.ts:196` and `dashboard/dashboard.ts:82` each read `rounds.name`. That read becomes `loadRoundNames(db, tournament): Promise<ReadonlyMap<RoundNumber, string>>` in `packages/db/src/season/repository.ts`, and both callers and the summaries use it.
5. **"Spėjimo taškai" is the stage's `STANDINGS_POINTS` base** (`standings-scoring.ts:22`). "Koeficientas" is `1 + odds` from the stored fixed-point `StandingsOdds`, to two places, rounded half away from zero in integers (as PHP's `number_format`). Task 3's test checks both against sportbet's float division on every scored line of the golden scenario.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/summary/verdict.ts` (create) | `predictionVerdict`, `standingsVerdict` |
| `packages/domain/src/summary/results-summary.ts` (create) | `resultsSummary`, `ResultsSummary` |
| `packages/domain/src/summary/standings-summary.ts` (create) | `standingsSummary`, `StandingsSummary` |
| `packages/domain/src/summary/points-chart.ts` (create) | `pointsChart`, `PointsChart` |
| `packages/domain/src/summary/compare.ts` (create) | `comparePlayers`, `Comparison` |
| `packages/domain/src/dashboard/earned-points.ts`, `league-history.ts` (modify) | `placedAtScoredGames` (decision 2) |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/season/repository.ts` (modify) | `loadRoundNames` (decision 4) |
| `packages/db/src/prediction/repository.ts` (modify) | `loadStartedPredictions` |
| `packages/db/src/summary/{results,standings,chart,compare}.ts` (create) | the four loaders |
| `packages/db/src/index.ts` (modify) | exports |
| `packages/db/test/summary-*.test.ts` (create) | db tests |
| `apps/web/src/app/tokens.css`, `token-guard.test.ts` (modify) | verdict and series tokens |
| `apps/web/src/components/shell/{shell-paths,nav-entries,icon}.ts(x)`, `server/sign-in/guarded-pages.ts` (modify) | paths, entries, icons, returns |
| `apps/web/src/app/summary/prediction/{results,standings}/page.tsx`, `app/summary/chart/page.tsx`, `app/compare/[userID]/page.tsx` (create) | pages |
| `apps/web/src/components/summary/*.tsx`, `components/compare/*.tsx` (create) | views |
| `apps/web/src/components/dashboard/league-table.tsx` (modify) | names link to compare |
| `apps/web/tests/feature/summaries.test.ts` (create) | pages |
| `apps/web/e2e/predictions.spec.ts` (modify) | the journey |
| `CLAUDE.md`, the spec (modify) | readers of `loadTournamentStanding`, the decisions |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`.

Slice 10 is being built now. Rebase onto it before Task 8: it adds "Išlikimas" to the "Suvestinė" block, and this slice's entries go around it.

---

### Task 1: The verdicts

**Files:**
- Create: `packages/domain/src/summary/verdict.ts`, `verdict.test.ts`

```ts
/** PredictionVerdict::forResult, Euroleague's cases (decision 11: no shoot-out, so no 'partial'). */
export type PredictionVerdict = 'ok' | 'fail' | 'pending';

export function predictionVerdict(input: {
  readonly game: Game;                       // result, and its round's knockout flag via season
  readonly knockout: boolean;
  readonly prediction: { home: number; away: number } | null;
  readonly points: Pick<MatchPoints, 'winner'> | null; // the rule set's row, null before scoring
}): PredictionVerdict | null;                 // null: no prediction, no badge

export type StandingsVerdict = 'none' | 'pending' | 'hit' | 'miss' | 'partial';

export const standingsVerdict: {
  position(predicted: number | null, actual: number | null): Exclude<StandingsVerdict, 'partial'>;
  advanced(predicted: boolean, actual: boolean | null): Exclude<StandingsVerdict, 'partial'>;
  final(input: {
    predictedFinal: number | null;
    predictedFinalFour: boolean;
    teamFinalFour: boolean | null;
    teamFinal: number | null;
  }): StandingsVerdict;
};
```

The cases follow `PredictionVerdict.php` line by line:
- `forResult`: no prediction gives null. No result, or a postponed game (R-63), gives `pending`. Winner points above 0 give `ok`, unless the round is a knockout and the prediction is a draw (sportbet's `endingOk`). Everything else is `fail`.
- `position`: a null or 0 prediction is `none`; a null actual is `pending`; then `hit` or `miss`.
- `advanced`: no tick is `none`; a null actual is `pending`; a tick with a true actual is `hit`, otherwise `miss`.
- `final`: a null or 0 prediction is `none`. A team that is out before the Final Four is `miss`. A null final place is `pending`. An equal place is `hit`. Otherwise `partial` if the player ticked the Final Four, else `miss`.

- [ ] **Step 1: Write the failing tests.** Write one test per branch, each named after sportbet's case, e.g. `verdict: a correct winner in a knockout round with a predicted draw is fail (endingOk)`, `verdict: a team out before the Final Four is a miss whatever its final place`, `verdict: a postponed game is pending (R-63)`.
- [ ] **Step 2: Run and watch them fail.** `pnpm --filter @sportbet/domain test -- verdict`. Expect FAIL: the module does not exist.
- [ ] **Step 3: Implement.** Write pure functions with no I/O.
- [ ] **Step 4:** Run again. Expect PASS.
- [ ] Commit - `feat(domain): the summaries' verdicts, ported from PredictionVerdict for Euroleague (#28)`

---

### Task 2: `placedAtScoredGames` and the results summary

**Files:**
- Modify: `packages/domain/src/dashboard/earned-points.ts`, `league-history.ts` (+ tests)
- Create: `packages/domain/src/summary/results-summary.ts`, `.test.ts`

```ts
/** R-72: points counted at a game not scored yet count at the latest scored game; none before any. */
export function placedAtScoredGames(
  season: Season,
  earned: readonly EarnedPoints[],
): readonly EarnedPoints[];

export interface ResultsSummary {
  readonly columns: readonly { player: PlayerId; username: string }[]; // R-102: league table order
  readonly rounds: readonly SummaryRound[];
  readonly totalCents: ReadonlyMap<PlayerId, number>;                  // "Viso": match + serija of the shown games
}
export interface SummaryRound {
  readonly round: RoundNumber;
  readonly name: string;
  readonly open: boolean;                                             // unfolded at first
  readonly totalCents: ReadonlyMap<PlayerId, number>;
  readonly games: readonly SummaryGame[];
}
export interface SummaryGame {
  readonly game: GameId;
  readonly home: TeamId; readonly away: TeamId;
  readonly result: { home: number; away: number } | null;            // null: "-"
  readonly cells: ReadonlyMap<PlayerId, SummaryCell>;
}
export interface SummaryCell {
  readonly score: { home: number; away: number } | null;
  readonly verdict: PredictionVerdict | null;
  /** Present once scored: full + serija, and the popover's parts, in cents. */
  readonly points: { totalCents: number; winnerCents: number; marginCents: number; bingoCents: number; serijaCents: number } | null;
}

export function resultsSummary(input: {
  readonly season: Season;
  readonly now: Instant;
  readonly table: readonly LeagueTableRow[];              // column order (R-102)
  readonly rows: Pick<PointsRows, 'matches'>;
  readonly predictions: readonly StartedPrediction[];     // listed players, games no longer open
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
  readonly current: RoundNumber | null;                   // tournamentContext's currentRound
}): ResultsSummary;
```

- [ ] **Step 1: Write the failing tests.**
  - `placedAtScoredGames`: a standings tick at an unplayed game moves to the latest scored game, and nothing moves when no game is scored. Existing `leagueHistory` tests stay green unchanged.
  - `resultsSummary`:
    - an open game is never shown, even with predictions passed in, and a game at its tip-off instant is shown (`isOpenAt` false);
    - a started unscored game shows "-" and `pending`;
    - rounds with a started unscored game come first, then finished rounds by their last tip-off, most recent first;
    - only those rounds and the current round are `open`;
    - columns follow the table's order, including a tie in Lithuanian order (R-30, R-102);
    - round sums and "Viso" are match + serija in cents;
    - a player with no row has 0 there (the view blanks it);
    - another tournament's game in `predictions` throws, because it is an impossible state (R-86 is the loader's job).
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.** Extract `placedAtScoredGames` from `leagueHistory`, and make `leagueHistory` call it. Then write `resultsSummary`.
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test`. Expect PASS.
- [ ] Commit - `feat(domain): resultsSummary - everyone's predictions on started games, in the table's order (R-86, R-102) (#28)`

---

### Task 3: The standings summary

**Files:**
- Create: `packages/domain/src/summary/standings-summary.ts`, `.test.ts`

```ts
export interface StandingsSummary {
  readonly columns: readonly { player: PlayerId; username: string }[]; // R-102
  readonly teams: readonly { team: TeamId; cells: ReadonlyMap<PlayerId, StandingsCell> }[];
}
export interface StandingsCell {
  readonly place: StandingsBadge;        // shows the place or "-"
  readonly playOffs: StandingsBadge;     // "1/4": "✓" / "✗" / "-"
  readonly finalFour: StandingsBadge;    // "1/2"
  readonly final: StandingsBadge;        // the final place or "-"
  readonly totalCents: number;           // shown above 0
}
export interface StandingsBadge {
  readonly shown: string;
  readonly verdict: StandingsVerdict;
  /** The popover: null shows only a title (sportbet's `title=` branch). */
  readonly popover: { pointsCents: number; base: number | null; multiplier: string | null } | null;
}

export function standingsSummary(input: {
  readonly table: readonly LeagueTableRow[];
  readonly teams: readonly TeamRow[];                    // the tournament's, by name
  readonly outcomes: TeamOutcomes;
  readonly predictions: readonly StandingsPrediction[];  // listed players only
  readonly rows: Pick<PointsRows, 'standings'>;
}): StandingsSummary;
```

The team rows keep sportbet's order (`Team::where(...)->get()`, by id; Euroleague has no group). Only Euroleague's four badges are built (spec). A badge's popover follows `sstBadgePopover`: it shows the points, plus the base and multiplier when the odds are above 0 and the points are above 0 (decision 5). The place and final badges carry a popover whenever a prediction exists. The tick badges carry one only when ticked.

- [ ] **Step 1: Write the failing tests.**
  - each badge's symbol and verdict, across the outcomes (decision 3);
  - the cell total;
  - a popover with and without odds;
  - a player without predictions has no cell;
  - columns in the table's order;
  - `golden scenario: base and multiplier equal sportbet's division to the shown places`, which runs over every scored line of `packages/domain/test/golden/` and compares against `round(points / (1 + odds), 1)` and `round(1 + odds, 2)` computed in the test.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run again. Expect PASS.
- [ ] Commit - `feat(domain): standingsSummary - everyone's standings with verdicts, Euroleague's stages (#28)`

---

### Task 4: The chart

**Files:**
- Create: `packages/domain/src/summary/points-chart.ts`, `.test.ts`

```ts
export interface PointsChart {
  readonly games: readonly { game: GameId; label: string }[];   // "HOM - AWA"
  readonly count: string;                                        // "1 rungtynės" / "N rungtynių"
  readonly drawPoints: boolean;                                  // up to 40 games
  readonly lines: readonly { player: PlayerId; username: string; series: number; totalsCents: readonly number[] }[];
}

export function pointsChart(input: {
  readonly season: Season;
  readonly table: readonly LeagueTableRow[];       // order and each row's history (R-85, R-102)
  readonly teamNames: ReadonlyMap<TeamId, string>;
}): PointsChart;
```

A line's values are its `LeagueTableRow.history[].totalCents`: `leagueHistory` already counts every kind at R-72's games. `series` is the line's position modulo 10, which picks `--color-series-1..10`. A label is the first three characters (code points) of each team name, upper-cased, joined with " - ".

- [ ] **Step 1: Write the failing tests.**
  - every line ends at its row's `totalCents` (R-85), with standings and survival included and each placed at its R-72 game;
  - the x-axis is the scored games by tip-off then id;
  - "1 rungtynės", "2 rungtynių";
  - `drawPoints` at 40 and 41;
  - a "Šiauliai"-like name gives "ŠIA" (characters, not bytes);
  - no scored game gives no games and empty lines.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run again. Expect PASS.
- [ ] Commit - `feat(domain): pointsChart - every point at R-72's games, ending at the table total (R-85) (#28)`

---

### Task 5: Compare

**Files:**
- Create: `packages/domain/src/summary/compare.ts`, `.test.ts`

```ts
export type CompareRefusal = 'self' | 'not-listed';

export interface Comparison {
  readonly me: CompareSide;
  readonly them: CompareSide;
  readonly record: { wins: number; draws: number; losses: number } | null; // null: no round
  readonly rounds: readonly { round: RoundNumber; name: string; meCents: number; themCents: number }[];
}
export interface CompareSide {
  readonly player: PlayerId; readonly username: string; readonly rank: number;
  readonly totalCents: number; readonly matchCents: number; readonly standingsCents: number;
  readonly survivalCents: number; readonly serijaCents: number; readonly bingo: number;
}

export function comparePlayers(input: {
  readonly season: Season;
  readonly table: readonly LeagueTableRow[];
  readonly rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>;
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
  readonly viewer: PlayerId;
  readonly other: PlayerId;
}): Result<Comparison, CompareRefusal>;
```

`self` comes before `not-listed`, as in sportbet. Either player missing from `table` gives `not-listed`. A round's sums are `placedAtScoredGames(season, earnedPointsOf(season, rows))` for the two players, grouped by the round of each entry's game. Only rounds with a scored game are listed, in season order (round number).

- [ ] **Step 1: Write the failing tests.**
  - each side's rounds add up to its table total (R-85);
  - a standings tick lands in round 38's round, and a survival point in its pick's round;
  - the W/D/L record, including a draw at equal cents;
  - `record` is null with no rounds;
  - `self`; `not-listed` for the other player; `not-listed` for the viewer.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test && pnpm typecheck`. Expect PASS.
- [ ] Commit - `feat(domain): comparePlayers - two players, rounds summing to the table totals (R-85) (#28)`

---

### Task 6: Round names and started predictions

**Files:**
- Modify: `packages/db/src/season/repository.ts`, `packages/db/src/prediction/page.ts`, `packages/db/src/dashboard/dashboard.ts`, `packages/db/src/prediction/repository.ts`
- Create: `packages/db/test/summary-predictions.test.ts`

```ts
export async function loadRoundNames(db: Executor, tournament: Tournament): Promise<ReadonlyMap<RoundNumber, string>>;

/** The players' predictions on the tournament's games whose tip-off is at or before `now`. */
export async function loadStartedPredictions(
  db: Executor,
  input: { tournament: Tournament; players: readonly PlayerId[]; now: Instant },
): Promise<StartedPrediction[]>; // { player, game, home, away }, parsed by the prediction schema
```

`players` is always `standing.listed`. This function has no roster query of its own: slice 12 narrows it through `loadTournamentStanding`.

- [ ] **Step 1: Write the failing tests.**
  - a game at its tip-off instant is read, and one a millisecond later is not;
  - another tournament's games and an unlisted player's rows are never read (R-86, R-73);
  - a blank row (no score) comes back with null scores;
  - `loadRoundNames` returns every round.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.** Move the two existing name reads onto `loadRoundNames`.
- [ ] **Step 4:** Run them, plus the existing prediction-page and dashboard db tests. Expect PASS.
- [ ] Commit - `feat(db): loadRoundNames and loadStartedPredictions (#28)`

---

### Task 7: The four loaders

**Files:**
- Create: `packages/db/src/summary/{results,standings,chart,compare}.ts`, `packages/db/test/summary-loaders.test.ts`
- Modify: `packages/db/src/index.ts`

```ts
export async function loadResultsSummary(db, input: { player: PlayerId; tournament: Tournament; now: Instant; rules: RuleSet }): Promise<ResultsSummary>;
export async function loadStandingsSummary(db, input: { tournament: Tournament; rules: RuleSet }): Promise<StandingsSummary>;
export async function loadPointsChart(db, input: { tournament: Tournament; rules: RuleSet }): Promise<PointsChart>;
export async function loadCompare(db, input: { viewer: PlayerId; other: PlayerId; tournament: Tournament; rules: RuleSet }): Promise<Result<Comparison, CompareRefusal>>;
```

Each loader:
1. calls `loadTournamentStanding` and `loadSeason`;
2. builds `leagueTableRows(...)` from them;
3. reads only its extras: `loadRoundNames`, `loadStartedPredictions(players: [...standing.listed])`, `listTeams`, `loadTeamOutcomes`, `loadStandingsPredictions` (filtered to `standing.listed`), and the team names;
4. calls the domain.

`current` comes from `tournamentContext(...).currentRound`. None of them queries `tournament_players`.

- [ ] **Step 1: Write the failing tests.**
  - each loader reads the rule set's source only (a `sportbet` row never shows under `ruledRules`);
  - the roster is `listed` (a switched-off player is left out, RA-4);
  - the chart ends at `loadTournamentTotals`' total;
  - compare refuses an unlisted id.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run again. Expect PASS.
- [ ] Commit - `feat(db): the summaries', chart's and compare's loaders, all through loadTournamentStanding (#28)`

---

### Task 8: Paths, returns, navigation, icons, tokens

**Files:**
- Modify: `apps/web/src/components/shell/shell-paths.ts`, `nav-entries.ts`, `icon.tsx` (+ tests), `apps/web/src/server/sign-in/guarded-pages.ts` (+ tests), `apps/web/src/app/tokens.css`

- **Paths:** `RESULTS_SUMMARY_PATH = '/summary/prediction/results'`, `STANDINGS_SUMMARY_PATH = '/summary/prediction/standings'`, `CHART_PATH = '/summary/chart'`, `comparePath = (player: number) => \`/compare/${player}\``.
- **`GUARDED_PAGES`:** add `resultsSummary: []`, `standingsSummary: []`, `chart: []`, and `compare: [player: number]`. Compare's matcher is `^/compare/(ID_TEXT)$` plus `isId`.
- **Navigation:** add these to the `summary` group, `surfaces: ['rail', 'menu']`, `shownWhen: (view) => view.nav.summary`, in sportbet's order: "Prognozės" (`list-check`), "Eiga" (`table`), then slice 10's "Išlikimas", then "Grafikas" (`bar-chart-line`). Two labels repeat main entries ("Eiga"); the hrefs differ.
- **Icons:** add `list-check` and `bar-chart-line` (Bootstrap Icons paths, as the others).
- **Tokens:** add the verdict colours (`--color-verdict-ok/-fail/-pending`, `--color-standings-hit/-miss/-partial/-pending/-none`, from sportbet's `sr-pred-*` / `sst-*`) and `--color-series-1`..`10` (sportbet's palette `#3b82f6` .. `#84cc16`), each with a dark value under `[data-theme='dark']`.

- [ ] Write the tests first: each new guarded path round-trips (`path` -> `matches`) and compare refuses `0`, `+1` and an id past the cap; the token guard passes. The navigation entries themselves land with their pages in Tasks 9-12, because `nav-entries.test.ts` checks every href has a page; each of those tasks also tests the order and that the block is hidden while `nav.summary` is false. Run and expect FAIL; implement; expect PASS.
- [ ] Commit - `feat(web): summary paths, returns, icons and tokens (#28)`

---

### Task 9: "Prognozės"

**Files:**
- Create: `apps/web/src/app/summary/prediction/results/page.tsx`, `apps/web/src/components/summary/results-summary-view.tsx`, `results-grid.tsx`, `round-toggle.tsx` (client), `points-popover.tsx` (each with `.test.tsx`), `apps/web/tests/feature/summaries.test.ts`
- Modify: `nav-entries.ts` ("Prognozės")

The page follows `app/prediction/standings/page.tsx`: a guest goes to `signInAndReturn('resultsSummary')`, a player with no tournament goes to `/`, and anyone else gets `loadResultsSummary(..., rules: ruledRules)` and then `<ResultsSummaryView data={...} viewer={...} />`.

The view uses sportbet's markup and texts. The sticky first column is headed "Rungtynės". Each player column has its avatar letter (the username's first letter, upper case) and the username, and the viewer's column is marked. A round row has its chevron, name and "(n)", and the round sums are blank at 0. A game row shows the crests, the result or "-", and "Home · Away". A cell shows the points (one decimal) with the popover "Nugalėtojas", "Skirtumas", "Tikslus", "Serija" ("+" before a positive serija), and the score in its verdict badge. The footer is "Viso".

- [ ] Component tests first:
  - folded rounds hide their games and the toggle shows them;
  - the popover's four lines;
  - each verdict's token class;
  - blanks at 0;
  - the viewer's column;
  - no colour literals.
- [ ] Feature tests: the page for a player (another player's prediction on an open game absent, on a started game present), a guest's return after sign-in, no tournament.
- [ ] Commit - `feat(web): everyone's predictions at /summary/prediction/results (#28)`

---

### Task 10: "Eiga"

**Files:**
- Create: `apps/web/src/app/summary/prediction/standings/page.tsx`, `apps/web/src/components/summary/standings-summary-view.tsx`, `standings-grid.tsx`, `standings-legend.tsx` (each with `.test.tsx`)
- Modify: `nav-entries.ts`, `summaries.test.ts`

Legend: "Pataikyta", "Praleista", "Pusfinalis teisingas, finalo vieta ne", "Laukiama", "Nespėta"; stages "G Grupė", "QF 1/4", "SF 1/2", "F Finalas". The table is headed "Komanda", with one row per team (crest and name) and one column per player. Each cell has four badges and the total (one decimal, only above 0).

Popovers:
- per badge: "Grupės vieta", "Ketvirtfinalis", "Pusfinalis" or "Finalas", then "Spėjimo taškai" and "Koeficientas" "×1.23";
- for the total: one line per stage with points;
- without a popover, the title "Grupės vieta: spėta {n}" / "Finalas: spėta {n}" / "1/4" / "1/2".

- [ ] Component tests first: each badge's symbol and class, the popovers, the titles, the total's blank, and the legend. Feature tests: a player, a guest's return, no tournament, and standings shown while still open (CONTEXT.md).
- [ ] Commit - `feat(web): everyone's standings at /summary/prediction/standings (#28)`

---

### Task 11: "Grafikas"

**Files:**
- Create: `apps/web/src/app/summary/chart/page.tsx`, `apps/web/src/components/summary/points-chart-view.tsx`, `chart-svg.tsx`, `chart-interaction.tsx` (client) (each with `.test.tsx`)
- Modify: `nav-entries.ts`, `summaries.test.ts`

The header is "Taškų dinamika" and the count. The SVG has one `<path>` per line, `stroke="var(--color-series-n)"`, with point marks only when `drawPoints` is true. The x-axis is numbered 1..n. The y-axis has ticks at round values, and the grid and text use tokens. The client part:
- on hover or keyboard focus of a game index, it shows the tooltip: the title (the label, or "Žaidimas {i}"), then a "{username}:  {value} t." line per visible line, one decimal;
- a legend button per player toggles its line (`aria-pressed`).

It works without JavaScript as a static chart.

- [ ] Component tests first:
  - path count and order;
  - last point equals the total;
  - the tooltip's texts;
  - legend toggling hides a path;
  - no point marks past 40;
  - the empty chart (no scored game);
  - no colour literals.
- [ ] Feature tests: a player, a guest's return, no tournament.
- [ ] Commit - `feat(web): the points chart at /summary/chart (#28)`

---

### Task 12: Compare and the table's links

**Files:**
- Create: `apps/web/src/app/compare/[userID]/page.tsx`, `apps/web/src/components/compare/compare-view.tsx`, `compare-header.tsx`, `compare-stats.tsx`, `compare-rounds.tsx` (each with `.test.tsx`)
- Modify: `apps/web/src/components/dashboard/league-table.tsx` (+ test), `summaries.test.ts`

The page:
1. `idFromText(params.userID)`; a refusal is `notFound()`;
2. a guest goes to `signInAndReturn('compare', id)`, and a player with no tournament to `/`;
3. it calls `loadCompare(..., rules: ruledRules)`; `self` redirects to `PLAYER_HOME`, and `not-listed` is `notFound()`.

The view:
- the header: each side's rank, username and total (one decimal, the larger marked winner and the smaller loser), "vs", and "{w}W", "{d}D", "{l}L" when there is a record;
- "Bendri statistikos": "Rungtynių taškai", "Eigos taškai", "Išlikimo taškai" (whole, hidden when both are 0), "Serija", "Bingo" (whole), with the larger side marked;
- "Etapai" with the header "Etapas", one row per round, one decimal, the larger side marked;
- "Atgal" back to `PLAYER_HOME`.

League table: every row's name except the viewer's links to `comparePath(player)`. This ends the note at `league-table.tsx:263`.

- [ ] Component tests first: the marks on each row, the hidden survival row, the record, the empty rounds, and the table's links (the viewer's own name stays plain). Feature tests: a player comparing with another, self redirects, an unlisted id 404, `/compare/0` and `/compare/abc` 404, a guest's return.
- [ ] Commit - `feat(web): compare at /compare/{userID}, linked from the league table (#28)`

---

### Task 13: E2E

**Files:**
- Modify: `apps/web/e2e/predictions.spec.ts` (inside its signed-in journey, with no new sign-in)

At 1280:
1. Open "Prognozės" from the rail and check that a started seeded game shows a verdict badge.
2. Open "Eiga" and check the legend and a cell.
3. Open "Grafikas" and check one path per listed player.
4. From "Pradžia", click another player's name and check that compare shows "Bendri statistikos".

At 390: none of the four pages scrolls sideways (`scrollsSideways`), with the grids scrolling inside their own wrappers.

- [ ] `pnpm test:e2e -- predictions.spec.ts`. Expect PASS. If the seed has no scored game, add one in `packages/db/src/seed/staging.ts` and update `seed.test.ts`, then check the hub's and predictions' counts.
- [ ] Commit - `test(e2e): the summaries, the chart and compare at 1280 and 390 (#28)`

---

### Task 14: Docs

**Files:**
- Modify: `CLAUDE.md`, the spec

- [ ] **CLAUDE.md:** in the `loadTournamentStanding` paragraph, change "The league table, the game page (`/main`, `PLAYER_HOME`), `/leaderboard` and the hub's guest panels" to also list the summaries (`/summary/prediction/results`, `/summary/prediction/standings`), the chart (`/summary/chart`) and compare (`/compare/{userID}`). Then add: "What they show is decided in the domain (`packages/domain/src/summary/`); points counted at an unscored game count at the latest scored one only through `placedAtScoredGames`; no summary queries `tournament_players`."
- [ ] **The spec:** add planning decisions 1-5 under "Lead decisions", and drop `summaryShown` from the design.
- [ ] Commit - `docs: slice 11 - the summaries read through loadTournamentStanding; the plan's decisions in the spec (#28)`

---

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] Parity run (`tools/migrate --parity`) still holds: nothing here changes a stored point.
- [ ] `mp-code-review` from slice 10's last commit; `improve-codebase-architecture` on the new files (a new feature landed).
- [ ] Push; CI deploys staging; the owner checks the done-means; close #28.
