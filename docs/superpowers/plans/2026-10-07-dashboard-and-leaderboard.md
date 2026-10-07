# The Game Page, the League Table and the Leaderboard (Slice 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in player's home becomes `/main`, sportbet's game page, and `/leaderboard` is served, as sportbet 3eb95e7 has them, with the owner's rulings.
- **8a:** `/main` shows the round's progress line, the player's tiles ("vieta" with "↑N per 5 žaid.", "taškai", "bingo", "serija" within the tournament, R-71), "Taškų lentelė" (top 10 plus the player's row, "Rodyti visus", the sub-columns, the stage popover, each row's trend), "Finalų dalyvių prognozės" and "Aktyvumas"; the one-time message. `PLAYER_HOME` is `/main`; "Pradžia" and the brand link go there. The tournament page gets the same table. "The league" is the tournament's listed players (R-73).
- **8b:** "Artimiausios rungtynės" and "Visos rungtynės" on `/main`; a game's boxes open on a single click and autosave as the predictions page does (R-74), no "Keisti" on a started game (R-75).
- **8c:** `/leaderboard` across every tournament, R-18's full total under `ruledRules`, sportbet's columns and texts, its charity card in "krepšinio" (R-75); "Lyderiai" in the guest rail and pills once it has entries.
- **8d:** the rank history under `ruledRules` counts standings and survival points from the game they were earned at (R-17, R-72). Built first (Task 2), because 8a's trend and "per 5 žaid." read it.

**Architecture:**
- `packages/domain/src/dashboard/` decides: the game each stored points row counts from (`earned-points.ts`, R-72); each listed player's rank after every scored game and the five-game change (`league-history.ts`); the tiles, the progress line, the feed and the deck (`dashboard.ts`); the leaderboard rows (`leaderboard.ts`).
- `packages/db/src/dashboard/` only loads and asks the domain: `loadDashboard`, `loadLeagueTable` (also the tournament page's), `loadLeaderboard`, `anyLeaderboardEntry`.
- `apps/web` holds the `/main` and `/leaderboard` pages, their components, and the nav entries. 8b's games reuse slice 6's predictions components (`PredictionEditor`, the save protocol, `score-autosave`).
- `tools/migrate` reads `league_members.is_guest` and `leagues.is_public` for numbers-only counts, and the parity stage compares sportbet's `/leaderboard` ranks too.
- Nothing here recalculates: no `TournamentLock` is taken.

**Tech Stack:**
- Next.js 16.3.6 (App Router), React 19.3.
- Drizzle ORM 0.45.3 on Postgres 18.6, Zod 4.6.5.
- `Intl.DateTimeFormat` (Europe/Vilnius) through `components/format/vilnius-time.ts`.
- Vitest 5, Testing Library, jsdom 30, Playwright 1.63.
- **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-07-dashboard-and-leaderboard-design.md` (approved by the owner).

**Rulings:** R-6, R-7, R-17, R-18, R-19, R-28, R-30, R-31, R-40, R-46, R-51, R-52, R-59, R-61, R-62, R-71 to R-75 (`docs/owner-rulings.md`).

**Decisions:** 5, 10, 11, 13.

**Issue:** #22 (part of #1).

**Reference:** sportbet (`D:\Projects\sportbet`) at `3eb95e7`:
- `app/Http/Controllers/MainController.php` (index 9-90, leaderboard 109-139, tiles 242-329, progress 332-362, winners 166-203)
- `app/Http/Controllers/PointController.php` (getAllUserPoints 12-70, getAllUsersGameHistory 73-162)
- `app/Http/Controllers/ActivityFeedController.php` (6-150), `app/Services/StreakService.php` (length 34-41)
- `app/Support/{LeagueRoster,PlayerTotals,Ranking,SerijaCorrectness}.php`
- `resources/views/main.blade.php`, `leaderboard.blade.php`
- `resources/views/partials/{points,standings,stat-tiles,fixture-deck,activity-feed,games}.blade.php`, `partials/rail.blade.php`, `header.blade.php`
- `resources/views/tournaments/show.blade.php`
- `public/css/custom.css` (`.sb-tiles`, `.sb-tile*`, `.sb-topline*`, `.sb-progress*`, `.pts-*`, `.af-*`, `.fx-*`, `.lb-*`)

---

## Conventions for every task

**Roles and commits**
- Work on `main` (trunk-based, `CLAUDE.md`).
- Each task names the teammate role that owns its folders (`docs/agent-team.md`):
  - `backend-dev` edits `packages/domain`, `packages/db` and `tools/migrate`.
  - `web-dev` edits `apps/web`, including its component and feature tests.
  - `qa` edits E2E, smoke and `playwright.config.ts` only.
  - The lead edits the records and is the only one who talks to the owner.
- There is no `devops` task: no migration and no infrastructure change.
- Reviews:
  - `qa` reviews every task against #22's criteria and sportbet's behaviour.
  - `architect` reviews every task against `CLAUDE.md` and the spec.
  - `security-reviewer` reviews the tasks marked **(sensitive)**: `/main` and its redirects (Task 6), the games list's save (Task 9), `/leaderboard` (public, Task 11), the reader's new columns (Task 12: personal data must not leave the owner's PC).
- **Only the lead commits**, once those reviews have passed the task, and commits **only the files a hand-off lists, untracked ones included** (slice 7 swept unfinished files into three commits; never `git add` a whole folder while another teammate is working in it).
- A teammate's last step is "hand to the lead": the files changed (new ones marked), the commands run and their results, and the commit message.
- Every commit message references `#22` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 15. Tasks 7, 10 and 13 end a part with the whole check and a review pass; nothing is pushed in between.

**Running things**
- Shell snippets are Git Bash on Windows, run from `D:\Projects\sportbet_new`.
- The db, feature and reader suites need Docker running. The feature suite also needs a fresh `pnpm build`.
- Every verify step runs `pnpm format` first. A line Prettier rewraps is not a failure; `pnpm format:check` must pass after `pnpm format`.
- How to run one file:
  - Unit: `pnpm --filter @sportbet/domain exec vitest run <file>`
  - DB: `pnpm --filter @sportbet/db exec vitest run <file>`
  - Reader: `pnpm --filter @sportbet/migrate exec vitest run <file>`
  - Component and web unit: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`
  - Feature: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts <file>`

**sportbet and texts**
- "sportbet" means the old app at `3eb95e7`. Read any of its files with `git -C /d/Projects/sportbet show 3eb95e7:<path>`.
- Every Lithuanian text below is sportbet's (the views above), except where R-75 changes one. Each component's step lists its texts; the developer checks each against the Blade file named and reports any difference instead of guessing.
- No emoji is typed into any file, and no `\uXXXX` escape either. sportbet's feed icons (a target, a flame) and the leaderboard's medals are drawn with Bootstrap Icons glyphs already in `components/shell/icon.tsx` (`fire`, and `bullseye` added in Task 4 from the real bootstrap-icons@1.11.1 package, as slice 6 did for its icons) and with `components/hub/glyphs.ts`'s medal glyphs.

**Code rules** (`CLAUDE.md`)
- `packages/domain` imports only `zod`, and takes time as a parameter.
- Web reaches the database only through `@sportbet/db`. Pages only load data and return one component; markup lives in components, which have component tests.
- Colours exist only as tokens. Reuse `components/hub/styles.ts` (`CARD`, `CARD_TITLE`, `PANEL`, `BUTTON_*`) and the predictions page's classes.
- No `any`, no `as` other than `as const`, no `!`. A refusal is a `Result`; an impossible state throws.
- Every query result is parsed before it leaves `db`. Totals are read only through `loadTournamentTotals` (`CLAUDE.md`); ranking only through `rankPlayers`; the history only through `totalsAfterEachGame`.
- A prediction is saved only through the slice 6 save route (`PREDICTION_SAVE_PATH`) and its protocol (`components/predictions/save-protocol.ts`).
- **Nothing personal in any log or output.** The reader's new counts are numbers only.

## File map

```
packages/domain/src/dashboard/
  earned-points.ts      earnedPointsOf: the game each stored row counts from (R-72)     (+ test, new)
  league-history.ts     leagueHistory, rankChange (Ranking::change)                     (+ test, new)
  dashboard.ts          roundProgress, statTiles (R-71), activityFeed, fixtureDeck (R-75) (+ test, new)
  leaderboard.ts        leaderboardRows (PlayerTotals::allTime, R-18)                    (+ test, new)
packages/domain/src/index.ts                       the new exports

packages/db/src/dashboard/
  league-table.ts       loadLeagueTable (the table, its rows' parts and histories)       (new)
  dashboard.ts          loadDashboard (/main)                                            (new)
  leaderboard.ts        loadLeaderboard, anyLeaderboardEntry                             (new)
packages/db/src/hub/repository.ts                 usernamesOf and loadFinalPlaces exported as loadUsernames, loadFinalPlaces
packages/db/src/index.ts                          the new exports
packages/db/test/league-table.test.ts, dashboard.test.ts, leaderboard.test.ts (new)

tools/migrate/src/read-columns.ts                 + league_members.is_guest, leagues.is_public
tools/migrate/src/map.ts                          + the leagues notice (numbers only)
tools/migrate/src/sportbet-app.ts                 + sportbet's /leaderboard ranks in the old app's script
tools/migrate/src/parity/rankings.ts, report.ts   + the leaderboard comparison
tools/migrate/test/map.test.ts, src/sportbet-app.test.ts, src/parity/rankings.test.ts

apps/web/src/components/shell/shell-paths.ts      PLAYER_HOME '/main', MAIN_PATH, LEADERBOARD_PATH
apps/web/src/components/shell/nav-entries.ts      + "Pradžia" (player), "Lyderiai" (guest, shownWhen)
apps/web/src/components/shell/shell-view.ts       + leaderboardOffered
apps/web/src/server/shell-for.ts                  leaderboardOffered from anyLeaderboardEntry
apps/web/src/components/shell/icon.tsx            + bullseye, house-door-fill, trophy-fill if missing
apps/web/src/components/dashboard/
  progress-line.tsx, stat-tiles.tsx, league-table.tsx, trend.tsx,
  activity-feed.tsx, fixture-deck.tsx, games-list.tsx, dashboard-view.tsx  (each + test, new)
apps/web/src/components/leaderboard/leaderboard-view.tsx  (+ test, new)
apps/web/src/components/hub/charity-card.tsx       a `variant` for the leaderboard's card (R-75)
apps/web/src/components/tournament/tournament-page-view.tsx  + the league table and medals
apps/web/src/app/main/page.tsx                     /main (new)
apps/web/src/app/leaderboard/page.tsx              /leaderboard (new)
apps/web/src/app/tournament/[slug]/page.tsx        + the table
apps/web/tests/feature/dashboard.test.ts, leaderboard.test.ts (new); predictions.test.ts, session.test.ts
apps/web/e2e/predictions.spec.ts                   + /main after sign-in, a save from the games list, /leaderboard
CLAUDE.md                                          the records
```

## Design decisions this plan makes

None of these is a scoring rule; each is how the spec is held. Where one departs from the letter of the spec or of sportbet, the reason is given, and the lead lists it again in the report to the owner.

1. **8d is built first (Task 2).** The spec orders it last, but 8a's trend and "per 5 žaid." under `ruledRules` (the live set) read it; built later, 8a would ship a wrong history.
2. **R-72's "the game that decided it" is a stage's last game.** A stored standings row names a team and its lines (place, play-offs, Final Four, final); it does not record the game that decided each. So each line counts from the last game, by tip-off then id, of the stage that decides it:
   - the place: the last game of round 38 (`LAST_REGULAR_SEASON_ROUND`);
   - play-offs: the last game of the `regular` and `play-in` rounds;
   - Final Four: the last game of the `play-offs` rounds;
   - the final place: the last game of the `final` rounds, else of the `final-four` rounds.
   A line whose stage has no game yet counts from the season's last game. A survival row counts from the game its team played in its round; a row whose team has no game in its round is an impossible state and throws. **(owner to confirm: see the report's open question.)**
3. **The history ranks as sportbet's does:** players equal on the cumulative total and on the cumulative match points share a rank (Ranking::competition). Its entries are the tournament's scored games by tip-off then id; a player appears from the first scored game.
4. **`/main` is not a guarded return page.** sportbet's MainController sends a guest to the hub (MC:88), not to sign in, so `/main` sends a guest to `/` and `GUARDED_PAGES` does not grow. A signed-in player in no tournament also goes to `/` (MC:29-31).
5. **The tiles' "taškai" is the full total** to one decimal (sportbet's snapshot adds all four parts); the rank is the league table's (`rankPlayers('league-table')`). A player who is not listed (switched off or hidden) sees no tiles and no own row, as sportbet's roster drops them.
6. **The deck and "Visos rungtynės" read the predictions page's lines** for the current round (`loadPredictionsPage` with the current round's id), then the domain's `fixtureDeck` picks the deck's cards (sportbet's first three Vilnius dates, finished games of earlier days dropped). The rows render with slice 6's `PredictionEditor`, so the save, the odds panel (R-61) and the refusal texts (R-59) are the predictions page's (R-74). A single click on a row opens its boxes.
7. **`/leaderboard` across every tournament:** each tournament's stored totals under the rule set (`loadTournamentTotals`), summed per player over the tournaments where the player is listed; a player with at least one match points row. Under `sportbetRules` the rank is match + serija (PlayerTotals::allTime); under `ruledRules` the full total (R-18). **Flagged:** sportbet's "active" is one account-wide switch; here a player switched off in one tournament still counts the others (R-7 is per tournament). The lead reports it.
8. **Names stay plain text** (compare is slice 11) and **no fee panel and no league messages** are drawn (slices 13-14), as sportbet draws for a league with no fee and no message.
9. **The parity run counts production's guest and private-league members** (numbers only, a `map.ts` notice), and compares sportbet's `/leaderboard` ranks with the domain's `lyderiai` ranking under `sportbetRules`, through the old app's existing tinker script.
10. **The E2E rides in `predictions.spec.ts`'s existing sign-in** (three sign-in codes per ten minutes for the seeded account; no new registration; one Playwright worker).

---

## Part 8a (with 8d): the game page and the league table

### Task 0 (lead): The gate

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-07-dashboard-and-leaderboard-design.md
git rev-parse --short HEAD
```

Expected: `0`; `cdbf66c docs: slice 8 spec - the game page, league table and leaderboard; R-71 to R-75 (#22)`; the gate's commit (this plan, on top of `cdbf66c`). Note it; Tasks 7, 10, 13 and 15 review from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
for s in unit component db feature migrate; do echo "== $s"; pnpm test:$s 2>&1 | grep -E "Test Files|Tests "; done
```

Expected: `Done`, `3`, every suite passing. Note each count.

---

### Task 1 (backend-dev): Export the hub's two loaders for reuse

**Files:**
- Modify: `packages/db/src/hub/repository.ts` (`usernamesOf` 200-216, `loadFinalPlaces` 228-251)
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Rename and export.** `usernamesOf` becomes `export async function loadUsernames(db: Executor, ids: readonly PlayerId[]): Promise<Map<PlayerId, string>>` and `loadFinalPlaces` is exported as it is. Every call site in `hub/repository.ts` uses the new name. Add both to `packages/db/src/index.ts`'s exports beside `loadHub`.
- [ ] **Step 2: Verify.** `pnpm --filter @sportbet/db exec vitest run test/hub.test.ts` passes unchanged; `pnpm typecheck` clean.
- [ ] **Step 3: Hand to the lead.** Commit message: `refactor(db): the hub's username and final-place loaders exported for the league tables (#22)`.

---

### Task 2 (backend-dev): When each stored row counts in the history (R-17, R-72)

**Files:**
- Create: `packages/domain/src/dashboard/earned-points.ts`, `earned-points.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test** (`earned-points.test.ts`). Build a season with `makeGame`/`makeSeason` from `@sportbet/domain/testing` (the helpers slice 7's tests use; read `src/testing.ts` for their exact names and options): round 38 (stage `regular`) with games A (tip-off day 1) and B (day 2), round 39 (`play-in`) with C (day 3), round 40 (`play-offs`) with D (day 4), round 41 (`final-four`) with E (day 5), round 42 (`final`) with F (day 6); team T plays A and D. Then assert:

```ts
import { describe, expect, it } from 'vitest';
import { earnedPointsOf } from './earned-points';
// season, games A-F, T, player P built as above

describe('earnedPointsOf (R-17, R-72)', () => {
  it('a match row counts its full points and its serija at its own game', () => {
    const earned = earnedPointsOf(season, {
      matches: [matchRow(P, A, 1234, 200)],
      standings: [],
      survival: [],
    });
    expect(earned).toEqual([
      { player: P, kind: 'match', points: sp(123_400), atGame: A },
      { player: P, kind: 'serija', points: sp(20_000), atGame: A },
    ]);
  });

  it('a table place counts from round 38s last game; each tick from its stages last game', () => {
    const earned = earnedPointsOf(season, {
      matches: [],
      standings: [standingsRow(P, T, { place: 1_900_000, playOffs: 500_000, finalFour: 700_000, final: 900_000 })],
      survival: [],
    });
    expect(earned.map(({ atGame }) => atGame)).toEqual([B, C, D, F]);
  });

  it('a line not yet decided (null) earns nothing', () => {
    expect(
      earnedPointsOf(season, {
        matches: [],
        standings: [standingsRow(P, T, { place: null, playOffs: null, finalFour: null, final: null })],
        survival: [],
      }),
    ).toEqual([]);
  });

  it("a tick whose stage has no game yet counts from the season's last game", () => {
    const regularOnly = seasonOf([A, B]);
    expect(
      earnedPointsOf(regularOnly, {
        matches: [],
        standings: [standingsRow(P, T, { place: null, playOffs: 500_000, finalFour: null, final: null })],
        survival: [],
      }).map(({ atGame }) => atGame),
    ).toEqual([B]);
  });

  it('a survival row counts from the game its team played in its round', () => {
    expect(
      earnedPointsOf(season, {
        matches: [],
        standings: [],
        survival: [survivalRow(P, 40, T, 300)],
      }),
    ).toEqual([{ player: P, kind: 'survival', points: sp(30_000), atGame: D }]);
  });

  it('a pending survival row (no points) earns nothing; a pick without a game throws', () => {
    expect(
      earnedPointsOf(season, { matches: [], standings: [], survival: [survivalRow(P, 40, T, null)] }),
    ).toEqual([]);
    expect(() =>
      earnedPointsOf(season, { matches: [], standings: [], survival: [survivalRow(P, 39, T, 300)] }),
    ).toThrow('survival');
  });
});
```

where `sp(n)` is `standingsPointsOfTenThousandths(n)`, `matchRow(player, game, fullHundredths, serijaHundredths)` builds a `StoredMatchRow` with `winner`, `margin`, `bingo` at 0 and `odds` as the golden scenario's tests build one, `standingsRow` a `StandingsRow` whose lines are `{ points: n === null ? null : sp(n), odds: null }`, and `survivalRow(player, round, team, hundredths)` a `SurvivalPoints` (`provisional: false`, `storedId: null`).

- [ ] **Step 2: Run it:** `pnpm --filter @sportbet/domain exec vitest run src/dashboard/earned-points.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** (`earned-points.ts`):

```ts
import type { PointsRows } from '../recalculation/recalculation';
import type { EarnedPoints } from '../ranking/rank-history';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import { LAST_REGULAR_SEASON_ROUND, type Stage } from '../round/stage';
import {
  standingsPointsOfTenThousandths,
  type StandingsPoints,
} from '../points/standings-points';
import type { Points } from '../points/points';

/** Hundredths as ten-thousandths, so every kind adds exactly. */
const asStandings = (points: Points): StandingsPoints =>
  standingsPointsOfTenThousandths(points.hundredths * 100);

/**
 * The game each stored points row counts from in the rank history
 * (RA-5; R-17 under ruledRules, R-72): a match row at its game; a survival
 * row at the game its team played in its round; a standings row's place at
 * round 38's last game, and each tick at the last game of the stage that
 * decides it (play-offs: the regular season and the play-in; Final Four:
 * the play-offs; the final place: the final, else the Final Four). A line
 * whose stage has no game yet counts from the season's last game (the
 * plan's design decision 2). Under sportbetRules totalsAfterEachGame
 * spreads standings and survival back to the first game whatever atGame is.
 */
export function earnedPointsOf(
  season: Season,
  rows: Pick<PointsRows, 'matches' | 'standings' | 'survival'>,
): readonly EarnedPoints[] {
  const ordered = [...season.games].sort(
    (a, b) => a.tipOff - b.tipOff || a.id - b.id,
  );
  const last = ordered.at(-1);
  const stageOf = (game: Game): Stage | undefined =>
    season.round(game.round)?.stage;
  const lastOf = (picks: (game: Game) => boolean): Game | undefined =>
    ordered.filter(picks).at(-1) ?? last;
  const placeAt = lastOf((game) => game.round === LAST_REGULAR_SEASON_ROUND);
  const playOffsAt = lastOf((game) => {
    const stage = stageOf(game);
    return stage === 'regular' || stage === 'play-in';
  });
  const finalFourAt = lastOf((game) => stageOf(game) === 'play-offs');
  const finalAt =
    ordered.filter((game) => stageOf(game) === 'final').at(-1) ??
    lastOf((game) => stageOf(game) === 'final-four');

  const earned: EarnedPoints[] = [];
  for (const row of rows.matches) {
    earned.push(
      { player: row.player, kind: 'match', points: asStandings(row.points.full), atGame: row.game },
      { player: row.player, kind: 'serija', points: asStandings(row.serija), atGame: row.game },
    );
  }
  for (const row of rows.standings) {
    const lines = [
      [row.place, placeAt],
      [row.playOffs, playOffsAt],
      [row.finalFour, finalFourAt],
      [row.final, finalAt],
    ] as const;
    for (const [line, at] of lines) {
      if (line.points === null) continue;
      if (at === undefined) {
        throw new Error('earnedPointsOf: a standings line in a season with no game');
      }
      earned.push({ player: row.player, kind: 'standings', points: line.points, atGame: at.id });
    }
  }
  for (const row of rows.survival) {
    if (row.points === null) continue;
    const game = ordered.find(
      (candidate) =>
        candidate.round === row.round &&
        (candidate.home === row.team || candidate.away === row.team),
    );
    if (game === undefined) {
      throw new Error('earnedPointsOf: a survival pick has no game in its round');
    }
    earned.push({ player: row.player, kind: 'survival', points: asStandings(row.points), atGame: game.id });
  }
  return Object.freeze(earned);
}
```

Export `earnedPointsOf` from `packages/domain/src/index.ts`. If `standingsPointsOfTenThousandths` is not exported from the package index, import it inside the domain only (it is).

- [ ] **Step 4: Run it.** Expected: PASS (6). Then `pnpm test:unit` (baseline + 6).
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(domain): the game each stored points row counts from in the rank history - a stage's last game for a standings tick, a pick's game for survival (R-17, R-72) (#22)`.

---

### Task 3 (backend-dev): The league table's history, the tiles, the progress line, the feed

**Files:**
- Create: `packages/domain/src/dashboard/league-history.ts` (+ test), `packages/domain/src/dashboard/dashboard.ts` (+ test)
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing tests.**

`league-history.test.ts` (the golden scenario: `GOLDEN_*` from `src/golden/golden-scenario.ts`, three games h1-h3, players ADA, BEN, CAI):
- `leagueHistory` returns, for each listed player, one entry per scored game (by tip-off then id) with the cumulative total to the cent and the rank; players equal on total and on match points share a rank (1, 2, 2); a player not listed has no history and does not take a rank.
- Under `sportbetRules` a standings row counts from the first game (`totalsAfterEachGame`'s spread); under `ruledRules` from its `earnedPointsOf` game (R-17).
- `rankChange([5, 4, 4, 3, 2, 2, 1], 1)` is `4 - 1 = 3` (sportbet's `history[max(0, n - 6)] - rank`); with fewer than 2 entries it is `null`.

`dashboard.test.ts`:
- `roundProgress` gives the current round's name, scored and total games, and the games of the Vilnius day of `now` not yet scored ("N šiandien"); `null` with no current round.
- `statTiles`: `bingo` counts the player's match rows with bingo points other than 0 (PointResultController:333) in the tournament; `serija` counts the player's scored games of the tournament, newest first (tip-off then id, descending), while each is a real prediction (not a fill-in nor a late fill-in) with winner points above 0 (SerijaCorrectness; Euroleague has no level result) - R-71: other tournaments never count.
- `activityFeed`: the bingos (bingo points above 0, ActivityFeedController:66) of the last three distinct scored games, newest first, usernames in the tie order; then up to 5 runs whose serija bonus on the player's last scored game of the tournament is at least 2 x 10 x the round's rate, longest first, each `length = round(bonus / (rate x 10)) + 1` (StreakService::length); only listed players.

- [ ] **Step 2: Run them:** FAIL, modules not found.
- [ ] **Step 3: Implement** `league-history.ts`:

```ts
import { rankPlayers, type PlayerTotals } from '../ranking/league-table';
import { totalsAfterEachGame, type EarnedPoints } from '../ranking/rank-history';
import type { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import type { GameId, PlayerId } from '../shared/ids';
import { unwrap } from '../shared/result';

export interface HistoryEntry {
  readonly game: GameId;
  /** The player's cumulative total after this game, to the cent. */
  readonly totalCents: number;
  readonly rank: number;
}

/**
 * PointController::getAllUsersGameHistory: each listed player's rank after
 * every scored game of the tournament (by tip-off then id), by the
 * cumulative total (totalsAfterEachGame: RA-5, R-17), players equal on it
 * and on the cumulative match points sharing a rank (Ranking::competition).
 */
export function leagueHistory(input: {
  readonly season: Season;
  readonly earned: readonly EarnedPoints[];
  readonly listed: ReadonlySet<PlayerId>;
  readonly rules: RuleSet;
}): ReadonlyMap<PlayerId, readonly HistoryEntry[]> {
  const games = [...input.season.games]
    .filter((game) => game.result !== null)
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id)
    .map((game) => game.id);
  const earned = input.earned.filter(({ player }) => input.listed.has(player));
  const totals = unwrap(totalsAfterEachGame(games, earned, input.rules));
  const matches = unwrap(
    totalsAfterEachGame(games, earned.filter(({ kind }) => kind === 'match'), input.rules),
  );
  const history = new Map<PlayerId, HistoryEntry[]>();
  for (const [index, after] of totals.entries()) {
    const matchAfter = matches[index]?.cents ?? {};
    const standing = Object.entries(after.cents).flatMap(([player, cents]) =>
      cents === undefined ? [] : [{ player, cents, match: matchAfter[player] ?? 0 }],
    );
    standing.sort((a, b) => b.cents - a.cents || b.match - a.match);
    let rank = 0;
    for (const [position, row] of standing.entries()) {
      const before = standing[position - 1];
      rank = before !== undefined && before.cents === row.cents && before.match === row.match ? rank : position + 1;
      const player = row.player as PlayerId; // see note below
      const entries = history.get(player) ?? [];
      entries.push(Object.freeze({ game: after.game, totalCents: row.cents, rank }));
      history.set(player, entries);
    }
  }
  return history;
}

/** Ranking::change: the rank five history entries back minus the rank now; null under two entries. */
export function rankChange(ranks: readonly number[], rank: number): number | null {
  if (ranks.length < 2) return null;
  const back = ranks[Math.max(0, ranks.length - 6)];
  return back === undefined ? null : back - rank;
}
```

**Note:** `Object.entries` loses the `PlayerId` brand, and `as` is not allowed. Iterate the listed players instead: `for (const player of input.listed) { const cents = after.cents[player]; if (cents === undefined) continue; ... }` - write it that way; the snippet's `as` is not to be committed. `unwrap` is the domain's existing helper (`shared/result.ts`; if it is named differently, use that name); a refusal here ('points-at-unlisted-game') is an impossible state, since every earned row names a game of the season.

`dashboard.ts`:

```ts
import { SERIJA_STEP } from '../serija/serija';
import type { MatchPrediction } from '../prediction/match-prediction';
import type { StoredMatchRow } from '../recalculation/recalculation';
import type { Season } from '../round/season';
import type { RoundNumber, PlayerId, GameId } from '../shared/ids';
import type { Instant } from '../shared/instant';

export interface RoundProgress {
  readonly round: RoundNumber;
  readonly scored: number;
  readonly total: number;
  /** Games of the Vilnius day of `now` not yet scored ("N šiandien"). */
  readonly today: number;
}

/** MainController::getTournamentProgress. `vilniusDay` maps an instant to its Vilnius calendar day (YYYY-MM-DD); web passes vilniusDate. */
export function roundProgress(input: {
  readonly season: Season;
  readonly current: RoundNumber | null;
  readonly now: Instant;
  readonly vilniusDay: (instant: Instant) => string;
}): RoundProgress | null {
  const { season, current, now, vilniusDay } = input;
  if (current === null) return null;
  const games = season.games.filter((game) => game.round === current);
  const today = vilniusDay(now);
  return Object.freeze({
    round: current,
    scored: games.filter((game) => game.result !== null).length,
    total: games.length,
    today: games.filter((game) => game.result === null && vilniusDay(game.tipOff) === today).length,
  });
}

export interface StatTiles {
  readonly bingo: number;
  readonly serija: number;
}

/** MainController::getSnapshotData's bingo and streak, within the tournament (R-71). */
export function statTiles(input: {
  readonly season: Season;
  readonly rows: readonly StoredMatchRow[];
  readonly predictions: readonly MatchPrediction[];
}): StatTiles {
  const origin = new Map(input.predictions.map((p) => [p.game, p.origin]));
  const tipOff = new Map(input.season.games.map((game) => [game.id, game]));
  const newestFirst = [...input.rows].sort((a, b) => {
    const left = tipOff.get(a.game);
    const right = tipOff.get(b.game);
    if (left === undefined || right === undefined) {
      throw new Error('statTiles: a points row of a game not in the season');
    }
    return right.tipOff - left.tipOff || right.id - left.id;
  });
  let serija = 0;
  for (const row of newestFirst) {
    if (origin.get(row.game) !== 'real' || row.points.winner.hundredths <= 0) break;
    serija++;
  }
  return Object.freeze({
    bingo: input.rows.filter((row) => row.points.bingo.hundredths !== 0).length,
    serija,
  });
}
```

`activityFeed` (same file) takes `{ season, rows (the tournament's match rows), listed (Set), usernames (Map), teamName (TeamId => string), tieOrder ((a, b) => number) }` and returns `{ bingos: { game: GameId; line: string; players: string }[]; runs: { username: string; length: number }[] }`, where `line` is `${home} ${result.home}-${result.away} ${away}` and `players` the usernames joined with `', '`. Implement it from ActivityFeedController 37-160 as written in Step 1; the round's rate is `season.round(game.round)?.rate.value`.

`fixtureDeck` is Task 8's.

Export `leagueHistory`, `rankChange`, `HistoryEntry`, `roundProgress`, `RoundProgress`, `statTiles`, `StatTiles`, `activityFeed` from the index.

- [ ] **Step 4: Run them.** PASS; `pnpm test:unit`.
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(domain): the league table's history and five-game change (getAllUsersGameHistory, Ranking::change), the progress line, the tiles within the tournament (R-71), the activity feed (#22)`.

---

### Task 4 (backend-dev): The league table's and the game page's data

**Files:**
- Create: `packages/db/src/dashboard/league-table.ts`, `packages/db/src/dashboard/dashboard.ts`, `packages/db/test/league-table.test.ts`, `packages/db/test/dashboard.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing db tests** on the golden scenario (the save-and-recalculate setup `golden.test.ts` uses, through `recalculateLocked`):
  - `loadLeagueTable(db, tournament, rules)` lists the listed players in `rankPlayers('league-table')` order with each row's parts (match, serija, standings, survival, bingo count), its stage parts (place, play-offs, Final Four, final, summed over the player's standings rows), and its history (`leagueHistory`); a switched-off player is absent (R-7); under `sportbetRules` and `ruledRules` the ranks equal the golden expectations.
  - `loadDashboard(db, { player, tournament, now, rules })` gives the table, the player's own row and rank, `rankChange`, the tiles, the progress line, the medals (`tallyMedals` of the listed players' final places, `null` before the first tip-off), the feed; for a player not listed: no own row and no tiles.
- [ ] **Step 2: Run them:** FAIL.
- [ ] **Step 3: Implement.** `league-table.ts`:

```ts
import {
  earnedPointsOf,
  leagueHistory,
  rankPlayers,
  type HistoryEntry,
  type PlayerId,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { keyOfTournament } from '../edge';
import { loadUsernames } from '../hub/repository';
import { loadPlayerStatuses } from '../player/repository';
import { loadTournamentPoints } from '../points/repository';
import { loadTournamentTotals } from '../points/totals';
import { loadSeason } from '../season/repository';

export interface LeagueTableRow {
  readonly player: PlayerId;
  readonly username: string;
  readonly rank: number;
  readonly totalCents: number;
  readonly matchCents: number;
  readonly serijaCents: number;
  readonly standingsCents: number;
  readonly survivalCents: number;
  readonly bingo: number;
  /** The standings popover: each stage's sum, to the cent; a stage nobody reached is absent. */
  readonly stages: Readonly<Partial<Record<'place' | 'playOffs' | 'finalFour' | 'final', number>>>;
  readonly history: readonly HistoryEntry[];
}

export interface LeagueTable {
  readonly rows: readonly LeagueTableRow[];
  /** Whether the tournament plays survival (the column is drawn only then). */
  readonly survival: boolean;
}

/**
 * PointController::getAllUserPoints and getAllUsersGameHistory over the
 * tournament's listed players (R-73): their stored totals under the rule
 * set (loadTournamentTotals), ranked (rankPlayers, 'league-table'), each
 * with its parts, its stage sums and its history (leagueHistory).
 */
export async function loadLeagueTable(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<LeagueTable> {
  const season = await loadSeason(db, tournament);
  const rows = await loadTournamentPoints(db, tournament, rules.name);
  const { totals } = await loadTournamentTotals(db, tournament, rules);
  const statuses = await loadPlayerStatuses(db, tournament, rules);
  const key = keyOfTournament(tournament);
  const listed = new Set(
    [...statuses].flatMap(([player, status]) => (status.isListedIn(key, rules) ? [player] : [])),
  );
  const usernames = await loadUsernames(db, [...listed]);
  const nameOf = (player: PlayerId): string => {
    const name = usernames.get(player);
    if (name === undefined) throw new Error('loadLeagueTable: a listed player has no username');
    return name;
  };
  const ranked = rankPlayers(
    totals.map((total) => ({ ...total, username: listed.has(total.player) ? nameOf(total.player) : '', listed: listed.has(total.player) })),
    'league-table',
    rules,
  );
  const history = leagueHistory({ season, earned: earnedPointsOf(season, rows), listed, rules });
  const byPlayer = new Map(totals.map((total) => [total.player, total]));
  return {
    survival: season.rounds.some((round) => round.survival),
    rows: ranked.map((row) => {
      const total = byPlayer.get(row.player);
      if (total === undefined) throw new Error('loadLeagueTable: a ranked player without totals');
      const mine = rows.standings.filter(({ player }) => player === row.player);
      const stage = (pick: (line: (typeof mine)[number]) => { points: { toCents(): number } | null }) => {
        const lines = mine.map(pick).flatMap(({ points }) => (points === null ? [] : [points.toCents()]));
        return lines.length === 0 ? undefined : lines.reduce((sum, cents) => sum + cents, 0);
      };
      const stages = Object.fromEntries(
        (
          [
            ['place', stage((line) => line.place)],
            ['playOffs', stage((line) => line.playOffs)],
            ['finalFour', stage((line) => line.finalFour)],
            ['final', stage((line) => line.final)],
          ] as const
        ).filter(([, cents]) => cents !== undefined),
      );
      return {
        player: row.player,
        username: row.username,
        rank: row.rank,
        totalCents: row.totalCents,
        matchCents: total.match.hundredths,
        serijaCents: total.serija.hundredths,
        standingsCents: total.standings.toCents(),
        survivalCents: total.survival.hundredths,
        bingo: rows.matches.filter(({ player, points }) => player === row.player && points.bingo.hundredths !== 0).length,
        stages,
        history: history.get(row.player) ?? [],
      };
    }),
  };
}
```

Sum the stage lines in ten-thousandths and round once (`StandingsPoints.plus`, then `toCents()`), not cent by cent, so the popover adds to the cell exactly; the snippet's per-line rounding is to be replaced that way. `Object.fromEntries` returns `{ [k: string]: number }`, which does not satisfy the `Partial<Record<...>>` type without `as`: build `stages` with four explicit optional properties instead. Fix both before handing back; the test pins the sums.

`dashboard.ts` (`loadDashboard`) composes: `loadLeagueTable`; the player's row; `rankChange(row.history.map(({ rank }) => rank), row.rank)`; `statTiles` over the player's rows of `loadTournamentPoints` and `loadPlayerPredictions`; `roundProgress` with `season.currentRound(now, rules)` and a `vilniusDay` the caller passes (the domain takes no time zone); the medals (`tallyMedals((await loadFinalPlaces(db, tournament)).filter(({ player }) => listed.has(player)))`, `null` while `season.firstTipOff()` is after `now` or null); `activityFeed`. Its input is `{ player: PlayerId; tournament: Tournament; now: Instant; rules: RuleSet; vilniusDay: (instant: Instant) => string }`. Export `loadLeagueTable`, `LeagueTable`, `LeagueTableRow`, `loadDashboard`, `Dashboard`.

- [ ] **Step 4: Run them.** PASS; `pnpm test:db`.
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(db): the league table (getAllUserPoints) and the game page's data - the listed players ranked, their parts, stages and histories, the tiles, progress, medals and feed (R-73) (#22)`.

---

### Task 5 (web-dev): The game page's components

**Files:**
- Create: `apps/web/src/components/dashboard/{progress-line,stat-tiles,league-table,trend,activity-feed,dashboard-view}.tsx`, each with a `.test.tsx`
- Modify: `apps/web/src/components/shell/icon.tsx` (+ `bullseye`, `lightning-fill`, `graph-up` if missing, from bootstrap-icons@1.11.1 as slice 6 did)

Each component follows its Blade file's markup and sportbet's CSS (custom.css classes named in the Reference) through existing tokens and `hub/styles.ts`. Tests first; each test asserts every text below.

- [ ] **Step 1: `ProgressLine`** (`main.blade.php` 15-26): the round's name, a bar `scored / total` wide, `"{scored} / {total}"`, `"{today} šiandien"`. Props: `{ name: string; scored: number; total: number; today: number }`.
- [ ] **Step 2: `StatTiles`** (`stat-tiles.blade.php`): "vieta" `#{rank}` with `↑N per 5 žaid.` / `↓N per 5 žaid.` when the change is non-zero; "taškai" one decimal (`numberFormat` from `@sportbet/domain`, as the hub's leaders use); "bingo" the count or "-"; "serija" the count or "-".
- [ ] **Step 3: `LeagueTable`** (`partials/points.blade.php`): title "Taškų lentelė"; headers "#", "Žaidėjas", then on md and up the sub-columns with sportbet's tooltips "Rezultatų spėjimo taškai", "Eigos spėjimo taškai", "Išlikimo taškai" (only when `survival`), "Sekos taškai" (`+X` or `-`), "Bingo taškai" (`★N` drawn with the `star-fill` icon), then "Taškai"; ranks 1-3 styled; the player's own row highlighted; the standings cell's popover lists each stage present, with Euroleague's names: "Reguliarus sezonas" (place), "Atkrintamosios" (play-offs), "Finalo ketvertas" (Final Four), "Finalas" (final). **Flagged:** sportbet prints football's stage names ("Grupių etapas", "Šešioliktfinalis"...) for Euroleague too; the lead asks the owner which to show, and the component takes the names from one map so the answer is one edit. Top 10, then "···" and the player's own row if below; "Rodyti visus (N)" / "Rodyti mažiau" (a client toggle). Names are plain text (slice 11). A row expands to `Trend`. Props: `{ table: LeagueTable; me: PlayerId | null }`.
- [ ] **Step 4: `Trend`** (`points.blade.php`'s history block): "Paskutinės 6 rungtynės", an SVG rank line over the last 6 entries, and a table "#", "+ Tšk", "Vieta" with `▲`/`▼` (drawn as `caret-up-fill` / `caret-down-fill` icons) against the previous entry.
- [ ] **Step 5: `ActivityFeed`** (`activity-feed.blade.php`): title "Aktyvumas" with the `lightning-fill` icon; a bingo item with the `bullseye` icon, the game line and the players; a run item with the `fire` icon, the username and " serija ×{length}". Nothing when both lists are empty.
- [ ] **Step 6: `DashboardView`**: the flash (`FlashAlert`), `ProgressLine`, `StatTiles`, the games (Task 9 fills these slots; render nothing for them yet), `LeagueTable`, the hub's `MedalsPanel` titled "Finalų dalyvių prognozės" (`standings.blade.php`), `ActivityFeed`, in `main.blade.php`'s order.
- [ ] **Step 7: Verify.** `pnpm test:component`; typecheck; lint.
- [ ] **Step 8: Hand to the lead.** Commit message: `feat(web): the game page's components - progress line, tiles, "Taškų lentelė" with its trend, "Aktyvumas" (#22)`.

---

### Task 6 (web-dev): `/main`, `PLAYER_HOME`, "Pradžia", the tournament page's table **(sensitive)**

**Files:**
- Create: `apps/web/src/app/main/page.tsx`, `apps/web/tests/feature/dashboard.test.ts`
- Modify: `apps/web/src/components/shell/shell-paths.ts`, `nav-entries.ts` (+ tests), the brand link in the shell (rail and phone header: find it with `grep -rn "brand" apps/web/src/components/shell`), `apps/web/src/components/tournament/tournament-page-view.tsx` (+ test), `apps/web/src/app/tournament/[slug]/page.tsx`.

- [ ] **Step 1: Write the failing feature tests** (`dashboard.test.ts`, the support helpers slice 6 uses: `savePlaying`, `jonasPlaying`, `signedInBrowser`):
  - a guest's `GET /main` answers 307 to `/`; a signed-in player in no tournament likewise;
  - a player's `/main` shows "Taškų lentelė", their rank tile, and the one-time message once ("Užsiregistravote į turnyrą: ..." after joining from the form: the slice 6 test "the 'registered' message shows at PLAYER_HOME" must pass with `PLAYER_HOME = '/main'`);
  - "Pradžia" in the rail links to `/main`; the brand link goes to `/main` for a player and `/` for a guest;
  - the tournament page shows the league table (no own row) and the medals panel.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.**
  - `shell-paths.ts`: `export const MAIN_PATH = '/main';` and `PLAYER_HOME = MAIN_PATH` (its comment: "/main since slice 8").
  - `nav-entries.ts`: a player entry `{ label: 'Pradžia', href: MAIN_PATH, icon: 'house-door-fill', audience: 'player', group: 'main', surfaces: ['rail', 'menu', 'tabs'] }` first in the list (sportbet's partials/rail.blade.php:25-28 and bottom-nav); check sportbet's icon name and surfaces in `partials/rail.blade.php`, `header.blade.php` and `bottom-nav.blade.php` and follow them.
  - `app/main/page.tsx`:

```tsx
import { loadDashboard } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { DashboardView } from '../../components/dashboard/dashboard-view';
import { vilniusDate } from '../../components/format/vilnius-time';
import { now } from '../../server/clock';
import { getDb } from '../../server/db';
import { readFlash } from '../../server/flash';
import { requestContext } from '../../server/request-context';

/** MainController::index: a guest, or a player in no tournament, goes to the hub (MC:29-31, 88). */
export default async function MainPage() {
  await connection();
  const context = await requestContext();
  if (context.player === null || context.tournament === null) redirect('/');
  const dashboard = await loadDashboard(getDb(), {
    player: context.player.id,
    tournament: context.tournament.tournament,
    now: now(),
    rules: ruledRules,
    vilniusDay: vilniusDate,
  });
  return <DashboardView dashboard={dashboard} flash={await readFlash()} me={context.player.id} />;
}
```

  (If `vilniusDate` takes a different argument type, adapt the call - the domain takes an `Instant` -> day string.)
  - The tournament page: `loadTournamentPage`'s caller also loads `loadLeagueTable(db, tournament, ruledRules)` and the medals for a non-finished tournament; `TournamentPageView` draws `LeagueTable` with `me: null` and the medals below the header card (show.blade.php). A page only loads and returns one component: add a `table` prop.
- [ ] **Step 4: Verify.** `pnpm build`, the feature suite, component suite, typecheck, lint.
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): /main - the game page as the player's home (PLAYER_HOME), "Pradžia" and the brand link, the one-time message; the tournament page's league table (R-73) (#22)`.

### Task 7 (lead): The end of 8a

- [ ] Run the whole check (Task 15 Step 1's commands), then the `architect` review of 8a (`mp-code-review` on the gate's commit..HEAD) and the security review of Task 6. Fix what they confirm, each fix its own commit.

---

## Part 8b: the games on the game page

### Task 8 (backend-dev): The deck's games

**Files:**
- Modify: `packages/domain/src/dashboard/dashboard.ts` (+ test), `packages/db/src/dashboard/dashboard.ts` (+ test), indexes

- [ ] **Step 1: Write the failing tests.** `fixtureDeck(lines, now, vilniusDay)` over the predictions page's lines of the current round (`PredictionLineKey`-shaped: game, tipOff, state): drops a scored game whose Vilnius day is before today's, keeps the first three distinct Vilnius days, in tip-off then id order (MC:45-67); each kept line says whether it shows "Spėti" (state `open`) or nothing (R-75: a locked or scored game shows no "Keisti"). The db test: `loadDashboard` gains `games: PredictionsPage | null` (the current round's lines through `loadPredictionsPage` with `requested` = the current round's id; null with no current round) and `deck: readonly GameId[]`.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** `fixtureDeck` generic over `T extends { game: GameId; tipOff: Instant; state: PredictionRowState }`, returning `readonly (T & { readonly predict: boolean })[]`; and in `loadDashboard` call `loadPredictionsPage(db, { player, tournament, requested: String(currentRoundId), now, rules })` - find the current round's id the way `loadPredictionsPage` resolves `requested` (its `predictionsRound`), so `/main` and `/prediction/results` show the same rows.
- [ ] **Step 4: Verify;** unit and db suites.
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(domain,db): the game page's games - the current round's lines and the deck's three days (MainController), no "Keisti" on a started game (R-75) (#22)`.

### Task 9 (web-dev): "Artimiausios rungtynės" and "Visos rungtynės" **(sensitive)**

**Files:**
- Create: `apps/web/src/components/dashboard/fixture-deck.tsx`, `games-list.tsx` (+ tests)
- Modify: `dashboard-view.tsx` (+ test), `tests/feature/dashboard.test.ts`

- [ ] **Step 1: Failing tests:**
  - `FixtureDeck` (`fixture-deck.blade.php`): title "Artimiausios rungtynės", link "Visi spėjimai" to `PREDICTIONS_PATH`; each card "MMM D · H:i" in Vilnius time (`vilnius-time.ts`), the crests (`TeamCrest`), the predicted scores (`?` for a blank side), "Rez h:a" on a scored game else "Tavo spėjimas", and "Spėti" only when `predict`; each card links to `PREDICTIONS_PATH`; arrows labelled "Ankstesnės rungtynės" / "Vėlesnės rungtynės".
  - `GamesList` (`partials/games.blade.php`'s list, R-74): title "Visos rungtynės"; each row shows "MMM D", the time, crests, result / prediction and its points with slice 6's `PointsBreakdown` popover, or before the result the odds panel; **a single click on a row opens its plain score boxes** - slice 6's `PredictionEditor` for that line - which autosave through `PREDICTION_SAVE_PATH` with the same marks and messages (R-59, R-61, R-62). No double-click handler, no modal, no "Išsaugoti" button.
  - Feature: a player's `/main` shows the deck and the list; a POST through the list's editor saves exactly as the predictions page does (one existing save test reused with the `/main` page's markup).
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement** both, building each row's `EditorRow` the way `predictions-view.tsx` does (reuse its mapping function; move it to a shared module if it is private, rather than copying it).
- [ ] **Step 4: Verify;** component and feature suites.
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): "Artimiausios rungtynės" and "Visos rungtynės" on the game page - a row's boxes open on one click and save as the predictions page does (R-74, R-75) (#22)`.

### Task 10 (lead): The end of 8b

- [ ] The whole check, the `architect` review of 8b, the security review of Task 9.

---

## Part 8c: the leaderboard

### Task 11 (backend-dev, then web-dev): `/leaderboard` and "Lyderiai" **(sensitive: a public page)**

**Files:**
- Create: `packages/domain/src/dashboard/leaderboard.ts` (+ test), `packages/db/src/dashboard/leaderboard.ts`, `packages/db/test/leaderboard.test.ts`; `apps/web/src/components/leaderboard/leaderboard-view.tsx` (+ test), `apps/web/src/app/leaderboard/page.tsx`, `apps/web/tests/feature/leaderboard.test.ts`
- Modify: `apps/web/src/components/hub/charity-card.tsx` (+ test), `nav-entries.ts`, `shell-view.ts`, `server/shell-for.ts` (+ tests), indexes

- [ ] **Step 1 (backend-dev): failing domain test.** `leaderboardRows({ tournaments: { totals, scored, listed, rows (match rows), predictions }[], usernames, rules })`:
  - a player counts with at least one match points row in a tournament where they are listed (decision 7);
  - their parts sum over those tournaments; ranked by `rankPlayers(..., 'lyderiai', rules)` (match + serija under `sportbetRules`, the full total under `ruledRules`, R-18; tie order R-30);
  - each row also counts "Tikslūs" (match rows with bingo points at least 50: Euroleague's bingo, MainController:166-203), "Nugalėtojai" (real predictions with winner points above 0) and "Žaidimai" (every match row, fill-ins included).
- [ ] **Step 2: failing db test.** `loadLeaderboard(db, rules)` over two tournaments of the golden scenario; `anyLeaderboardEntry(db, rules)` is false on an empty database and true once one match points row of the rule set exists (PlayerTotals::anyRecorded).
- [ ] **Step 3: Implement** both: `loadLeaderboard` lists every tournament (`listTournaments`), and for each `loadTournamentTotals`, `loadPlayerStatuses`, `loadTournamentPoints` and every listed player's predictions (one query per tournament: `votesOf`-style read of `match_predictions` by game for the origin), then `loadUsernames` once, then `leaderboardRows`. `anyLeaderboardEntry` is one `select 1 from match_points where source = $1 limit 1`.
- [ ] **Step 4: Hand to the lead** (backend part). Commit message: `feat(domain,db): the leaderboard (PlayerTotals::allTime) - every tournament, the full total under ruledRules (R-18), exact scores, winners and games (#22)`.
- [ ] **Step 5 (web-dev): failing tests.**
  - `LeaderboardView` (`leaderboard.blade.php`): the `trophy-fill` icon and "Lyderių lentelė"; the intro "Žaidžiame nuo 2016 metų - kiekvienas turnyras prideda naujų iššūkių ir intrigų." then "Prisijunk" (a link to `LEADERBOARD_PATH`, as sportbet's links to itself) and " ir išbandyk save."; columns "#" (ranks 1-3 with the hub's medal glyphs), "Žaidėjas", "Taškai" (one decimal), "Tikslūs" (sm and up), "Nugalėtojai", "Žaidimai" (md and up); the empty text "Kol kas nesužaista nė vienų rungtynių - lentelė pasipildys po pirmųjų rezultatų."; then the charity card in its leaderboard variant: "SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų žaidėjai savanoriškai aukoja Jaunimo linijai, teikiančiai psichologinę pagalbą jaunimui visoje Lietuvoje." (R-75 over sportbet's "futbolo") and "Sužinoti daugiau apie labdarą" (text until the charity page exists, as the hub's).
  - Nav: a guest entry `{ label: 'Lyderiai', href: LEADERBOARD_PATH, icon: 'trophy-fill', audience: 'guest', group: 'main', surfaces: ['rail', 'pills'], shownWhen: (view) => view.leaderboardOffered }` (check sportbet's `rail-guest.blade.php` and the guest pills for its place and icon); `ShellView.leaderboardOffered: boolean`, set by `shell-for.ts` from `anyLeaderboardEntry(getDb(), ruledRules)` for a guest only.
  - Feature: `/leaderboard` is public (200 for a guest), lists a scored player, shows the empty text on an empty database; the guest rail shows "Lyderiai" only once an entry exists.
- [ ] **Step 6: Implement** `export const LEADERBOARD_PATH = '/leaderboard';` in `shell-paths.ts` (sportbet's route), the page (`connection()`, `loadLeaderboard(getDb(), ruledRules)`, one component), the view, the nav entry and the flag.
- [ ] **Step 7: Verify;** all suites.
- [ ] **Step 8: Hand to the lead** (web part). Commit message: `feat(web): /leaderboard - "Lyderių lentelė" with sportbet's columns and texts, its charity card in "krepšinio" (R-75); "Lyderiai" for guests once it has entries (#22)`.

---

## The parity run's new checks

### Task 12 (backend-dev): Guests, private leagues and the leaderboard in the reader **(sensitive)**

**Files:**
- Modify: `tools/migrate/src/read-columns.ts` (`leagues` 99-102, `league_members` 103-106), `tools/migrate/src/map.ts`, `tools/migrate/src/sportbet-app.ts` (`OLD_APP_SCRIPT` 51-62, `parseOldAppOutput`), `tools/migrate/src/parity/rankings.ts`, `tools/migrate/src/parity/report.ts`
- Test: `tools/migrate/src/read-columns.test.ts`, `tools/migrate/test/map.test.ts`, `tools/migrate/src/sportbet-app.test.ts`, `tools/migrate/src/parity/rankings.test.ts`, `tools/migrate/src/parity/report.test.ts`

- [ ] **Step 1: Failing tests.**
  - `read-columns`: `leagues` gains `is_public: whole('tinyint(1)')`, `league_members` gains `is_guest: whole('tinyint(1)')` (sportbet's 2026_06_10_200000 and 200001 migrations; check the column types in the synthetic dump's DDL and follow them).
  - `map.test.ts`: on the synthetic dump unchanged, one notice `leagues: N private leagues with M members; K guest memberships (R-73)` with the dump's numbers; with one league set `is_public = 0` and one membership `is_guest = 1` (the existing `changed(...)` helper), the counts move by one. Numbers only: no id, no username.
  - `sportbet-app.test.ts`: `OLD_APP_SCRIPT` ends by printing `PARITY-LEADERBOARD ` and a JSON list of `{ user, rank, total }`; `parseOldAppOutput` returns `{ ranks, leaderboard }` and refuses a leaderboard line that is not JSON or does not parse, as it refuses the rankings line.
  - `rankings.test.ts`: `compareLeaderboard({ totals per tournament, statuses, usernames, oldApp })` ranks the new code's sportbet totals (`rankPlayers(..., 'lyderiai', sportbetRules)` over the players with a match row, summed across the loaded tournaments) against sportbet's, returning the players counted and the differences, as `LeagueRanking` does for a league.
  - `report.test.ts`: the report prints `leaderboard: N players, K differ` after the league rankings.
- [ ] **Step 2: Run:** FAIL.
- [ ] **Step 3: Implement.** The script lines to append, before the final echo of the rankings (keep the rankings line as it is):

```
'$board = [];',
"foreach (App\\Support\\PlayerTotals::ranked(App\\Support\\PlayerTotals::allTime()->addSelect('u.id as user_id')->get()) as $row) {",
"    $board[] = ['user' => (int) $row->user_id, 'rank' => (int) $row->rank, 'total' => number_format((float) $row->exact_total, 2, '.', '')];",
'}',
'echo \'PARITY-LEADERBOARD \', json_encode($board), "\\n";',
```

  (PlayerTotals::allTime selects `u.username` and groups by `u.id`, so `addSelect('u.id as user_id')` is valid; `ranked()` stamps `rank`; the line prints ids, ranks and totals only.) The map's notice counts from the read rows: leagues with `is_public = 0`, the memberships of those leagues, and memberships with `is_guest` above 0.
- [ ] **Step 4: Verify.** `pnpm test:migrate`; no `sportbet-migrate` containers left (`docker ps -a --filter label=sportbet-migrate`).
- [ ] **Step 5: Hand to the lead.** Commit message: `feat(migrate): the parity run compares sportbet's /leaderboard ranks and counts production's guest and private-league members, numbers only (R-73) (#22)`.

### Task 13 (lead): The end of 8c

- [ ] The whole check, the `architect` review of 8c and Task 12, the security review of Tasks 11 and 12.

---

## Finishing

### Task 14 (qa): The game page and the leaderboard in a browser, at 1280 and 390

**Files:** Modify: `apps/web/e2e/predictions.spec.ts`.

- [ ] **Step 1:** Inside the existing sign-in (no new registration, no new code): after sign-in the page is `/main` (`toHaveURL('/main')`), it shows "Taškų lentelė", the tiles and "Artimiausios rungtynės"; a click on a "Visos rungtynės" row opens its boxes; typing a score saves (the green mark) and the predictions list shows it; at 390 `/main` does not scroll sideways. As a guest at the end (after sign-out): `/leaderboard` shows "Lyderių lentelė"; the guest rail shows "Lyderiai" when the seed has a scored game. Any step that expected `/` after sign-in now expects `/main`.
- [ ] **Step 2:** Build from `git archive HEAD`, run the full suite on a fresh stack (`infra/ci/e2e-stack.sh up`, `SPORTBET_ENV` is set by `infra/compose/e2e.yml`), take it down.
- [ ] **Step 3: Hand to the lead.** Commit message: `test(e2e): /main after sign-in with its table, tiles and games, a save from the games list, /leaderboard for a guest, at 1280 and 390 (#22)`.

### Task 15 (lead): Records, verify, review, push

- [ ] **Step 1: The whole check**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint >/dev/null 2>&1; echo lint=$?
pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
for s in unit component db feature migrate; do echo "== $s"; pnpm test:$s 2>&1 | grep -E "Test Files|Tests "; done
git status --short | wc -l
```

- [ ] **Step 2: `CLAUDE.md`.** After the roles bullet, add: "The game page (`/main`) and the tournament page's table read `loadLeagueTable` (`packages/db/src/dashboard/`): the tournament's listed players (R-73 until leagues), ranked by `rankPlayers`, each with its history (`leagueHistory`), every stored row placed at the game it counts from by `earnedPointsOf` (R-17, R-72). `/leaderboard` reads `loadLeaderboard`. `PLAYER_HOME` is `/main`."
- [ ] **Step 3: Review.** `mp-code-review` on the gate's commit..HEAD; `improve-codebase-architecture` on `packages/domain/src/dashboard/`, `packages/db/src/dashboard/`, `apps/web/src/components/dashboard/` and `leaderboard/`; present the candidates to the owner and act only on those chosen.
- [ ] **Step 4: Push and watch CI**

```bash
git push origin main
sleep 15
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

### Task 16 (lead, on the owner's PC): Parity

- [ ] The reader with `--parity --sportbet-tag 3eb95e7`, its output kept in a local file, read back by summary lines only (as #20 and #21 did), then the file deleted. Expected: `PARITY HOLDS`; the league rankings and `leaderboard: N players, 0 differ`; the `leagues:` notice's three numbers. Post the verdict, the counts and the three numbers on #22.

### Task 17 (the owner, with the lead): Staging

- [ ] **Step 1 (one instruction):** sign in on staging; you should land on `/main` with "Taškų lentelė", your tiles, "Artimiausios rungtynės" and "Visos rungtynės"; click a game in "Visos rungtynės", type a score, and it saves. Tell me "works" or what happened.
- [ ] **Step 2 (after "works"):** sign out; open `/leaderboard`: "Lyderių lentelė" with the players; the rail shows "Lyderiai". Tell me "works" or what happened.
- [ ] **Step 3:** close #22 with the answers and the parity numbers.

---

## Self-review against the spec

| Spec | Task |
|---|---|
| `PLAYER_HOME` `/main`; guest or no tournament to `/`; "Pradžia" and the brand link; the one-time message | 6 |
| Progress line; tiles ("↑N per 5 žaid.", full total, bingo, serija R-71) | 3, 4, 5 |
| "Taškų lentelė": R-18/R-30/R-31 ranking, sub-columns, stage popover, top 10 + own row, show-more, trend | 3, 4, 5 |
| "Finalų dalyvių prognozės"; "Aktyvumas" | 3, 4, 5 |
| No fee panel, no messages; names plain | 5 (decision 8) |
| Tournament page's table | 6 |
| 8b deck (R-75) and games list (R-74, R-59, R-61) | 8, 9 |
| 8c `/leaderboard` (R-18, R-75), "Lyderiai" for guests | 11 |
| 8d history under ruledRules (R-17, R-72) | 2, 3 |
| Parity: ranks, leaderboard, guest and private-league counts | 12, 16 |
| E2E at 390 and 1280 | 14 |

Type names used across tasks: `earnedPointsOf`, `leagueHistory`, `HistoryEntry`, `rankChange`, `roundProgress`, `statTiles`, `activityFeed`, `fixtureDeck`, `leaderboardRows` (domain); `loadLeagueTable`, `LeagueTable`, `LeagueTableRow`, `loadDashboard`, `Dashboard`, `loadLeaderboard`, `anyLeaderboardEntry`, `loadUsernames`, `loadFinalPlaces` (db); `MAIN_PATH`, `LEADERBOARD_PATH`, `ShellView.leaderboardOffered` (web).
