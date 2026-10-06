# Match-Result Predictions (Slice 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player predicts the scores of their tournament's games as in sportbet 3eb95e7.
- **6a:** `/prediction/results` lists their rows by round and Vilnius day, with a working "Visi etapai" (R-58), scored rows with their points, locked rows, and open rows with the odds panel. "Spėjimai" appears in the rail, the phone menu and the bottom tabs, with its badge for open games of the current round still unanswered.
- **6b:** the autosave posts each pair. The server checks it as sportbet does:
  - the fields first;
  - then that the row is the player's own (issue 254);
  - then the lock (LR-1, R-13, R-41).
  - A saved score switches the player back on in that tournament (R-7, R-19, R-57) and writes an audit row, which is erased with the account (R-25) and starts empty (R-60).
  - The answer carries the crowd odds, computed on read; a refusal shows its reason (R-59).
- **6c:** `/prediction/game/<id>`, the page the reminder mail links to, through sign-in and back for a guest.

**Architecture:**
- `packages/domain` decides:
  - `prediction/predictions-list.ts`: the page's round, row state and grouping, the odds panel and the badge count.
  - `prediction/prediction-form.ts`: the posted fields, in sportbet's validation order.
  - `prediction/predict-match.ts`: ownership, lock, entry, and what a save switches back on.
  - One new `RuleSet` field for R-57.
- `packages/db` reads the page (`prediction/page.ts`) and the single game, and saves a prediction in one transaction: the row, the player's status, the audit row (migration 0011), then the odds from the votes (`prediction/save.ts`).
- `apps/web` holds:
  - the pages;
  - one route handler, `POST /prediction/results/save`, answering sportbet's JSON shapes;
  - its use case (`server/predictions/save-prediction.ts`);
  - the autosave client.

**Tech Stack:**
- Next.js 16.3.6 (App Router, route handlers, `proxy.ts`), React 19.3.
- Drizzle ORM 0.45.3 and drizzle-kit 0.31.11 on Postgres 18.6, Zod 4.6.5.
- `Intl.DateTimeFormat` (Europe/Vilnius).
- Vitest 5, Testing Library, jsdom 30, Playwright 1.63.
- **No new dependency.**

**Spec:** `docs/superpowers/specs/2026-10-06-match-predictions-design.md` (approved by the owner).

**Rulings:** LR-1, R-2, R-6, R-7, R-10, R-13, R-15, R-19, R-25, R-40, R-41, R-45, R-50, R-51, R-57 to R-60 (`docs/owner-rulings.md`).

**Decisions:** 5, 10, 11, 13.

**Issue:** #20 (part of #1).

**Reference:** sportbet (`D:\Projects\sportbet`) at `3eb95e7`:
- `app/Http/Controllers/PredictionResultController.php` (list 34-145, save 151-225, single game 425-453)
- `app/Http/Requests/UpdatePredictionResultRequest.php`
- `app/Support/{GameLock,MissingPredictions,PointsFormat,PredictionSaveResponse,ScoreFormat}.php`
- `config/scores.php`
- `resources/views/prediction/{results,game-single}.blade.php`
- `resources/views/partials/{rail,bottom-nav}.blade.php`
- `public/css/custom.css` (`.pred-*`, `.upcoming-*`, `.usc-*`, `.upt-*`, `.sr-pop*`, `.sb-crest`)

---

## Conventions for every task

**Roles and commits**
- Work on `main` (trunk-based, `CLAUDE.md`).
- Each task names the teammate role that owns its folders (`docs/agent-team.md`):
  - `backend-dev` edits `packages/domain`, `packages/db` and `tools/migrate`.
  - `web-dev` edits `apps/web`, including its component and feature tests.
  - `qa` edits E2E, smoke and `playwright.config.ts` only.
  - The lead edits the records and is the only one who talks to the owner.
- There is no `devops` task. Migration 0011 reaches Neon through the existing deploy, and the staging seed runs on every deploy and in CI's E2E stack.
- Reviews:
  - `qa` reviews every task against #20's criteria and sportbet's behaviour.
  - `architect` reviews every task against `CLAUDE.md` and the spec.
  - `security-reviewer` reviews every task marked **(sensitive)**: the return path's new shapes (Task 5), the save (Tasks 8 and 9) and the single-game page's visibility (Tasks 11 and 12).
- **Only the lead commits**, once those reviews have passed the task.
- A teammate's last step is "hand to the lead": the files changed, the commands run and their results, and the commit message.
- Every commit message references `#20` and ends with the trailer lines the lead's session gives (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line).
- Do not push until Task 15. Tasks 6 and 10 end 6a and 6b with the whole check and a review pass; nothing is pushed in between.

**Running things**
- Shell snippets are Git Bash on Windows, run from `D:\Projects\sportbet_new`.
- The db, feature and reader suites need Docker running. The feature suite also needs a fresh `pnpm build`.
- Every verify step runs `pnpm format` first. The code below is written as Prettier leaves it, but a line Prettier rewraps is not a failure. `pnpm format:check` must pass after `pnpm format`.
- How to run one file:
  - Unit: `pnpm --filter @sportbet/domain exec vitest run <file>`
  - DB: `pnpm --filter @sportbet/db exec vitest run <file>`
  - Reader: `pnpm --filter @sportbet/migrate exec vitest run <file>`
  - Component and web unit: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts <file>`
  - Feature: `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts <file>`

**sportbet and texts**
- "sportbet" means the old app at `3eb95e7`. Read any of its files with `git -C /d/Projects/sportbet show 3eb95e7:<path>`.
- Every Lithuanian text below is sportbet's (the views above and `lang/lt.json`).
- No emoji is typed into any file, and no `\uXXXX` escape either: the Write and Edit tools turn a typed escape into the raw character.

**Code rules** (`CLAUDE.md`)
- `packages/domain` imports only `zod`, and takes time as a parameter.
- Web reaches the database only through `@sportbet/db`.
- Pages only load data (parse params, call a query) and return one component. Markup lives in components, which have component tests.
- Colours exist only as tokens (`bg-card`, `text-muted`, `border-ok`), never as a literal or a palette class.
- No `any`, no `as` other than `as const`, no `!`.
- A refusal is a `Result`; an impossible state throws.
- A skipped or focused test is a lint error.
- Every query result is parsed before it leaves `db`.
- A difference between sportbet and the rulings exists only as a `RuleSet` field, with a test under both sets, and a `RULINGS` entry in `tools/migrate/src/parity/rulings.ts`.
- Route handlers answer through `apps/web/src/server/request/route-responses.ts`. Every POST starts with `refuseCrossSite`.
- **Nothing personal in any log or output.** No address, username, name, surname or score is passed to `console.*` or put in an error message. A catch logs `errorKind(error)` only (`apps/web/src/server/error-kind.ts`).

## File map

```
packages/domain/src/prediction/
  match-scoring.ts        + winnerPointsAt (PointsFormat::winnerPointsAt)                       (+ test)
  predictions-list.ts     oddsPanel, predictionRowState, predictionsRound, groupPredictionLines,
                          missingResultPredictions                                               (+ test, new)
  prediction-form.ts      predictionFormEntry: the posted pair, in sportbet's validation order    (+ test, new)
  predict-match.ts        predictMatch, statusAfterSave                                          (+ test, new)
packages/domain/src/hub/number-format.ts        + onePlace                                       (+ test)
packages/domain/src/rules/rule-set.ts           + onlyAScoreSwitchesBackOn (PL-1, R-7, R-57)      (+ test)
packages/domain/src/index.ts                    the new exports

packages/db/src/prediction/page.ts              loadPredictionsPage, PredictionsPage, PredictionLine   (new)
packages/db/src/prediction/repository.ts        + loadPlayerPredictions, loadMissingResultPredictions
packages/db/src/prediction/schema.ts            + audit_prediction_games (R-25, R-60)
packages/db/migrations/0011_audit-prediction-games.sql   (generated, new)
packages/db/src/prediction/save.ts              savePrediction (one transaction)                  (new)
packages/db/src/prediction/single-game.ts       loadSingleGame                                    (new)
packages/db/src/schema.ts                       + auditPredictionInvariantChecks in INVARIANT_CHECKS
packages/db/src/seed/staging.ts                 a started game, and the staging account's blank rows
packages/db/src/index.ts                        the new exports
packages/db/test/prediction-page.test.ts, prediction-save.test.ts, single-game.test.ts (new); seed.test.ts

tools/migrate/src/parity/rulings.ts              + onlyAScoreSwitchesBackOn
tools/migrate/src/parity/rulings.test.ts         25 fields

apps/web/src/components/shell/icon.tsx           + sports-basketball (Material), fire, clock, lock-fill
apps/web/src/components/shell/nav-entries.ts     + "Spėjimai"                                    (+ test)
apps/web/src/components/shell/shell-paths.ts     + PREDICTIONS_PATH, PREDICTION_SAVE_PATH, predictionGamePath (+ test)
apps/web/src/components/format/vilnius-time.ts   + vilniusDate, vilniusClock, vilniusStamp, dayHeader (+ test)
apps/web/src/components/hub/team-crest.tsx      + size                                           (+ test)
apps/web/src/components/predictions/
  round-menu.tsx          RoundMenu ("Visi etapai", R-58)                                        (+ test, new)
  points-breakdown.tsx    PointsBreakdown (the .sr-pop popover)                                  (+ test, new)
  scored-line.tsx         ScoredLine                                                             (+ test, new)
  save-answer.ts          readSaveAnswer: the save's JSON, as the page shows it (R-59)            (+ test, new)
  prediction-editor.tsx   PredictionEditor: the open or locked row, its odds panel, the autosave  (+ test, new)
  predictions-view.tsx    PredictionsView                                                        (+ test, new)
  single-game-view.tsx    SingleGameView                                                         (+ test, new)
  single-game-form.tsx    SingleGameForm                                                         (+ test, new)
apps/web/src/app/prediction/results/page.tsx                 the list                            (new)
apps/web/src/app/prediction/results/save/route.ts            the save (POST)                     (new)
apps/web/src/app/prediction/game/[id]/page.tsx               the single game                     (new)
apps/web/src/server/predictions/texts.ts                     sportbet's save texts                (new)
apps/web/src/server/predictions/save-prediction.ts           the save's use case and answers      (+ test, new)
apps/web/src/server/request-context.ts           + tournament.missingResults
apps/web/src/server/shell-for.ts                 badges.results                                  (+ test)
apps/web/src/server/sign-in/return-path.ts       the prediction pages are guarded too            (+ test)
apps/web/tests/support/predictions.ts            jonasPlaying                                     (new)
apps/web/tests/feature/predictions.test.ts, prediction-save.test.ts, prediction-game.test.ts (new); sign-in.test.ts
apps/web/e2e/predictions.spec.ts (new), playwright.config.ts
CLAUDE.md                                        the records
```

## Design decisions this plan makes

None of these is a scoring rule; each is how the spec is held. Where one departs from the letter of the spec or of sportbet, the reason is given, and the lead lists it again in the report to the owner.

1. **The save is `POST /prediction/results/save`.** Next cannot serve a page and a handler at one path, as slice 5 found for the registration form. The autosave posts there; a player never sees this address. sportbet posts to `/prediction/results`.
2. **sportbet's order of checks.** sportbet's FormRequest runs before its controller, so a save is checked in this order:
   - the fields: each score whole and 50 to 120 ("Rezultatas turi būti nuo 50 iki 120."), then both or neither ("Įveskite abu rezultatus."), then not level;
   - then the row is the player's own and `gameID` is its game ("Šios prognozės išsaugoti negalima.");
   - then the lock ("Šio mačo prognozuoti nebegalima.").

   The spec lists ownership first. `predictMatch` keeps the spec's order for its own refusals, and the form check runs before it, as sportbet's does.
3. **Odds on read** (spec, lead decision).
   - The answer keeps sportbet's floats (`home_odds`, `draw_odds`, `away_odds`).
   - It adds `panel`: the "+X pt" texts, so the browser holds no scoring rule. sportbet's page recomputes them in JavaScript.
4. **The browser checks only "both or neither" before posting.**
   - sportbet's JavaScript repeats the range and draw checks. Here the server answers with the same texts.
   - A half-typed pair is still never posted, so the list shows no message for it, as sportbet's does.
5. **The badge refreshes through `router.refresh()`** after a save: the shell is drawn on the server. sportbet calls `/nav/missing`.
6. **`?event=` is the round's id**, sportbet's `events.id`, kept by the reader as `rounds.id`. `?event=all` is "Visi etapai" (R-58).
7. **Missing or unreadable ids answer as "not yours".** A missing `gameID` or `prediction_gameID` answers "Šios prognozės išsaugoti negalima.". sportbet answers Laravel's English "The game i d field is required.", which no page of sportbet's can send.
8. **A guest's POST is a 401** `{"message":"Unauthenticated."}`, as sportbet's `auth` answers a JSON request.
9. **The staging seed gets a started game and the staging account's rows.**
   - Euroleague 2026/27 gains game 9002, tip-off 2026-09-01, no result. The owner and the E2E then see a locked row and the single game's "Žaidimas jau prasidėjo".
   - The staging account gets a blank row per game, as joining writes. Without one, the save answers "not yours".
   - A newcomer joining 2026/27 now gets R-9's late fill-in for game 9002. That is right under the ruled set and changes no other test.
10. **The E2E signs in once** (`predictions.spec.ts`), and `playwright.config.ts` runs one worker.
    - The seeded account has one Mailpit inbox and a limit of three sign-in codes per ten minutes. `sign-in.spec.ts` uses two of them.
    - Two files signing in to one inbox at once would read each other's codes.
11. **The owner's lock check on staging.** The owner cannot make a save arrive after a tip-off by hand. So the staging check is:
    - the locked row on the list;
    - the single game's "Žaidimas jau prasidėjo - spėjimų keisti negalima.".

    The save's "Šio mačo prognozuoti nebegalima." is proven by the feature and db tests.
12. **The day header is genitive** ("Spalio 6"): Carbon's `lt` locale with `isoFormat('MMMM D')` uses its genitive month names (`months_regexp`).
13. **The form check returns its own result type**, a list of field errors, because `Result`'s refusal is one string. It is still a refusal and never an exception.

---

### Task 0 (lead): The gate

**Files:** none.

- [ ] **Step 1: A clean `main` with the spec and this plan on it**

```bash
git status --short | wc -l
git log --oneline -1 -- docs/superpowers/specs/2026-10-06-match-predictions-design.md
git -C /d/Projects/sportbet cat-file -t 3eb95e7
git rev-parse --short HEAD
```

Expected:
- `0`
- `273f9e9 docs: slice 6 spec - match-result predictions; R-57 to R-60 (#20)`
- `commit`
- The gate's commit: this plan, committed on top. Note it; Tasks 6, 10 and 15 review from it.

- [ ] **Step 2: Record the baseline**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Done`, then `3`, then every suite passes. Note each count; Tasks 6, 10 and 15 compare against them.

---

## Part 6a: the list, the entry and its badge

### Task 1 (backend-dev): The list's rules - the odds panel, a row's state, the page's round, its grouping, the badge

**Files:**
- Modify: `packages/domain/src/prediction/match-scoring.ts`, `packages/domain/src/prediction/match-scoring.test.ts`
- Modify: `packages/domain/src/hub/number-format.ts`, `packages/domain/src/hub/number-format.test.ts`
- Create: `packages/domain/src/prediction/predictions-list.ts`, `packages/domain/src/prediction/predictions-list.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/src/prediction/match-scoring.test.ts`. Add `winnerPointsAt` to the `./match-scoring` import, and `rate` and `unwrap` to the `../testing` import if they are not there:

```ts
describe('PointsFormat::winnerPointsAt', () => {
  const odds = (hundredths: number) => unwrap(Odds.ofHundredths(hundredths));

  it('odds panel: a right call is worth (1 + odds) x 50 x the round rate', () => {
    expect(winnerPointsAt(odds(59), rate(1)).hundredths).toBe(7950);
    expect(winnerPointsAt(odds(59), rate(2)).hundredths).toBe(15900);
    expect(winnerPointsAt(Odds.ZERO, rate(1)).hundredths).toBe(5000);
    expect(winnerPointsAt(odds(100), rate(3)).hundredths).toBe(30000);
  });
});
```

Append to `packages/domain/src/hub/number-format.test.ts` (add `onePlace` to the import):

```ts
describe('onePlace', () => {
  it("points to one decimal, as sportbet's number_format(round(x, 1), 1) prints them", () => {
    expect(onePlace(7950)).toBe('79.5');
    expect(onePlace(15900)).toBe('159.0');
    expect(onePlace(0)).toBe('0.0');
    expect(onePlace(-4500)).toBe('-45.0');
    expect(onePlace(123456)).toBe('1,234.6');
  });
});
```

Create `packages/domain/src/prediction/predictions-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Game } from '../round/game';
import { Season } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  player,
  rate,
  roundNo,
  team,
  unwrap,
} from '../testing';
import { MatchPrediction } from './match-prediction';
import {
  groupPredictionLines,
  missingResultPredictions,
  oddsPanel,
  predictionRowState,
  predictionsRound,
} from './predictions-list';

const JONAS = player('1');
const NOW = at('2026-10-15T12:00:00Z');

// Round 1: game 7 scored, game 9 past its tip-off unscored, game 10 still
// open. Round 2: game 11 open.
const G7 = makeGame({
  id: 7,
  round: 1,
  home: '11',
  away: '12',
  tipOff: '2026-10-02T18:00:00Z',
  result: [88, 79],
});
const G9 = makeGame({
  id: 9,
  round: 1,
  home: '13',
  away: '14',
  tipOff: '2026-10-10T17:30:00Z',
});
const G10 = makeGame({
  id: 10,
  round: 1,
  home: '12',
  away: '11',
  tipOff: '2026-10-20T18:00:00Z',
});
const G11 = makeGame({
  id: 11,
  round: 2,
  home: '14',
  away: '13',
  tipOff: '2026-10-27T18:00:00Z',
});
const SEASON = unwrap(
  Season.create({
    rounds: [makeRound({ number: 1 }), makeRound({ number: 2 })],
    games: [G7, G9, G10, G11],
    endsAt: null,
  }),
);

const row = (game: number, home: number | null, away: number | null) =>
  unwrap(
    MatchPrediction.enter({ player: JONAS, game: gameNo(game), home, away }),
  );

const storedGame = (id: number, lockedSince: string | null, postponed: boolean) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      home: team('11'),
      away: team('13'),
      tipOff: at('2026-10-30T18:00:00Z'),
      result: null,
      recordedWinner: null,
      lockedSince: lockedSince === null ? null : at(lockedSince),
      postponed,
    }),
  );

describe('predictionRowState (GameLock::rowIsClosed)', () => {
  it('list: a scored game is scored, a started one locked, one still to come open', () => {
    expect(predictionRowState(G7, NOW)).toBe('scored');
    expect(predictionRowState(G9, NOW)).toBe('locked');
    expect(predictionRowState(G10, NOW)).toBe('open');
  });

  it('list (R-13, R-41): a game locked after a move, or postponed, is locked', () => {
    expect(
      predictionRowState(storedGame(12, '2026-10-01T18:00:00Z', false), NOW),
    ).toBe('locked');
    expect(predictionRowState(storedGame(13, null, true), NOW)).toBe('locked');
  });
});

describe('predictionsRound (getPredictionResultsUser)', () => {
  const rounds = [
    { id: 21, number: roundNo(1) },
    { id: 22, number: roundNo(2) },
  ];

  it('list: no ?event, or one that is not a whole number, or 0, is the current round', () => {
    for (const requested of [null, '', 'abc', '0', '-3']) {
      expect(
        predictionsRound({ requested, rounds, current: roundNo(2) }),
      ).toEqual({ kind: 'round', round: roundNo(2) });
    }
  });

  it('list: with no current round, every round', () => {
    expect(
      predictionsRound({ requested: null, rounds, current: null }),
    ).toEqual({ kind: 'all' });
  });

  it("list: ?event names a round by its id; one the tournament does not have shows none, as sportbet's filter finds no row", () => {
    expect(
      predictionsRound({ requested: '21', rounds, current: roundNo(2) }),
    ).toEqual({ kind: 'round', round: roundNo(1) });
    expect(
      predictionsRound({ requested: '99', rounds, current: roundNo(2) }),
    ).toEqual({ kind: 'none' });
  });

  it('list (R-58): ?event=all is every round', () => {
    expect(
      predictionsRound({ requested: 'all', rounds, current: roundNo(1) }),
    ).toEqual({ kind: 'all' });
  });
});

describe('groupPredictionLines', () => {
  const line = (game: number, round: number, tipOff: string) => ({
    game: gameNo(game),
    round: roundNo(round),
    tipOff: at(tipOff),
  });
  const dayOf = (instant: number) =>
    new Date(instant).toISOString().slice(0, 10);

  it('list: by round, then by day in order, then by tip-off, ties by game', () => {
    const groups = groupPredictionLines(
      [
        line(11, 2, '2026-10-27T18:00:00Z'),
        line(10, 1, '2026-10-20T18:00:00Z'),
        line(8, 1, '2026-10-02T18:00:00Z'),
        line(7, 1, '2026-10-02T18:00:00Z'),
        line(9, 1, '2026-10-02T16:00:00Z'),
      ],
      dayOf,
    );
    expect(
      groups.map((group) => ({
        round: group.round,
        days: group.days.map((day) => ({
          day: day.day,
          games: day.lines.map((each) => each.game),
        })),
      })),
    ).toEqual([
      {
        round: 1,
        days: [
          { day: '2026-10-02', games: [9, 7, 8] },
          { day: '2026-10-20', games: [10] },
        ],
      },
      { round: 2, days: [{ day: '2026-10-27', games: [11] }] },
    ]);
  });

  it('list: nothing to show is no group', () => {
    expect(groupPredictionLines([], dayOf)).toEqual([]);
  });
});

describe('oddsPanel (results.blade.php)', () => {
  it('list: each outcome at its odds and the round rate', () => {
    const odds = CrowdOdds.stored(
      unwrap(Odds.ofHundredths(59)),
      unwrap(Odds.ofHundredths(132)),
      unwrap(Odds.ofHundredths(232)),
    );
    const panel = oddsPanel(odds, rate(2));
    expect(panel.home.hundredths).toBe(15900);
    expect(panel.away.hundredths).toBe(23200);
    expect(panel.draw.hundredths).toBe(33200);
  });
});

describe('missingResultPredictions (MissingPredictions::openGamesWithoutAPrediction)', () => {
  it("badge: the current round's open games whose row lacks a score, under both sets", () => {
    const predictions = [
      row(7, null, null),
      row(9, null, null),
      row(10, null, null),
      row(11, null, null),
    ];
    // Both sets make round 1 current here (sportbet: its earliest unscored
    // game, 9; ruled: its soonest open game, 10). Game 10 is its only open game.
    for (const rules of [sportbetRules, ruledRules]) {
      expect(
        missingResultPredictions({
          season: SEASON,
          current: SEASON.currentRound(NOW, rules),
          predictions,
          now: NOW,
        }),
      ).toBe(1);
    }
  });

  it('badge: an answered game, a game with no row, and no current round count nothing', () => {
    expect(
      missingResultPredictions({
        season: SEASON,
        current: roundNo(1),
        predictions: [row(10, 88, 79)],
        now: NOW,
      }),
    ).toBe(0);
    expect(
      missingResultPredictions({
        season: SEASON,
        current: roundNo(1),
        predictions: [],
        now: NOW,
      }),
    ).toBe(0);
    expect(
      missingResultPredictions({
        season: SEASON,
        current: null,
        predictions: [row(10, null, null)],
        now: NOW,
      }),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/prediction src/hub/number-format.test.ts`
Expected: FAIL, because `winnerPointsAt`, `onePlace` and `./predictions-list` do not exist.

- [ ] **Step 3: Write the code**

In `packages/domain/src/prediction/match-scoring.ts`, add `import type { Rate } from '../score/score';` and, after `oddsBonus`, add:

```ts
/**
 * What a right call is worth at `odds` in a round at `rate`, before the
 * result: PointsFormat::winnerPointsAt, the predictions page's odds panel.
 * The (1 + odds) x winner bonus scoreMatch pays, times the rate.
 */
export function winnerPointsAt(odds: Odds, rate: Rate): Points {
  return oddsBonus(odds, EUROLEAGUE_POINTS.winnerBonus).times(rate.value);
}
```

In `packages/domain/src/hub/number-format.ts`, replace `leaderPoints` with:

```ts
/**
 * Hundredths to one decimal, as sportbet prints points on its pages:
 * `number_format(round($points, 1), 1)` ("79.5", "1,234.6").
 */
export function onePlace(hundredths: number): string {
  return numberFormat(roundUnits(hundredths, 1), 1);
}

/**
 * A leader's total as the hub prints it: PlayerTotals' ROUND(total, 1),
 * half away from zero, through number_format (`{{ number_format($p->total_points, 1) }} pt`).
 */
export function leaderPoints(totalCents: number): string {
  return onePlace(totalCents);
}
```

Create `packages/domain/src/prediction/predictions-list.ts`:

```ts
import type { CrowdOdds } from '../odds/crowd-odds';
import type { Points } from '../points/points';
import type { Game } from '../round/game';
import type { Season } from '../round/season';
import type { Rate } from '../score/score';
import type { GameId, RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';
import type { MatchPrediction } from './match-prediction';
import { winnerPointsAt } from './match-scoring';

/** The odds panel (results.blade.php): what a right call on each outcome is worth now. */
export interface OddsPanel {
  readonly home: Points;
  readonly away: Points;
  /** Never drawn for Euroleague, where a draw is no legal answer; kept for sportbet's `draw_odds`. */
  readonly draw: Points;
}

/** PointsFormat::winnerPointsAt for each outcome, at the round's rate (R-10). */
export function oddsPanel(odds: CrowdOdds, rate: Rate): OddsPanel {
  return {
    home: winnerPointsAt(odds.home, rate),
    away: winnerPointsAt(odds.away, rate),
    draw: winnerPointsAt(odds.draw, rate),
  };
}

/** How the predictions page draws a row. */
export type PredictionRowState = 'scored' | 'locked' | 'open';

/**
 * GameLock::rowIsClosed: a game with a result is drawn scored; one no
 * longer open (Game.isOpenAt: past its tip-off, locked after a move under
 * R-13, postponed under R-41) is locked; else it takes a prediction.
 */
export function predictionRowState(
  game: Game,
  now: Instant,
): PredictionRowState {
  if (game.result !== null) return 'scored';
  return game.isOpenAt(now) ? 'open' : 'locked';
}

/** The page's rounds: one, every one (R-58), or none. */
export type PredictionsRound =
  | { readonly kind: 'round'; readonly round: RoundNumber }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' };

const WHOLE = /^\d{1,10}$/u;

/**
 * getPredictionResultsUser's filter. `?event=` names a round by its id
 * (sportbet's event id, which the reader keeps). Absent, not a whole
 * number, or 0: the current round (LR-3, R-6, R-40), or every round when
 * none is current. An id the tournament does not have: no round, as
 * sportbet's filter by it finds no row. "all": every round (R-58; sportbet's
 * "Visi etapai" sent no id, so it fell back to the current round).
 */
export function predictionsRound(input: {
  readonly requested: string | null;
  readonly rounds: readonly {
    readonly id: number;
    readonly number: RoundNumber;
  }[];
  readonly current: RoundNumber | null;
}): PredictionsRound {
  const { requested, rounds, current } = input;
  if (requested === 'all') return { kind: 'all' };
  const id =
    requested !== null && WHOLE.test(requested) ? Number(requested) : 0;
  if (id === 0) {
    return current === null
      ? { kind: 'all' }
      : { kind: 'round', round: current };
  }
  const named = rounds.find((round) => round.id === id);
  return named === undefined
    ? { kind: 'none' }
    : { kind: 'round', round: named.number };
}

/** What groupPredictionLines reads of a row. */
export interface PredictionLineKey {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly tipOff: Instant;
}

export interface PredictionDay<T> {
  /** The calendar day, as `dayOf` names it. */
  readonly day: string;
  readonly lines: readonly T[];
}

export interface PredictionRoundGroup<T> {
  readonly round: RoundNumber;
  readonly days: readonly PredictionDay<T>[];
}

/**
 * getPredictionResultsUser's grouping: by round (event_day), then by
 * calendar day as `dayOf` names it - the page passes Vilnius's - days in
 * order, then by tip-off; ties by game id.
 */
export function groupPredictionLines<T extends PredictionLineKey>(
  lines: readonly T[],
  dayOf: (instant: Instant) => string,
): PredictionRoundGroup<T>[] {
  const sorted = [...lines].sort(
    (a, b) => a.round - b.round || a.tipOff - b.tipOff || a.game - b.game,
  );
  const groups: { round: RoundNumber; days: { day: string; lines: T[] }[] }[] =
    [];
  for (const line of sorted) {
    let group = groups.at(-1);
    if (group?.round !== line.round) {
      group = { round: line.round, days: [] };
      groups.push(group);
    }
    const day = dayOf(line.tipOff);
    let current = group.days.at(-1);
    if (current?.day !== day) {
      current = { day, lines: [] };
      group.days.push(current);
    }
    current.lines.push(line);
  }
  return groups;
}

/**
 * MissingPredictions::openGamesWithoutAPrediction: the current round's
 * games still open (Game.isOpenAt) whose row of the player's lacks either
 * score. A game the player has no row for is not counted; with no
 * current round, nothing is.
 */
export function missingResultPredictions(input: {
  readonly season: Season;
  readonly current: RoundNumber | null;
  readonly predictions: readonly MatchPrediction[];
  readonly now: Instant;
}): number {
  const { season, current, predictions, now } = input;
  if (current === null) return 0;
  return predictions.filter((prediction) => {
    const game = season.game(prediction.game);
    return (
      game !== undefined &&
      game.round === current &&
      game.isOpenAt(now) &&
      (prediction.home === null || prediction.away === null)
    );
  }).length;
}
```

In `packages/domain/src/index.ts`:
- Add `winnerPointsAt` to the `./prediction/match-scoring` export.
- Add `onePlace` to the `./hub/number-format` export.
- Add:

```ts
export {
  groupPredictionLines,
  missingResultPredictions,
  oddsPanel,
  predictionRowState,
  predictionsRound,
  type OddsPanel,
  type PredictionDay,
  type PredictionLineKey,
  type PredictionRoundGroup,
  type PredictionRowState,
  type PredictionsRound,
} from './prediction/predictions-list';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/domain exec vitest run && pnpm --filter @sportbet/domain typecheck && pnpm lint`
Expected: PASS, with every earlier domain test still passing (`leaderPoints` keeps its tests).

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(domain): the predictions list's rules - the odds panel (PointsFormat::winnerPointsAt), a row's state (GameLock), the page's round with "Visi etapai" (R-58), its grouping, the badge's count (MissingPredictions) (#20)`.

---

### Task 2 (backend-dev): The list's data, the badge's count, and staging's started game

**Files:**
- Create: `packages/db/src/prediction/page.ts`, `packages/db/test/prediction-page.test.ts`
- Modify: `packages/db/src/prediction/repository.ts`, `packages/db/src/index.ts`
- Modify: `packages/db/src/seed/staging.ts`, `packages/db/test/seed.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/db/test/prediction-page.test.ts`. It uses `world.ts`, where it is 2026-10-15:
- round 1 (id 21, "1 turas") has game 7, scored 88:79, and game 10, still open;
- round 2 (id 22, "2 turas", knockout, rate 2) has game 8, scored 80:80, and game 9, started and unscored.

```ts
import {
  MatchPrediction,
  ruledRules,
  sportbetRules,
} from '@sportbet/domain';
import { at, gameNo, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadMissingResultPredictions,
  loadPlayerPredictions,
  loadPredictionsPage,
  loadSeason,
  loadTournamentPoints,
  recalculateUnderRuleSet,
} from '../src';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  GAMES,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

const predict = (
  player: typeof ADA,
  game: number,
  home: number | null,
  away: number | null,
) =>
  unwrap(MatchPrediction.enter({ player, game: gameNo(game), home, away }));

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, GAMES);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveMatchPredictions(db, TOURNAMENT, [
    predict(ADA, 7, 88, 79),
    predict(ADA, 8, 85, 80),
    predict(ADA, 9, null, null),
    predict(ADA, 10, null, null),
    predict(BEN, 7, 70, 80),
    predict(BEN, 10, 85, 80),
    predict(CAI, 10, 90, 70),
  ]);
  expect(await recalculateUnderRuleSet(db, TOURNAMENT, ruledRules)).toBeNull();
});

const page = (requested: string | null, rules = ruledRules) =>
  loadPredictionsPage(db, {
    player: ADA,
    tournament: TOURNAMENT,
    requested,
    now: NOW,
    rules,
  });

const gamesOf = async (requested: string | null, rules = ruledRules) =>
  (await page(requested, rules)).lines.map(({ game }) => game);

describe('loadPredictionsPage (getPredictionResultsUser)', () => {
  it('list: the menu lists every round by number, with its id and name', async () => {
    expect((await page(null)).rounds).toEqual([
      { id: 21, name: '1 turas' },
      { id: 22, name: '2 turas' },
    ]);
  });

  it("list: with no ?event, the current round under the rule set (ruled R-6: game 10's; sportbet: game 9's)", async () => {
    expect(await gamesOf(null)).toEqual([7, 10]);
    expect((await page(null)).selected).toBe(21);
    expect(await gamesOf(null, sportbetRules)).toEqual([8, 9]);
  });

  it('list: ?event names a round by its id; an unknown one shows nothing; "all" shows every round (R-58)', async () => {
    expect(await gamesOf('22')).toEqual([8, 9]);
    expect(await gamesOf('99')).toEqual([]);
    expect((await page('99')).selected).toBe(99);
    expect(await gamesOf('all')).toEqual([7, 8, 9, 10]);
    expect((await page('all')).selected).toBe('all');
  });

  it("list: only the player's own rows, each with its round, teams and prediction", async () => {
    const lines = (await page('all')).lines;
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      game: 7,
      round: 1,
      roundName: '1 turas',
      home: 'Zalgiris',
      away: 'Olympiacos',
      predicted: { home: 88, away: 79 },
    });
  });

  it("list: a scored row carries its result and the rule set's points, and no panel", async () => {
    const scored = (await page('all')).lines.find(({ game }) => game === 7);
    const stored = (
      await loadTournamentPoints(db, TOURNAMENT, ruledRules.name)
    ).matches.find(({ player, game }) => player === ADA && game === 7);
    expect(scored?.state).toBe('scored');
    expect(scored?.result).toEqual({ home: 88, away: 79 });
    expect(scored?.points?.full.hundredths).toBe(
      stored?.points.full.hundredths,
    );
    expect(scored?.points?.serija.hundredths).toBe(stored?.serija.hundredths);
    expect(scored?.panel).toBeNull();
  });

  it("list: an open row's panel is from the game's votes now, at the round's rate (odds on read)", async () => {
    const open = (await page('all')).lines.find(({ game }) => game === 10);
    expect(open?.state).toBe('open');
    expect(open?.result).toBeNull();
    // Two home votes of two: home odds log2(2/2) = 0, away log2(2/0.5) = 2.
    expect(open?.panel?.home.hundredths).toBe(5000);
    expect(open?.panel?.away.hundredths).toBe(15000);
  });

  it('list: a started unscored row is locked, with its panel (rate 2, no votes)', async () => {
    const locked = (await page('all')).lines.find(({ game }) => game === 9);
    expect(locked?.state).toBe('locked');
    expect(locked?.panel?.home.hundredths).toBe(10000);
  });
});

describe('loadMissingResultPredictions (the "Spėjimai" badge)', () => {
  it("badge: the current round's open games ADA has not answered", async () => {
    const season = await loadSeason(db, TOURNAMENT);
    const missing = () =>
      loadMissingResultPredictions(db, {
        player: ADA,
        tournament: TOURNAMENT,
        season,
        now: NOW,
        rules: ruledRules,
      });
    expect(await missing()).toBe(1);
    await saveMatchPredictions(db, TOURNAMENT, [predict(ADA, 10, 81, 77)]);
    expect(await missing()).toBe(0);
  });

  it("loadPlayerPredictions: the player's rows only, by game", async () => {
    const rows = await loadPlayerPredictions(db, BEN, TOURNAMENT);
    expect(rows.map(({ game, home }) => [game, home])).toEqual([
      [7, 70],
      [10, 85],
    ]);
  });
});
```

In `packages/db/test/seed.test.ts`, in the first test, replace the games expectation and rename the test:

```ts
it('seeds the staging tournaments with their profiles, 2026/27 its game to come and its started one, and running it again adds nothing', async () => {
```

```ts
  const games = await client.query('select id from games order by id');
  expect(z.array(z.object({ id: z.int() })).parse(games.rows)).toEqual([
    { id: 9001 },
    { id: 9002 },
  ]);
```

and append to the second test, after its last `expect`:

```ts
  // A blank row per game of 2026/27, as joining writes, so the owner can predict.
  const rows = await client.query(
    'select game_id, home, away, origin from match_predictions order by game_id',
  );
  expect(rows.rows).toEqual([
    { game_id: 9001, home: null, away: null, origin: 'real' },
    { game_id: 9002, home: null, away: null, origin: 'real' },
  ]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/prediction-page.test.ts test/seed.test.ts`
Expected: FAIL, because `loadPredictionsPage`, `loadPlayerPredictions` and `loadMissingResultPredictions` are not exported, and the seed has one game and no rows.

- [ ] **Step 3: Write the code**

In `packages/db/src/prediction/repository.ts`:
- add `missingResultPredictions`, `type Instant`, `type PlayerId`, `type RuleSet` and `type Season` to the `@sportbet/domain` import;
- add `and` to the `drizzle-orm` import, and `keyOf` to the `../edge` import;
- replace `loadMatchPredictions` with:

```ts
/** The rows `condition` picks of the tournament's games, through MatchPrediction.stored; by game, then player. */
async function predictionsOf(
  db: Executor,
  tournament: Tournament,
  player: PlayerId | null,
): Promise<MatchPrediction[]> {
  const rows = await db
    .select({
      player: matchPredictions.playerId,
      game: matchPredictions.gameId,
      home: matchPredictions.home,
      away: matchPredictions.away,
      origin: matchPredictions.origin,
      filledInAt: matchPredictions.filledInAt,
    })
    .from(matchPredictions)
    .innerJoin(games, eq(games.id, matchPredictions.gameId))
    .where(
      and(
        eq(games.tournamentId, tournament.id),
        player === null
          ? undefined
          : eq(matchPredictions.playerId, keyOf(player, 'player')),
      ),
    )
    .orderBy(asc(matchPredictions.gameId), asc(matchPredictions.playerId));
  return predictionRows.parse(rows).map((row) => {
    const key = `${String(row.player)}/${String(row.game)}`;
    return stored(
      MatchPrediction.stored({
        player: playerOf(row.player),
        game: gameOf(row.game),
        home: row.home,
        away: row.away,
        origin: row.origin,
        filledInAt:
          row.filledInAt === null
            ? null
            : instantOf(row.filledInAt, 'match_predictions', key),
      }),
      'match_predictions',
      key,
    );
  });
}

/**
 * Every prediction row of the tournament's games, real, filled in and
 * blank, through MatchPrediction.stored; by game, then player.
 */
export function loadMatchPredictions(
  db: Executor,
  tournament: Tournament,
): Promise<MatchPrediction[]> {
  return predictionsOf(db, tournament, null);
}

/** One player's prediction rows of the tournament's games; by game. */
export function loadPlayerPredictions(
  db: Executor,
  player: PlayerId,
  tournament: Tournament,
): Promise<MatchPrediction[]> {
  return predictionsOf(db, tournament, player);
}

/**
 * The "Spėjimai" badge (MissingPredictions::openGamesWithoutAPrediction):
 * how many of the current round's open games the player has not answered,
 * the round under the rule set (LR-3, R-6, R-40).
 */
export async function loadMissingResultPredictions(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly season: Season;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<number> {
  const { player, tournament, season, now, rules } = input;
  return missingResultPredictions({
    season,
    current: season.currentRound(now, rules),
    predictions: await loadPlayerPredictions(db, player, tournament),
    now,
  });
}
```

Create `packages/db/src/prediction/page.ts`:

```ts
import {
  CrowdOdds,
  MatchPrediction,
  oddsPanel,
  Points,
  PREDICTION_ORIGINS,
  predictionRowState,
  predictionsRound,
  roundNumber,
  scoreSideInvariant,
  type GameId,
  type Instant,
  type OddsPanel,
  type PlayerId,
  type PredictionRowState,
  type RoundNumber,
  type RuleSet,
  type TeamId,
  type Tournament,
  type Vote,
} from '@sportbet/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, keyOf, playerOf, stored, unitsOf } from '../edge';
import { matchPoints } from '../points/schema';
import { loadSeason } from '../season/repository';
import { games, rounds } from '../season/schema';
import { listTeams } from '../team/repository';
import { matchPredictions } from './schema';

/** A round in the page's menu: its id (sportbet's event id) and its name. */
export interface PredictionsMenuRound {
  readonly id: number;
  readonly name: string;
}

/** A scored row's points, as point_results stores them. */
export interface LinePoints {
  readonly winner: Points;
  readonly margin: Points;
  readonly bingo: Points;
  readonly serija: Points;
  readonly full: Points;
}

/** One row of the predictions page. */
export interface PredictionLine {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly roundName: string;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
  /** The player's row: their scores, a fill-in's, or blank. */
  readonly predicted: {
    readonly home: number | null;
    readonly away: number | null;
  };
  readonly state: PredictionRowState;
  /** The game's result, on a scored row. */
  readonly result: { readonly home: number; readonly away: number } | null;
  /** The rule set's points row, on a scored row that has one. */
  readonly points: LinePoints | null;
  /** The odds panel from the game's votes now (CrowdOdds.forGame), on a row not yet scored. */
  readonly panel: OddsPanel | null;
}

export interface PredictionsPage {
  readonly rounds: readonly PredictionsMenuRound[];
  /** The menu's choice: a round's id, or "all". */
  readonly selected: number | 'all';
  readonly lines: readonly PredictionLine[];
}

const roundRows = z.array(
  z.object({ id: z.int(), number: z.int(), name: z.string() }),
);
const side = scoreSideInvariant.schema.nullable();
const ownRows = z.array(z.object({ game: z.int(), home: side, away: side }));
const voteRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);
const pointRows = z.array(
  z.object({
    game: z.int(),
    winner: z.string(),
    margin: z.string(),
    bingo: z.string(),
    serija: z.string(),
    full: z.string(),
  }),
);

/** The player's points rows of `ids` under the rule set (its own source), by game. */
async function pointsOf(
  db: Executor,
  player: number,
  ids: readonly GameId[],
  rules: RuleSet,
): Promise<Map<GameId, LinePoints>> {
  if (ids.length === 0) return new Map();
  const rows = pointRows.parse(
    await db
      .select({
        game: matchPoints.gameId,
        winner: matchPoints.winner,
        margin: matchPoints.margin,
        bingo: matchPoints.bingo,
        serija: matchPoints.serija,
        full: matchPoints.full,
      })
      .from(matchPoints)
      .where(
        and(
          eq(matchPoints.source, rules.name),
          eq(matchPoints.playerId, player),
          inArray(matchPoints.gameId, [...ids]),
        ),
      ),
  );
  return new Map(
    rows.map((row) => {
      const key = `${rules.name}/${String(player)}/${String(row.game)}`;
      const of = (value: string) =>
        stored(
          Points.ofHundredths(unitsOf(value, 2, 'match_points', key)),
          'match_points',
          key,
        );
      return [
        gameOf(row.game),
        {
          winner: of(row.winner),
          margin: of(row.margin),
          bingo: of(row.bingo),
          serija: of(row.serija),
          full: of(row.full),
        },
      ];
    }),
  );
}

/** Every player's vote on `ids` (CrowdOdds.forGame reads which count), by game. */
async function votesOf(
  db: Executor,
  ids: readonly GameId[],
): Promise<Map<GameId, Vote[]>> {
  const votes = new Map<GameId, Vote[]>();
  if (ids.length === 0) return votes;
  const rows = voteRows.parse(
    await db
      .select({
        player: matchPredictions.playerId,
        game: matchPredictions.gameId,
        home: matchPredictions.home,
        away: matchPredictions.away,
        origin: matchPredictions.origin,
      })
      .from(matchPredictions)
      .where(inArray(matchPredictions.gameId, [...ids])),
  );
  for (const row of rows) {
    const key = `${String(row.player)}/${String(row.game)}`;
    const prediction = stored(
      MatchPrediction.stored({
        player: playerOf(row.player),
        game: gameOf(row.game),
        home: row.home,
        away: row.away,
        origin: row.origin,
        filledInAt: null,
      }),
      'match_predictions',
      key,
    );
    const game = gameOf(row.game);
    votes.set(game, [
      ...(votes.get(game) ?? []),
      { origin: prediction.origin, outcome: prediction.outcome },
    ]);
  }
  return votes;
}

/**
 * getPredictionResultsUser: the player's own rows of the tournament's
 * games in the page's round (predictionsRound), each with its game's state
 * (predictionRowState), its result and the rule set's points on a scored
 * game, and the odds panel from the game's current votes on any other.
 * Odds are read, never stored: game_odds holds only what a scored game was
 * scored with (CO-7). The menu lists every round, by number then id.
 */
export async function loadPredictionsPage(
  db: Executor,
  input: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    /** `?event=`: a round's id, "all", or null. */
    readonly requested: string | null;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<PredictionsPage> {
  const { player, tournament, requested, now, rules } = input;
  const playerKey = keyOf(player, 'player');
  const season = await loadSeason(db, tournament);
  const numbered = roundRows
    .parse(
      await db
        .select({ id: rounds.id, number: rounds.number, name: rounds.name })
        .from(rounds)
        .where(eq(rounds.tournamentId, tournament.id))
        .orderBy(asc(rounds.number), asc(rounds.id)),
    )
    .map((row) => ({
      id: row.id,
      number: stored(roundNumber(row.number), 'rounds', row.id),
      name: row.name,
    }));
  const chosen = predictionsRound({
    requested,
    rounds: numbered,
    current: season.currentRound(now, rules),
  });
  const menu = numbered.map(({ id, name }) => ({ id, name }));
  if (chosen.kind === 'none') {
    return { rounds: menu, selected: Number(requested ?? 0), lines: [] };
  }
  const selected =
    chosen.kind === 'all'
      ? 'all'
      : (numbered.find(({ number }) => number === chosen.round)?.id ?? 'all');
  const own = ownRows.parse(
    await db
      .select({
        game: matchPredictions.gameId,
        home: matchPredictions.home,
        away: matchPredictions.away,
      })
      .from(matchPredictions)
      .innerJoin(games, eq(games.id, matchPredictions.gameId))
      .where(
        and(
          eq(matchPredictions.playerId, playerKey),
          eq(games.tournamentId, tournament.id),
        ),
      ),
  );
  const shown = own.flatMap((row) => {
    const game = season.game(gameOf(row.game));
    if (game === undefined) {
      throw new Error(`predictions: game ${String(row.game)} is not stored`);
    }
    return chosen.kind === 'all' || game.round === chosen.round
      ? [{ row, game }]
      : [];
  });
  const points = await pointsOf(
    db,
    playerKey,
    shown.map(({ game }) => game.id),
    rules,
  );
  const votes = await votesOf(
    db,
    shown.filter(({ game }) => game.result === null).map(({ game }) => game.id),
  );
  const names = new Map(
    (await listTeams(db, tournament)).map(({ id, name }) => [id, name]),
  );
  const nameOf = (team: TeamId): string => {
    const name = names.get(team);
    if (name === undefined) {
      throw new Error(`predictions: team ${team} of a game is not stored`);
    }
    return name;
  };
  const roundNames = new Map(numbered.map(({ number, name }) => [number, name]));
  return {
    rounds: menu,
    selected,
    lines: shown.map(({ row, game }) => {
      const round = season.round(game.round);
      const roundName = roundNames.get(game.round);
      if (round === undefined || roundName === undefined) {
        throw new Error(`predictions: round ${String(game.round)} is not stored`);
      }
      const state = predictionRowState(game, now);
      return {
        game: game.id,
        round: game.round,
        roundName,
        tipOff: game.tipOff,
        home: nameOf(game.home),
        away: nameOf(game.away),
        predicted: { home: row.home, away: row.away },
        state,
        result:
          game.result === null
            ? null
            : { home: game.result.home, away: game.result.away },
        points: state === 'scored' ? (points.get(game.id) ?? null) : null,
        panel:
          state === 'scored'
            ? null
            : oddsPanel(
                CrowdOdds.forGame(votes.get(game.id) ?? [], rules),
                round.rate,
              ),
      };
    }),
  };
}
```

If `roundNumber` is not exported from `@sportbet/domain`'s index, add it next to the other id functions there (`season/repository.ts` imports it already, so it most likely is).

In `packages/db/src/index.ts`, add:

```ts
export {
  loadPredictionsPage,
  type LinePoints,
  type PredictionLine,
  type PredictionsMenuRound,
  type PredictionsPage,
} from './prediction/page';
```

and `loadMissingResultPredictions` and `loadPlayerPredictions` to the `./prediction/repository` export.

In `packages/db/src/seed/staging.ts`:
- add `import { eq } from 'drizzle-orm';`, `import { z } from 'zod';`, `import { matchPredictions } from '../prediction/schema';` and `import { games } from '../season/schema';`;
- replace the `STAGING_SEASON` doc comment and its `tipOff` and `game` fields with:

```ts
/**
 * Euroleague 2026/27's games. Ids are from 9001, clear of any a real season
 * uses on staging.
 * - 9001, far ahead (2027-03-04): a next game makes R-48 join every staging
 *   sign-up to 2026/27 rather than to the newer 2027/28, which has none; it
 *   fills the guest's "Artėjančios rungtynės", and the owner predicts it.
 * - 9002, Real Madrid at home, started (2026-09-01) with no result: the predictions page's locked
 *   row and the single game's "Žaidimas jau prasidėjo" (slice 6). A
 *   newcomer joining 2026/27 gets R-9's late fill-in for it.
 */
```

```ts
  // 9002 is the return game: one round holds a pair of teams once each way
  // (games_round_teams_unique).
  games: [
    { id: 9001, tipOff: '2027-03-04T18:00:00Z', returnGame: false },
    { id: 9002, tipOff: '2026-09-01T18:00:00Z', returnGame: true },
  ],
```

- in `seedSeason`, replace the `saveGames` call with:

```ts
  await saveGames(
    db,
    tournament,
    STAGING_SEASON.games.map(({ id, tipOff, returnGame }) =>
      must(
        Game.schedule({
          id: must(gameId(id)),
          round: STAGING_SEASON.round.round.number,
          home: returnGame ? away.id : home.id,
          away: returnGame ? home.id : away.id,
          tipOff: must(instantFrom(tipOff)),
        }),
      ),
    ),
  );
```

- in `seedStaging`, after the `tournamentPlayers` insert inside the transaction, add:

```ts
    // A blank row per game, as joining writes (PredictionRows::seedMissing):
    // without one, a save answers that the prediction is not the player's.
    const seasonGames = z
      .array(z.object({ id: z.int() }))
      .parse(
        await tx
          .select({ id: games.id })
          .from(games)
          .where(eq(games.tournamentId, tournament.id)),
      );
    if (seasonGames.length > 0) {
      await tx
        .insert(matchPredictions)
        .values(
          seasonGames.map(({ id }) => ({
            playerId: account.id,
            gameId: id,
            home: null,
            away: null,
            origin: 'real' as const,
            filledInAt: null,
          })),
        )
        .onConflictDoNothing({
          target: [matchPredictions.playerId, matchPredictions.gameId],
        });
    }
```

`seedStaging` seeds the season (`seedSeason`) before the account, so the games exist when the rows are written.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/db exec vitest run test/prediction-page.test.ts test/seed.test.ts test/predictions.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. If the open row's panel differs, print `CrowdOdds.forGame` for the two home votes and compare with CO-4 before changing the test: two votes, both home, are `log2(2/2) = 0` and `log2(2/0.5) = 2`.

Then run the whole db suite, which `test:feature`'s E2E stack seeding depends on: `pnpm test:db`. Expected: every file passes, with 2 seed changes and the new file's tests added.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(db): the predictions page's data - the player's rows by round (R-58), scored rows' points, odds on read; the badge's count; staging's started game and the owner's blank rows (#20)`.

---

### Task 3 (web-dev): Vilnius days and clocks, the list's icons, crest sizes, the prediction paths

**Files:**
- Modify: `apps/web/src/components/format/vilnius-time.ts`, `apps/web/src/components/format/vilnius-time.test.ts`
- Modify: `apps/web/src/components/shell/icon.tsx`, `apps/web/src/components/shell/icon.test.tsx`
- Modify: `apps/web/src/components/hub/team-crest.tsx`, `apps/web/src/components/hub/team-crest.test.tsx`
- Modify: `apps/web/src/components/shell/shell-paths.ts`, `apps/web/src/components/shell/shell-paths.test.ts`
- Modify: `apps/web/src/test-setup.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/components/format/vilnius-time.test.ts` (import `dayHeader`, `vilniusClock`, `vilniusDate`, `vilniusStamp` beside `vilniusDateTime`):

```ts
describe('the predictions page (results.blade.php, game-single.blade.php)', () => {
  it("vilniusDate: the Vilnius calendar day, which can be UTC's next one", () => {
    expect(vilniusDate(at('2026-10-05T21:30:00Z'))).toBe('2026-10-06');
    expect(vilniusDate(at('2026-10-05T20:30:00Z'))).toBe('2026-10-05');
    expect(vilniusDate(at('2027-03-04T22:30:00Z'))).toBe('2027-03-05');
  });

  it('vilniusClock: H:i in Vilnius, summer and winter', () => {
    expect(vilniusClock(at('2026-10-06T18:00:00Z'))).toBe('21:00');
    expect(vilniusClock(at('2027-03-04T18:00:00Z'))).toBe('20:00');
    expect(vilniusClock(at('2027-03-04T07:05:00Z'))).toBe('09:05');
  });

  it('vilniusStamp: Y-m-d H:i in Vilnius (the single game page writes " LT" after it)', () => {
    expect(vilniusStamp(at('2027-03-04T18:00:00Z'))).toBe('2027-03-04 20:00');
  });

  it("dayHeader: ucfirst(isoFormat('MMMM D')) in Lithuanian, the month in the genitive", () => {
    expect(dayHeader('2026-10-06')).toBe('Spalio 6');
    expect(dayHeader('2027-01-01')).toBe('Sausio 1');
    expect(dayHeader('2027-05-23')).toBe('Gegužės 23');
    expect(dayHeader('2026-09-10')).toBe('Rugsėjo 10');
  });
});
```

In `apps/web/src/components/shell/icon.test.tsx`, add `'clock'`, `'fire'`, `'lock-fill'` and `'sports-basketball'` to `NAMES`, and append:

```ts
it('draws the Material basketball on its own 24-unit box (sportbet\'s $matchIcon)', () => {
  const { container } = render(<Icon name="sports-basketball" />);
  expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
    '0 0 24 24',
  );
  const { container: other } = render(<Icon name="fire" />);
  expect(other.querySelector('svg')?.getAttribute('viewBox')).toBe(
    '0 0 16 16',
  );
});
```

Append to `apps/web/src/components/hub/team-crest.test.tsx`:

```ts
it('draws the predictions page sizes on sportbet\'s .sb-crest plate: 22, 26 and 52px, square-ish', () => {
  for (const [size, px] of [
    ['line', 22],
    ['row', 26],
    ['large', 52],
  ] as const) {
    const { container } = render(<TeamCrest team="Real Madrid" size={size} />);
    const crest = container.querySelector('img');
    expect(crest?.getAttribute('width')).toBe(String(px));
    expect(crest?.className).toContain(`size-[${String(px)}px]`);
    expect(crest?.className).toContain('rounded-[6px]');
    expect(crest?.className).toContain('object-contain');
    expect(crest?.className).toContain('bg-crest-plate');
  }
});
```

Append to `apps/web/src/components/shell/shell-paths.test.ts` (import the three new names):

```ts
describe('the prediction paths (routes/web.php)', () => {
  it('the list, its round, the save, and a game', () => {
    expect(PREDICTIONS_PATH).toBe('/prediction/results');
    expect(predictionsPathFor(21)).toBe('/prediction/results?event=21');
    expect(predictionsPathFor('all')).toBe('/prediction/results?event=all');
    expect(PREDICTION_SAVE_PATH).toBe('/prediction/results/save');
    expect(predictionGamePath(9001)).toBe('/prediction/game/9001');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/format src/components/shell/icon.test.tsx src/components/hub/team-crest.test.tsx src/components/shell/shell-paths.test.ts`
Expected: FAIL, because the new names do not exist.

- [ ] **Step 3: Write the code**

Append to `apps/web/src/components/format/vilnius-time.ts`:

```ts
const DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Vilnius',
});

const CLOCK = new Intl.DateTimeFormat('lt', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Vilnius',
});

const partOf = (
  format: Intl.DateTimeFormat,
  instant: number,
  type: Intl.DateTimeFormatPartTypes,
): string =>
  format.formatToParts(new Date(instant)).find((each) => each.type === type)
    ?.value ?? '';

/** The Vilnius calendar day, `YYYY-MM-DD` (sportbet's ->setTimezone('Europe/Vilnius')->format('Y-m-d')). */
export function vilniusDate(instant: number): string {
  return `${partOf(DAY, instant, 'year')}-${partOf(DAY, instant, 'month')}-${partOf(DAY, instant, 'day')}`;
}

/** The Vilnius clock, `H:i`. */
export function vilniusClock(instant: number): string {
  return `${partOf(CLOCK, instant, 'hour')}:${partOf(CLOCK, instant, 'minute')}`;
}

/** `Y-m-d H:i` in Vilnius: the single game page's tip-off. */
export function vilniusStamp(instant: number): string {
  return `${vilniusDate(instant)} ${vilniusClock(instant)}`;
}

/**
 * Carbon's `lt` months as `isoFormat('MMMM D')` writes them: with a day
 * beside it, the genitive (months_regexp), capitalised by ucfirst.
 */
const MONTHS = [
  'Sausio',
  'Vasario',
  'Kovo',
  'Balandžio',
  'Gegužės',
  'Birželio',
  'Liepos',
  'Rugpjūčio',
  'Rugsėjo',
  'Spalio',
  'Lapkričio',
  'Gruodžio',
] as const;

/** A day card's header: `ucfirst(Carbon::parse($day)->locale('lt')->isoFormat('MMMM D'))`, "Spalio 6". */
export function dayHeader(isoDate: string): string {
  const [, month = '', day = ''] = isoDate.split('-');
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) throw new Error(`dayHeader: ${isoDate} is no date`);
  return `${name} ${String(Number(day))}`;
}
```

In `apps/web/src/components/shell/icon.tsx`:
- Add `'clock'`, `'fire'`, `'lock-fill'` and `'sports-basketball'` to `IconName`, in alphabetical order.
- Change the header comment's last sentence to: "A slice whose entry needs another icon copies its paths from bootstrap-icons@1.11.1/icons/<name>.svg and adds it here; sportbet's one Material icon, the basketball (`$matchIcon`, config/help.php), is from @material-design-icons/svg@0.14.13/filled/sports_basketball.svg, on its own 24-unit box."
- Add to `ICONS`, beside the others in alphabetical order:

```ts
  clock: [
    {
      d: 'M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z',
    },
    {
      d: 'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z',
    },
  ],
  fire: [
    {
      d: 'M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16Zm0-1c-1.657 0-3-1-3-2.75 0-.75.25-2 1.25-3C6.125 10 7 10.5 7 10.5c-.375-1.25.5-3.25 2-3.5-.179 1-.25 2 1 3 .625.5 1 1.364 1 2.25C11 14 9.657 15 8 15Z',
    },
  ],
  'lock-fill': [
    {
      d: 'M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z',
    },
  ],
  'sports-basketball': [
    {
      d: 'M17.09 11h4.86c-.16-1.61-.71-3.11-1.54-4.4-1.73.83-2.99 2.45-3.32 4.4zM6.91 11c-.33-1.95-1.59-3.57-3.32-4.4-.83 1.29-1.38 2.79-1.54 4.4h4.86zM15.07 11c.32-2.59 1.88-4.79 4.06-6-1.6-1.63-3.74-2.71-6.13-2.95V11h2.07zM8.93 11H11V2.05C8.61 2.29 6.47 3.37 4.87 5c2.18 1.21 3.74 3.41 4.06 6zM15.07 13H13v8.95c2.39-.24 4.53-1.32 6.13-2.95-2.18-1.21-3.74-3.41-4.06-6zM3.59 17.4c1.72-.83 2.99-2.46 3.32-4.4H2.05c.16 1.61.71 3.11 1.54 4.4zM17.09 13c.33 1.95 1.59 3.57 3.32 4.4.83-1.29 1.38-2.79 1.54-4.4h-4.86zM8.93 13c-.32 2.59-1.88 4.79-4.06 6 1.6 1.63 3.74 2.71 6.13 2.95V13H8.93z',
    },
  ],
```

- Verify each `d` against its package, as Task 7 of slice 5 did for the hub's glyphs, and replace any that differs with the package's own:

```bash
cd "$(mktemp -d)"
npm pack bootstrap-icons@1.11.1 @material-design-icons/svg@0.14.13 >/dev/null
tar xzf bootstrap-icons-1.11.1.tgz && tar xzf material-design-icons-svg-0.14.13.tgz --one-top-level=material
grep -o ' d="[^"]*"' package/icons/{clock,fire,lock-fill}.svg material/package/filled/sports_basketball.svg
```

- Before `ICONS`, add, and use it in `Icon` as `viewBox={VIEW_BOXES[name] ?? '0 0 16 16'}`:

```ts
/** An icon not drawn on Bootstrap's 16-unit box. */
const VIEW_BOXES: Partial<Record<IconName, string>> = {
  'sports-basketball': '0 0 24 24',
};
```

Replace `apps/web/src/components/hub/team-crest.tsx` with:

```tsx
import { crestPath } from './crests';

/**
 * Where a crest is drawn, and so its size and shape. sportbet's
 * x-team-crest always puts it on the .sb-crest plate - white, a hairline,
 * 2px of padding, 6px corners, the artwork contained - so a dark-ink crest
 * stays legible on the dark card (issue #79); each caller sizes it.
 */
export type CrestSize = 'hub' | 'line' | 'row' | 'large';

const PLATE =
  'box-border inline-block shrink-0 border border-crest-plate-line bg-crest-plate p-[2px]';

const SIZES: Readonly<
  Record<CrestSize, { readonly px: number; readonly className: string }>
> = {
  // The hub's .standing-flag: 20px and round, the artwork covering it.
  hub: { px: 20, className: `${PLATE} size-5 rounded-full object-cover` },
  // .upcoming-flag: a scored row of the predictions page.
  line: {
    px: 22,
    className: `${PLATE} size-[22px] rounded-[6px] object-contain`,
  },
  // .pred-flag: an open or locked row.
  row: { px: 26, className: `${PLATE} size-[26px] rounded-[6px] object-contain` },
  // game-single.blade.php's width="52" height="52".
  large: {
    px: 52,
    className: `${PLATE} size-[52px] rounded-[6px] object-contain`,
  },
};

/** sportbet's x-team-crest: the team's crest (TeamLogo), its name as the alternative text. */
export function TeamCrest({
  team,
  size = 'hub',
}: {
  team: string;
  size?: CrestSize;
}) {
  const { px, className } = SIZES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local file drawn at a fixed small size: next/image would add nothing
    <img
      src={crestPath(team)}
      alt={team}
      width={px}
      height={px}
      className={className}
    />
  );
}
```

The hub's existing crest test must still pass: the `hub` class list holds the same utilities as before.

In `apps/web/src/components/shell/shell-paths.ts`, after `PLAYER_HOME`, add:

```ts
/** "Spėjimai": the player's match-result predictions (slice 6). */
export const PREDICTIONS_PATH = '/prediction/results';

/** The list at one round (sportbet's event id), or every round (R-58). */
export const predictionsPathFor = (event: number | 'all'): string =>
  `${PREDICTIONS_PATH}?event=${String(event)}`;

/**
 * Where the autosave posts. sportbet posts to the list's own address; Next
 * cannot serve a page and a handler at one path (slice 6, decision 1).
 */
export const PREDICTION_SAVE_PATH = '/prediction/results/save';

/** One game's prediction page: the reminder mail's link (slice 6c). */
export const predictionGamePath = (game: number): string =>
  `/prediction/game/${String(game)}`;
```

In `apps/web/src/test-setup.ts`, make the router mock answer `useRouter` too:

```ts
// The shell's links ask the router which page is current (nav-link.tsx).
// Every component test is on '/' unless it says otherwise with
// vi.mocked(usePathname).mockReturnValueOnce(...). A component that moves
// or refreshes the page gets a router of spies (vi.mocked(useRouter)).
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  })),
}));
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm typecheck && pnpm lint`
Expected: PASS, the whole component suite included.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): Vilnius days and clocks for the predictions page, its icons (the Material basketball, fire, clock, lock), crest sizes on sportbet's plate, the prediction paths (#20)`.

---

### Task 4 (web-dev): The predictions page's components, the autosave included

The autosave client is built here, beside the row it belongs to. It posts to `PREDICTION_SAVE_PATH`, whose route arrives in Task 9: until then a save answers 404, which the row shows as "Spėjimas neišsaugotas. Bandykite dar kartą.". Nothing is pushed in between.

**Files:**
- Create in `apps/web/src/components/predictions/`, each with its test: `round-menu.tsx`, `points-breakdown.tsx`, `scored-line.tsx`, `save-answer.ts`, `prediction-editor.tsx`, `predictions-view.tsx`

**Shapes these components take.** `Points` are class instances and cannot cross into a client component, so `PredictionsView` turns each `PredictionLine` (Task 2) into plain strings for its rows.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/predictions/save-answer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOT_SAVED, readSaveAnswer } from './save-answer';

describe('readSaveAnswer (the autosave\'s .done and .fail)', () => {
  it('saved: the new panel', () => {
    expect(
      readSaveAnswer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 2.32,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '166.0' },
      }),
    ).toEqual({ kind: 'saved', panel: { home: '50.0', away: '100.0' } });
  });

  it("a field error: the first field's first message, as sportbet shows it", () => {
    expect(
      readSaveAnswer(422, {
        message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
        errors: {
          homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
          awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        },
      }),
    ).toEqual({
      kind: 'refused',
      message: 'Rezultatas turi būti nuo 50 iki 120.',
    });
  });

  it('R-59: a refusal shows its own reason, where sportbet showed "Spėjimas neišsaugotas"', () => {
    expect(
      readSaveAnswer(422, {
        success: false,
        message: 'Šio mačo prognozuoti nebegalima.',
      }),
    ).toEqual({ kind: 'refused', message: 'Šio mačo prognozuoti nebegalima.' });
  });

  it('anything else is "not saved": a 401, a 404, a 500, a body that is not the answer', () => {
    for (const [status, body] of [
      [401, { message: 'Unauthenticated.' }],
      [404, null],
      [500, null],
      [200, { success: true }],
      [422, 'nope'],
    ] as const) {
      expect(readSaveAnswer(status, body)).toEqual({
        kind: 'refused',
        message: NOT_SAVED,
      });
    }
  });
});
```

Create `apps/web/src/components/predictions/round-menu.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { RoundMenu } from './round-menu';

const ROUNDS = [
  { id: 21, name: '1 turas' },
  { id: 22, name: '2 turas' },
];

describe('RoundMenu (results.blade.php)', () => {
  it('lists "Visi etapai" first, then every round, the chosen one selected', () => {
    render(<RoundMenu rounds={ROUNDS} selected={22} />);
    const menu = screen.getByRole('combobox');
    expect(
      [...menu.querySelectorAll('option')].map((option) => option.textContent),
    ).toEqual(['Visi etapai', '1 turas', '2 turas']);
    expect(menu).toHaveProperty('value', '22');
  });

  it('R-58: choosing "Visi etapai" asks for every round, a round for itself', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    });
    render(<RoundMenu rounds={ROUNDS} selected={22} />);
    const menu = screen.getByRole('combobox');
    fireEvent.change(menu, { target: { value: 'all' } });
    expect(push).toHaveBeenLastCalledWith('/prediction/results?event=all');
    fireEvent.change(menu, { target: { value: '21' } });
    expect(push).toHaveBeenLastCalledWith('/prediction/results?event=21');
  });
});
```

Create `apps/web/src/components/predictions/points-breakdown.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PointsBreakdown } from './points-breakdown';

const SCORED = {
  total: '129.5',
  winner: '79.5',
  margin: '50.0',
  bingo: '0.0',
  serija: '20.0',
};

describe('PointsBreakdown (.upcoming-pts and its .sr-pop popover)', () => {
  it('shows the total, and the serija under it with its flame', () => {
    render(<PointsBreakdown points={SCORED} />);
    const shown = screen.getByTestId('line-points');
    expect(shown.textContent).toContain('129.5');
    expect(shown.textContent).toContain('+20.0');
    expect(shown.querySelector('[data-icon="fire"]')).not.toBeNull();
    expect(shown.className).toContain('text-accent');
  });

  it('opens the breakdown on hover: Nugalėtojas, Skirtumas, Tikslus and Serija', () => {
    render(<PointsBreakdown points={SCORED} />);
    fireEvent.mouseEnter(screen.getByTestId('line-points'));
    const pop = screen.getByRole('tooltip');
    expect(
      [...pop.querySelectorAll('div')].map((row) => row.textContent),
    ).toEqual([
      'Nugalėtojas79.5',
      'Skirtumas50.0',
      'Tikslus0.0',
      'Serija+20.0',
    ]);
    fireEvent.mouseLeave(screen.getByTestId('line-points'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('without a serija, no Serija line and no flame', () => {
    render(<PointsBreakdown points={{ ...SCORED, serija: null }} />);
    fireEvent.mouseEnter(screen.getByTestId('line-points'));
    expect(screen.getByRole('tooltip').textContent).not.toContain('Serija');
  });

  it('nothing earned: 0.0, drawn transparent, with no breakdown (upt-empty)', () => {
    render(<PointsBreakdown points={null} />);
    const shown = screen.getByTestId('line-points');
    expect(shown.textContent).toBe('0.0');
    expect(shown.className).toContain('text-transparent');
    fireEvent.mouseEnter(shown);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
```

Create `apps/web/src/components/predictions/scored-line.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoredLine } from './scored-line';

const LINE = {
  game: 7,
  time: '21:00',
  home: 'Zalgiris',
  away: 'Olympiacos',
  result: '88:79',
  predicted: '85:80',
  points: null,
};

describe('ScoredLine (a finished game, as Artimiausios rungtynės draws it)', () => {
  it('the time, both crests, the result and the prediction', () => {
    render(<ScoredLine line={LINE} />);
    const row = screen.getByTestId('scored-line');
    expect(row.textContent).toContain('21:00');
    expect(row.textContent).toContain('88:79');
    expect(row.textContent).toContain('/');
    expect(row.textContent).toContain('85:80');
    expect(screen.getByAltText('Zalgiris')).toBeDefined();
    expect(screen.getByAltText('Olympiacos')).toBeDefined();
  });

  it('team names only from md (d-none d-md-inline)', () => {
    render(<ScoredLine line={LINE} />);
    expect(screen.getByText('Zalgiris').className).toContain('hidden');
    expect(screen.getByText('Zalgiris').className).toContain('md:inline');
  });
});
```

Create `apps/web/src/components/predictions/prediction-editor.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PredictionEditor } from './prediction-editor';

const ROW = {
  game: 10,
  time: '21:00',
  home: 'Olympiacos',
  away: 'Zalgiris',
  predictedHome: '',
  predictedAway: '',
  locked: false,
  panel: { home: '50.0', away: '150.0' },
};

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    async () => Promise.resolve(Response.json(body, { status })),
  );

const homeBox = () => screen.getByLabelText('Olympiacos');
const awayBox = () => screen.getByLabelText('Zalgiris');

/** Types into a box and lets the save's promise settle. */
async function type(box: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(box, { target: { value } });
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PredictionEditor (checkPrediction)', () => {
  it('a half-typed pair is not posted, and shows nothing', async () => {
    const fetch = answer(200, {});
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
  });

  it("both boxes filled: posted as sportbet's fields; saved, the boxes go green and the panel is the answer's", async () => {
    const refresh = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      refresh,
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    });
    const fetch = answer(200, {
      success: true,
      home_odds: 1,
      draw_odds: 2.32,
      away_odds: 0,
      panel: { home: '100.0', away: '50.0', draw: '166.0' },
    });
    vi.stubGlobal('fetch', fetch);
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/prediction/results/save');
    expect(String(init?.body)).toBe(
      'gameID=10&prediction_gameID=10&homeTeamScore=88&awayTeamScore=79',
    );
    expect(homeBox().className).toContain('border-ok');
    expect(refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Koeficientai' }));
    expect(screen.getByTestId('odds-panel').textContent).toContain('+100.0 pt');
    expect(screen.getByTestId('odds-panel').textContent).toContain('+50.0 pt');
  });

  it('both boxes emptied: posted, the boxes back to grey and the odds toggle gone', async () => {
    vi.stubGlobal(
      'fetch',
      answer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 0,
        away_odds: 0,
        panel: { home: '50.0', away: '50.0', draw: '50.0' },
      }),
    );
    render(
      <PredictionEditor
        row={{ ...ROW, predictedHome: '88', predictedAway: '79' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Koeficientai' })).toBeDefined();
    await type(homeBox(), '');
    await type(awayBox(), '');
    expect(homeBox().className).toContain('border-border');
    expect(screen.queryByRole('button', { name: 'Koeficientai' })).toBeNull();
  });

  it("a field error shows the server's message under the row, the boxes red", async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, {
        message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
        errors: {
          homeTeamScore: [
            'Lygiosios negalimos - komandų rezultatai turi skirtis.',
          ],
        },
      }),
    );
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '80');
    await type(awayBox(), '80');
    expect(screen.getByRole('alert').textContent).toBe(
      'Lygiosios negalimos - komandų rezultatai turi skirtis.',
    );
    expect(homeBox().className).toContain('border-bad');
  });

  it('R-59: a refused save shows its reason', async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, { success: false, message: 'Šio mačo prognozuoti nebegalima.' }),
    );
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(screen.getByRole('alert').textContent).toBe(
      'Šio mačo prognozuoti nebegalima.',
    );
  });

  it('a lost connection shows "Spėjimas neišsaugotas. Bandykite dar kartą."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
        async () => Promise.reject(new TypeError('offline')),
      ),
    );
    render(<PredictionEditor row={ROW} />);
    await type(homeBox(), '88');
    await type(awayBox(), '79');
    expect(screen.getByRole('alert').textContent).toBe(
      'Spėjimas neišsaugotas. Bandykite dar kartą.',
    );
  });

  it('a locked row: disabled boxes, dimmed, and nothing to type into', () => {
    render(
      <PredictionEditor
        row={{ ...ROW, locked: true, predictedHome: '88', predictedAway: '79' }}
      />,
    );
    expect(homeBox()).toHaveProperty('disabled', true);
    expect(awayBox()).toHaveProperty('disabled', true);
    expect(screen.getByTestId('prediction-row').firstElementChild?.className).toContain(
      'opacity-50',
    );
  });
});
```

Create `apps/web/src/components/predictions/predictions-view.test.tsx`:

```tsx
import type { PredictionLine } from '@sportbet/db';
import { Points } from '@sportbet/domain';
import { at, roundNo, unwrap } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameOf } from '../../../tests/support/predictions';
import { PredictionsView } from './predictions-view';

const points = (hundredths: number) => unwrap(Points.ofHundredths(hundredths));

const line = (overrides: Partial<PredictionLine>): PredictionLine => ({
  game: gameOf(10),
  round: roundNo(1),
  roundName: '1 turas',
  tipOff: at('2026-10-20T18:00:00Z'),
  home: 'Olympiacos',
  away: 'Zalgiris',
  predicted: { home: null, away: null },
  state: 'open',
  result: null,
  points: null,
  panel: { home: points(5000), away: points(15000), draw: points(15000) },
  ...overrides,
});

const ROUNDS = [
  { id: 21, name: '1 turas' },
  { id: 22, name: '2 turas' },
];

describe('PredictionsView (results.blade.php)', () => {
  it('"Nėra rungtynių." with nothing to show, or no tournament', () => {
    render(<PredictionsView page={null} />);
    expect(screen.getByText('Nėra rungtynių.')).toBeDefined();
  });

  it('the round menu only when the tournament has more than one round', () => {
    const { unmount } = render(
      <PredictionsView page={{ rounds: ROUNDS, selected: 21, lines: [line({})] }} />,
    );
    expect(screen.getByRole('combobox')).toBeDefined();
    unmount();
    render(
      <PredictionsView
        page={{ rounds: [ROUNDS[0] ?? { id: 21, name: '1 turas' }], selected: 21, lines: [line({})] }}
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('a round header, then its Vilnius days, each a card with its games', () => {
    render(
      <PredictionsView
        page={{
          rounds: ROUNDS,
          selected: 'all',
          lines: [
            line({}),
            line({
              game: gameOf(7),
              tipOff: at('2026-10-02T18:00:00Z'),
              state: 'scored',
              result: { home: 88, away: 79 },
              predicted: { home: 85, away: 80 },
              panel: null,
            }),
            line({
              game: gameOf(11),
              round: roundNo(2),
              roundName: '2 turas',
              tipOff: at('2026-10-27T18:00:00Z'),
            }),
          ],
        }}
      />,
    );
    const rounds = screen.getAllByTestId('prediction-round');
    expect(rounds.map((round) => round.firstElementChild?.textContent)).toEqual([
      '1 turas',
      '2 turas',
    ]);
    const days = screen.getAllByTestId('prediction-day');
    expect(days.map((day) => day.firstElementChild?.textContent)).toEqual([
      'Spalio 2',
      'Spalio 20',
      'Spalio 27',
    ]);
    expect(days[0]?.textContent).toContain('88:79');
    expect(screen.getAllByTestId('prediction-row')).toHaveLength(2);
  });

  it("a scored row's points: the total, its serija, and the breakdown as strings", () => {
    render(
      <PredictionsView
        page={{
          rounds: ROUNDS,
          selected: 21,
          lines: [
            line({
              state: 'scored',
              result: { home: 88, away: 79 },
              predicted: { home: 85, away: 80 },
              panel: null,
              points: {
                winner: points(7950),
                margin: points(4400),
                bingo: points(0),
                serija: points(2000),
                full: points(12350),
              },
            }),
          ],
        }}
      />,
    );
    expect(screen.getByTestId('line-points').textContent).toContain('143.5');
    expect(screen.getByTestId('line-points').textContent).toContain('+20.0');
  });
});
```

`gameOf` is a test helper Task 5 adds to `tests/support/predictions.ts`. Add it here already:

```ts
import { gameId, type GameId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';

/** A game id, as the db returns one. */
export const gameOf = (id: number): GameId => unwrap(gameId(id));
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/predictions`
Expected: FAIL, because the components do not exist.

- [ ] **Step 3: Write the code**

Create `apps/web/src/components/predictions/save-answer.ts`:

```ts
import { z } from 'zod';

/** The autosave's text for every failure that is not a refusal (lang/lt.json). */
export const NOT_SAVED = 'Spėjimas neišsaugotas. Bandykite dar kartą.';

const accepted = z.object({
  success: z.literal(true),
  panel: z.object({ home: z.string(), away: z.string() }),
});

const refused = z.object({
  message: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

/** What the row shows after a save. */
export type SaveOutcome =
  | {
      readonly kind: 'saved';
      readonly panel: { readonly home: string; readonly away: string };
    }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * The save's answer as the page shows it (results.blade.php's .done and
 * .fail). Accepted (200): the new odds panel. A 422: the first field's
 * first error, as sportbet shows it; else the refusal's own message (R-59:
 * sportbet showed NOT_SAVED for "Šio mačo prognozuoti nebegalima." and
 * "Šios prognozės išsaugoti negalima."). Anything else - a lost
 * connection, a 401, a 404, a 500, a body that is not the answer - NOT_SAVED.
 */
export function readSaveAnswer(status: number, body: unknown): SaveOutcome {
  const failed = { kind: 'refused', message: NOT_SAVED } as const;
  if (status === 200) {
    const answer = accepted.safeParse(body);
    return answer.success
      ? { kind: 'saved', panel: answer.data.panel }
      : failed;
  }
  if (status !== 422) return failed;
  const answer = refused.safeParse(body);
  if (!answer.success) return failed;
  const errors = answer.data.errors ?? {};
  const first = Object.values(errors)[0]?.[0] ?? answer.data.message;
  return first === undefined ? failed : { kind: 'refused', message: first };
}
```

Create `apps/web/src/components/predictions/round-menu.tsx`:

```tsx
'use client';

import type { PredictionsMenuRound } from '@sportbet/db';
import { useRouter } from 'next/navigation';
import { predictionsPathFor } from '../shell/shell-paths';

/**
 * The page's round menu (results.blade.php's select): "Visi etapai", then
 * each round. Choosing one opens the list at it; "Visi etapai" opens every
 * round (R-58 - sportbet's sent no round, so it fell back to the current).
 */
export function RoundMenu({
  rounds,
  selected,
}: {
  rounds: readonly PredictionsMenuRound[];
  selected: number | 'all';
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Etapas"
      value={String(selected)}
      onChange={(event) => {
        const value = event.target.value;
        router.push(predictionsPathFor(value === 'all' ? 'all' : Number(value)));
      }}
      className="w-auto rounded-[8px] border border-border bg-card px-2 py-1 text-[0.78rem] text-text"
    >
      <option value="all">Visi etapai</option>
      {rounds.map(({ id, name }) => (
        <option key={id} value={String(id)}>
          {name}
        </option>
      ))}
    </select>
  );
}
```

Create `apps/web/src/components/predictions/points-breakdown.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Icon } from '../shell/icon';

/** A scored row's points as the page prints them, one decimal each (onePlace). */
export interface LinePointsText {
  readonly total: string;
  readonly winner: string;
  readonly margin: string;
  readonly bingo: string;
  /** Null when the row earned no serija. */
  readonly serija: string | null;
}

/**
 * .upcoming-pts: the row's total (full points + serija) in the accent
 * colour, its serija under it with sportbet's flame; on hover, the
 * .sr-pop breakdown - Nugalėtojas, Skirtumas, Tikslus, and Serija when
 * there is one. A row that earned nothing prints 0.0 in transparent ink
 * (.upt-empty) and opens nothing.
 */
export function PointsBreakdown({ points }: { points: LinePointsText | null }) {
  const [open, setOpen] = useState(false);
  const scored = points !== null;
  return (
    <span
      data-testid="line-points"
      tabIndex={scored ? 0 : undefined}
      onMouseEnter={() => {
        setOpen(scored);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(scored);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      className={`relative flex min-w-9 shrink-0 flex-col items-end text-right text-[0.78rem] font-bold ${scored ? 'text-accent' : 'text-transparent'}`}
    >
      {points?.total ?? '0.0'}
      {points?.serija === null || points === null ? null : (
        <span className="text-[0.62rem] leading-none font-bold text-accent">
          <Icon name="fire" />+{points.serija}
        </span>
      )}
      {open && points !== null ? (
        <span
          role="tooltip"
          className="absolute top-1/2 right-full z-10 mr-2 min-w-[160px] -translate-y-1/2 rounded-[6px] border border-border bg-card p-2 text-left text-[0.78rem] font-normal text-text shadow-[0_2px_8px_var(--color-shadow-strong)]"
        >
          <BreakdownRow label="Nugalėtojas" value={points.winner} />
          <BreakdownRow label="Skirtumas" value={points.margin} />
          <BreakdownRow label="Tikslus" value={points.bingo} />
          {points.serija === null ? null : (
            <BreakdownRow label="Serija" value={`+${points.serija}`} />
          )}
        </span>
      ) : null}
    </span>
  );
}

/** .sr-pop-row */
function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-[2px]">
      <span className="text-muted">{label}</span>
      <strong className="font-bold">{value}</strong>
    </div>
  );
}
```

Create `apps/web/src/components/predictions/scored-line.tsx`:

```tsx
import { TeamCrest } from '../hub/team-crest';
import { PointsBreakdown, type LinePointsText } from './points-breakdown';

/** A finished game's row, in strings. */
export interface ScoredLineText {
  readonly game: number;
  readonly time: string;
  readonly home: string;
  readonly away: string;
  /** "88:79" */
  readonly result: string;
  /** "85:80", with "?" for a blank side. */
  readonly predicted: string;
  readonly points: LinePointsText | null;
}

const TEAM_NAME =
  'hidden truncate text-[0.82rem] font-medium whitespace-nowrap md:inline';

/**
 * A finished game, as sportbet's results page draws it - the same row as
 * "Artimiausios rungtynės" (.upcoming-row): the time, the crests (names from
 * md), the result over the prediction, and the points.
 */
export function ScoredLine({ line }: { line: ScoredLineText }) {
  return (
    <div
      data-testid="scored-line"
      className="grid grid-cols-[52px_1fr_auto_1fr_auto] items-center gap-1.5 rounded-[6px] border-b border-border py-[7px] text-text last:border-b-0 hover:bg-surface-2"
    >
      <span className="text-[0.72rem] leading-[1.3] whitespace-nowrap text-muted">
        {line.time}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <TeamCrest team={line.home} size="line" />
        <span className={TEAM_NAME}>{line.home}</span>
      </span>
      <span className="flex min-w-[72px] items-center justify-center gap-[3px] whitespace-nowrap">
        <span className="text-[0.82rem] font-bold text-text">{line.result}</span>
        <span className="text-[0.72rem] text-muted">/</span>
        <span className="text-[0.78rem] text-muted">{line.predicted}</span>
      </span>
      <span className="flex min-w-0 items-center justify-start gap-1.5">
        <span className={TEAM_NAME}>{line.away}</span>
        <TeamCrest team={line.away} size="line" />
      </span>
      <PointsBreakdown points={line.points} />
    </div>
  );
}
```

Create `apps/web/src/components/predictions/prediction-editor.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TeamCrest } from '../hub/team-crest';
import { Icon } from '../shell/icon';
import { PREDICTION_SAVE_PATH } from '../shell/shell-paths';
import { NOT_SAVED, readSaveAnswer, type SaveOutcome } from './save-answer';

/** An open or locked row, in strings. */
export interface EditorRow {
  readonly game: number;
  readonly time: string;
  readonly home: string;
  readonly away: string;
  readonly predictedHome: string;
  readonly predictedAway: string;
  readonly locked: boolean;
  /** "+X pt" per side, from the votes now; no draw column (Euroleague). */
  readonly panel: { readonly home: string; readonly away: string };
}

/** A box's look (.pred-score and its --saved, --cleared, -error, -locked states). */
type Mark = 'none' | 'saved' | 'cleared' | 'error';

const BOX =
  'w-[42px] rounded-[8px] border bg-surface-2 px-[2px] py-[2px] text-center text-[0.95rem] leading-[1.3] font-bold tabular-nums';

const MARK: Readonly<Record<Mark, string>> = {
  none: 'border-border text-text',
  saved: 'border-ok text-text',
  cleared: 'border-border text-text',
  error: 'border-bad text-text shadow-[0_0_0_2px_var(--color-bad-tint)]',
};

const LOCKED_BOX = 'cursor-not-allowed border-border text-muted';

const TEAM_NAME =
  'max-w-[140px] truncate text-[0.85rem] whitespace-nowrap max-md:portrait:hidden';

/** Posts one pair as sportbet's autosave does (its field names), and reads the answer. */
async function post(game: number, home: string, away: string): Promise<SaveOutcome> {
  try {
    const response = await fetch(PREDICTION_SAVE_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        gameID: String(game),
        prediction_gameID: String(game),
        homeTeamScore: home,
        awayTeamScore: away,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readSaveAnswer(response.status, body);
  } catch {
    return { kind: 'refused', message: NOT_SAVED };
  }
}

/**
 * An unscored game's row (.pred-game) and its odds panel. Open: two boxes
 * that save the pair as it is typed (checkPrediction) - only when both
 * are filled or both are empty, so a half-typed pair is never posted; the
 * server checks it (decision 4) and its message shows under the row; a
 * save turns the boxes green, a clear grey, and refreshes the page's shell
 * so the badge follows (decision 5). Locked: the boxes disabled, the row
 * dimmed. The odds toggle shows once both scores are saved.
 */
export function PredictionEditor({ row }: { row: EditorRow }) {
  const router = useRouter();
  const [home, setHome] = useState(row.predictedHome);
  const [away, setAway] = useState(row.predictedAway);
  const [mark, setMark] = useState<Mark>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState(row.panel);
  const [answered, setAnswered] = useState(
    row.predictedHome !== '' && row.predictedAway !== '',
  );
  const [oddsOpen, setOddsOpen] = useState(false);

  const changed = (nextHome: string, nextAway: string) => {
    setHome(nextHome);
    setAway(nextAway);
    setMark('none');
    setMessage(null);
    const pair = [nextHome.trim(), nextAway.trim()] as const;
    const both = pair[0] !== '' && pair[1] !== '';
    const neither = pair[0] === '' && pair[1] === '';
    if (!both && !neither) return;
    void post(row.game, pair[0], pair[1]).then((outcome) => {
      if (outcome.kind === 'refused') {
        setMark('error');
        setMessage(outcome.message);
        return;
      }
      setMark(both ? 'saved' : 'cleared');
      setPanel(outcome.panel);
      setAnswered(both);
      if (!both) setOddsOpen(false);
      router.refresh();
    });
  };

  const box = row.locked ? `${BOX} ${LOCKED_BOX}` : `${BOX} ${MARK[mark]}`;
  return (
    <div data-testid="prediction-row" data-game={row.game}>
      <div
        className={`grid grid-cols-[52px_1fr_auto_1fr_36px] items-center gap-1.5 py-[7px] ${row.locked ? 'opacity-50' : ''}`}
      >
        <span className="text-[0.8rem] leading-none font-semibold tracking-[0.3px] text-muted">
          {row.time}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <TeamCrest team={row.home} size="row" />
          <span className={TEAM_NAME}>{row.home}</span>
        </div>
        <div className="flex items-center gap-[3px] px-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            aria-label={row.home}
            disabled={row.locked}
            value={home}
            onChange={(event) => {
              changed(event.target.value, away);
            }}
            className={box}
          />
          <span className="text-[0.95rem] leading-none font-bold text-muted">
            :
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            aria-label={row.away}
            disabled={row.locked}
            value={away}
            onChange={(event) => {
              changed(home, event.target.value);
            }}
            className={box}
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={TEAM_NAME}>{row.away}</span>
          <TeamCrest team={row.away} size="row" />
        </div>
        <span className="flex justify-end">
          {answered ? (
            <button
              type="button"
              aria-label="Koeficientai"
              aria-expanded={oddsOpen}
              onClick={() => {
                setOddsOpen(!oddsOpen);
              }}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-[4px] border-none bg-transparent py-[2px] pr-1.5 pl-[2px] text-[0.85rem] transition-colors hover:text-accent ${oddsOpen ? 'text-accent' : 'text-muted'}`}
            >
              <Icon name="graph-up-arrow" />
            </button>
          ) : null}
        </span>
      </div>
      <div
        role="alert"
        hidden={message === null}
        className="px-1.5 pb-1.5 text-center text-[0.72rem] font-semibold text-bad"
      >
        {message}
      </div>
      <div
        data-testid="odds-panel"
        hidden={!oddsOpen}
        className="mt-1 flex justify-around gap-1 border-t border-border pt-1.5 pb-2"
      >
        <OddsColumn label={row.home} points={panel.home} />
        <OddsColumn label={row.away} points={panel.away} />
      </div>
    </div>
  );
}

/** .pred-odds-col: a side's name and what a right call on it pays now. */
function OddsColumn({ label, points }: { label: string; points: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-[2px] text-center">
      <span className="max-w-[90px] truncate text-[0.68rem] whitespace-nowrap text-muted">
        {label}
      </span>
      <span className="text-[0.8rem] font-bold text-accent">+{points} pt</span>
    </div>
  );
}
```

Create `apps/web/src/components/predictions/predictions-view.tsx`:

```tsx
import type { PredictionLine, PredictionsPage } from '@sportbet/db';
import { groupPredictionLines, onePlace } from '@sportbet/domain';
import {
  dayHeader,
  vilniusClock,
  vilniusDate,
} from '../format/vilnius-time';
import { PredictionEditor } from './prediction-editor';
import { RoundMenu } from './round-menu';
import { ScoredLine } from './scored-line';

const side = (score: number | null): string =>
  score === null ? '' : String(score);

/** A scored row's points as strings: full + serija for the total (results.blade.php's $totalPts). */
function pointsText(line: PredictionLine) {
  const { points } = line;
  if (points === null) return null;
  return {
    total: onePlace(points.full.hundredths + points.serija.hundredths),
    winner: onePlace(points.winner.hundredths),
    margin: onePlace(points.margin.hundredths),
    bingo: onePlace(points.bingo.hundredths),
    serija: points.serija.isPositive() ? onePlace(points.serija.hundredths) : null,
  };
}

/** One row: a finished game, or one still to come or locked. */
function Line({ line }: { line: PredictionLine }) {
  const time = vilniusClock(line.tipOff);
  if (line.state === 'scored' && line.result !== null) {
    return (
      <ScoredLine
        line={{
          game: line.game,
          time,
          home: line.home,
          away: line.away,
          result: `${String(line.result.home)}:${String(line.result.away)}`,
          predicted: `${line.predicted.home === null ? '?' : String(line.predicted.home)}:${line.predicted.away === null ? '?' : String(line.predicted.away)}`,
          points: pointsText(line),
        }}
      />
    );
  }
  const panel = line.panel;
  return (
    <PredictionEditor
      row={{
        game: line.game,
        time,
        home: line.home,
        away: line.away,
        predictedHome: side(line.predicted.home),
        predictedAway: side(line.predicted.away),
        locked: line.state === 'locked',
        panel: {
          home: panel === null ? '0.0' : onePlace(panel.home.hundredths),
          away: panel === null ? '0.0' : onePlace(panel.away.hundredths),
        },
      }}
    />
  );
}

/**
 * sportbet's predictions page (results.blade.php): the round menu when the
 * tournament has more than one round; each round's name over its Vilnius
 * days, two cards a row from 600px (.pred-event-groups); "Nėra rungtynių."
 * when there is nothing to show - or no tournament (`page` null).
 */
export function PredictionsView({ page }: { page: PredictionsPage | null }) {
  const groups =
    page === null ? [] : groupPredictionLines(page.lines, vilniusDate);
  return (
    <>
      {page !== null && page.rounds.length > 1 ? (
        <div className="mb-2 flex justify-end">
          <RoundMenu rounds={page.rounds} selected={page.selected} />
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p className="py-6 text-center text-muted">Nėra rungtynių.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.round} data-testid="prediction-round">
              <div className="mb-2.5 flex items-center justify-between border-b-2 border-accent pb-1 text-[0.8rem] font-bold tracking-[1px] text-accent uppercase">
                {group.days[0]?.lines[0]?.roundName}
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[600px]:grid-cols-2">
                {group.days.map((day) => (
                  <div
                    key={day.day}
                    data-testid="prediction-day"
                    className="rounded-[8px] border border-border bg-card px-3 py-2.5"
                  >
                    <div className="mb-[5px] flex items-center justify-between border-b border-border pb-[7px] text-[0.78rem] font-semibold text-muted">
                      {dayHeader(day.day)}
                    </div>
                    {day.lines.map((line) => (
                      <Line key={line.game} line={line} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
```

`.pred-game + .pred-game` draws a line between consecutive editable rows; add `[&+&]:border-t [&+&]:border-border` to the `prediction-row` wrapper's class when the look sign-off shows it missing.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm typecheck && pnpm lint`
Expected: PASS. `apps/web/src/token-guard.test.ts` must pass: every colour is a token utility (`border-ok`, `border-bad`, `text-accent`, `var(--color-bad-tint)`, `var(--color-shadow-strong)`).

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): the predictions page's components - the round menu with "Visi etapai" (R-58), scored rows and their points popover, the open row's autosave and odds panel, a refusal's own reason (R-59) (#20)`.

---

### Task 5 (web-dev): The page, "Spėjimai" and its badge, and sign-in back to the prediction pages **(sensitive)**

**Files:**
- Create: `apps/web/src/app/prediction/results/page.tsx`
- Modify: `apps/web/src/components/shell/nav-entries.ts`, `apps/web/src/components/shell/nav-entries.test.ts`
- Modify: `apps/web/src/server/request-context.ts`, `apps/web/src/server/shell-for.ts`, `apps/web/src/server/shell-for.test.ts`
- Modify: `apps/web/src/server/sign-in/return-path.ts`, `apps/web/src/server/sign-in/return-path.test.ts`
- Modify: `apps/web/tests/support/predictions.ts` (Task 4 created it with `gameOf`)
- Create: `apps/web/tests/feature/predictions.test.ts`
- Modify: `apps/web/tests/feature/sign-in.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/server/sign-in/return-path.test.ts`, add a `describe` (import `guardedReturnPath` if the file does not yet):

```ts
describe('guardedReturnPath: the prediction pages (slice 6)', () => {
  it('keeps the list, its round, every round, and one game', () => {
    for (const path of [
      '/prediction/results',
      '/prediction/results?event=21',
      '/prediction/results?event=all',
      '/prediction/game/9001',
    ]) {
      expect(guardedReturnPath(path)).toBe(path);
    }
  });

  it('refuses any other shape of them', () => {
    for (const path of [
      '/prediction/results/',
      '/prediction/results/save',
      '/prediction/results?event=0',
      '/prediction/results?event=21&x=1',
      '/prediction/results?other=1',
      '/prediction/results#top',
      '/prediction/game/0',
      '/prediction/game/01',
      '/prediction/game/abc',
      '/prediction/game/9001/',
      '/prediction/game/9001?x=1',
      '/prediction/game/12345678901',
      '//prediction/results',
      '/prediction/./results',
      '/prediction/%72esults',
    ]) {
      expect(guardedReturnPath(path)).toBeNull();
    }
  });
});
```

In `apps/web/src/components/shell/nav-entries.test.ts`, replace the first test with:

```ts
  it('lists Turnyrai for a guest on the rail, and Spėjimai for a player with its badge (slice 6)', () => {
    expect(NAV_ENTRIES).toEqual([
      {
        label: 'Turnyrai',
        href: '/',
        icon: 'globe2',
        audience: 'guest',
        group: 'main',
        surfaces: ['rail'],
      },
      {
        label: 'Spėjimai',
        href: '/prediction/results',
        icon: 'sports-basketball',
        audience: 'player',
        group: 'main',
        surfaces: ['rail', 'menu', 'tabs'],
        badge: 'results',
      },
    ]);
  });
```

Run the component suite after the code. A shell test that counts a player's entries as none (4a and 4b had no player entry) now sees "Spėjimai": update each such expectation to include it, and name the test after what it now checks.

In `apps/web/src/server/shell-for.test.ts`, add `missingResults: 0` to the `tournament` of the second test's context, and add:

```ts
  it("shows the Spėjimai badge with the current round's unanswered open games (MissingPredictions)", () => {
    const context: RequestContext = {
      player: JONAS,
      tournament: {
        tournament: TOURNAMENT,
        currentRound: roundNo(1),
        started: true,
        standingsLocked: false,
        nav: { survival: false, summary: true, survivalSummary: true },
        missingResults: 3,
      },
    };
    expect(shellViewFor(context).badges).toEqual({
      results: 3,
      standings: 0,
      survival: 0,
      invites: 0,
    });
  });
```

Replace `apps/web/tests/support/predictions.ts` with:

```ts
import type { Db } from '@sportbet/db';
import { gameId, type GameId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { JONAS_ACCOUNT } from './accounts';
import type { Browser } from './browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from './hub';
import {
  saveTournamentWithGames,
  type PlannedTournament,
} from './registration';

/** A game id, as the db returns one. */
export const gameOf = (id: number): GameId => unwrap(gameId(id));

/** What the tests ask Postgres directly: the test database's pool. */
export interface Sql {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** `plan`'s two games (saveTournamentWithGames): round 1's and round 5's. */
export const gamesOf = (plan: PlannedTournament) =>
  [plan.id * 10 + 1, plan.id * 10 + 5] as const;

/**
 * Saves `plan` (each a tournament with two games, registration.ts) and
 * makes Jonas (player 1) one of its players with a blank row per game, as
 * joining writes.
 */
export async function savePlaying(
  db: Db,
  sql: Sql,
  ...plans: readonly PlannedTournament[]
): Promise<void> {
  for (const plan of plans) {
    await saveTournamentWithGames(db, plan);
    await withProfile(db, plan.tournament.slug, ACTIVE_PROFILE);
  }
  for (const plan of plans) {
    await sql.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values ($1, 1, false, false, 0) on conflict do nothing',
      [plan.id],
    );
    for (const game of gamesOf(plan)) {
      await sql.query(
        "insert into match_predictions (player_id, game_id, origin) values (1, $1, 'real') on conflict do nothing",
        [game],
      );
    }
  }
}

/** Jonas, signed in, playing `plans` (savePlaying). */
export async function jonasPlaying(
  db: Db,
  sql: Sql,
  baseUrl: string,
  ...plans: readonly PlannedTournament[]
): Promise<Browser> {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
  await savePlaying(db, sql, ...plans);
  return browser;
}
```

Create `apps/web/tests/feature/predictions.test.ts`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { Browser, documentOf, setCookieFor, type Page } from '../support/browser';
import { gamesOf, jonasPlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// The predictions page (slice 6a, #20): getPredictionResultsUser, the
// "Spėjimai" entry and its badge, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

/** The games of the page's open and locked rows, in order. */
const rowsOn = (page: Page) =>
  [
    ...documentOf(page).querySelectorAll('[data-testid="prediction-row"]'),
  ].map((row) => Number(row.getAttribute('data-game')));

describe('/prediction/results (getPredictionResultsUser)', () => {
  it('a player sees their rows of the current round, with the round menu', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.get('/prediction/results');
    expect(page.status).toBe(200);
    const [first] = gamesOf(SOONER);
    expect(rowsOn(page)).toEqual([first]);
    const menu = documentOf(page).querySelector('select');
    expect(
      [...(menu?.querySelectorAll('option') ?? [])].map((option) => option.textContent),
    ).toEqual(['Visi etapai', '1 turas', '5 turas']);
  });

  it('R-58: ?event=all shows every round; ?event=<id> one; an unknown id nothing', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    expect(rowsOn(await browser.get('/prediction/results?event=all'))).toEqual([
      ...gamesOf(SOONER),
    ]);
    expect(rowsOn(await browser.get('/prediction/results?event=415'))).toEqual([
      415,
    ]);
    const unknown = await browser.get('/prediction/results?event=999');
    expect(rowsOn(unknown)).toEqual([]);
    expect(unknown.html).toContain('Nėra rungtynių.');
  });

  it("a started game's row is locked: its boxes disabled", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const page = await browser.get('/prediction/results?event=all');
    const boxes = documentOf(page).querySelectorAll('[data-testid="prediction-row"] input');
    expect(boxes.length).toBe(4);
    for (const box of boxes) expect(box.hasAttribute('disabled')).toBe(true);
  });

  it('a player in no tournament sees "Nėra rungtynių."', async () => {
    const browser = await jonasPlaying(db, client, baseUrl);
    expect((await browser.get('/prediction/results')).html).toContain(
      'Nėra rungtynių.',
    );
  });

  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.60').get(
      '/prediction/results?event=all',
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent('/prediction/results?event=all')}`,
    );
  });
});

describe('"Spėjimai" and its badge (MissingPredictions)', () => {
  const badge = async (browser: Browser) =>
    documentOf(await browser.get('/'))
      .querySelector('[data-testid="rail"] [data-missing="results"]')
      ?.hasAttribute('hidden');

  it("a player's rail links to the page, its badge shown while the current round has an open game unanswered", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.get('/');
    expect(
      documentOf(page).querySelector('[data-testid="rail"] a[href="/prediction/results"]')
        ?.textContent,
    ).toContain('Spėjimai');
    expect(await badge(browser)).toBe(false);
    const [first] = gamesOf(SOONER);
    await client.query(
      'update match_predictions set home = 88, away = 79 where player_id = 1 and game_id = $1',
      [first],
    );
    expect(await badge(browser)).toBe(true);
  });

  it('no badge when the current round has no open game: every game of CLOSED has started', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    expect(await badge(browser)).toBe(true);
  });
});

describe('sign-in back to the prediction pages (the return path)', () => {
  it('/login keeps /prediction/results?event=all and /prediction/game/<id>', async () => {
    for (const path of ['/prediction/results?event=all', '/prediction/game/411']) {
      const page = await new Browser(baseUrl, '192.0.2.61').get(
        `/login?intended=${encodeURIComponent(path)}`,
      );
      expect(setCookieFor(page, '__Host-sb_return')).toContain(
        `__Host-sb_return=${encodeURIComponent(path)};`,
      );
    }
  });
});
```

In `apps/web/tests/feature/sign-in.test.ts`, in the describe holding the return path's refusals (security review M1), add `'/prediction/results/save'` and `'/prediction/game/0'` to the list of paths not kept.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server src/components/shell` then `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/predictions.test.ts`
Expected: FAIL. There is no page, no entry, no `missingResults`, and the return path refuses the new shapes.

- [ ] **Step 3: Write the code**

In `apps/web/src/server/sign-in/return-path.ts`, replace `GUARDED_PAGE` and `guardedReturnPath` with:

```ts
/** The tournament registration form: a guarded page, its slug checked too. */
const REGISTER_FORM = /^\/tournament\/([^/?#]+)\/register$/u;

/**
 * The prediction pages, behind sportbet's `auth`: the list, at one round
 * (its id) or every round (R-58), and one game - the reminder mail's link.
 * Ids are whole numbers from 1, at most ten digits; no other query.
 */
const PREDICTION_PAGES: readonly RegExp[] = [
  /^\/prediction\/results(?:\?event=(?:all|[1-9]\d{0,9}))?$/u,
  /^\/prediction\/game\/[1-9]\d{0,9}$/u,
];

/** A tournament's registration form: the page a guest is sent back to, in REGISTER_FORM's shape. */
export const registerPath = (slug: string): string =>
  `/tournament/${slug}/register`;

function isGuardedPage(typed: string): boolean {
  const slug = REGISTER_FORM.exec(typed)?.[1];
  if (slug !== undefined) return slugSchema.safeParse(slug).success;
  return PREDICTION_PAGES.some((page) => page.test(typed));
}

/**
 * Security review M1: the return path is only the shape of a page that
 * sends a guest to sign in - the tournament registration form
 * (`/tournament/<slug>/register`, the slug valid) or a prediction page
 * (slice 6) - so a link from another site cannot make sign-in end anywhere
 * else on this one (an action such as /tournaments/exit or the save
 * included). safeReturnPath checks it again behind that, and must keep it
 * as typed.
 */
export function guardedReturnPath(
  typed: string | null | undefined,
): string | null {
  if (typed === null || typed === undefined) return null;
  if (!isGuardedPage(typed)) return null;
  return safeReturnPath(typed) === typed ? typed : null;
}
```

In `apps/web/src/components/shell/nav-entries.ts`, import `PREDICTIONS_PATH` from `./shell-paths`, and add after "Turnyrai":

```ts
  {
    // sportbet's $matchIcon: the format's ball (config/help.php) - the
    // Euroleague's, the one format this app plays (decision 11).
    label: 'Spėjimai',
    href: PREDICTIONS_PATH,
    icon: 'sports-basketball',
    audience: 'player',
    group: 'main',
    surfaces: ['rail', 'menu', 'tabs'],
    badge: 'results',
  },
```

In `apps/web/src/server/request-context.ts`:
- import `loadMissingResultPredictions` from `@sportbet/db`;
- add to `ContextTournament`:

```ts
  /** The "Spėjimai" badge: the current round's open games the player has not answered (MissingPredictions). */
  readonly missingResults: number;
```

- replace the end of `requestContext` from `const season = await loadSeason(db, tournament);` with:

```ts
  const season = await loadSeason(db, tournament);
  const at = now();
  return {
    player,
    tournament: {
      tournament,
      ...tournamentContext({
        season,
        survival: tournament.survival,
        now: at,
        rules: ruledRules,
      }),
      missingResults: await loadMissingResultPredictions(db, {
        player: signedIn.player,
        tournament,
        season,
        now: at,
        rules: ruledRules,
      }),
    },
  };
```

In `apps/web/src/server/shell-for.ts`, replace `badges: guestView().badges,` with:

```ts
    badges: {
      ...guestView().badges,
      results: tournament?.missingResults ?? 0,
    },
```

and change the doc comment's last sentence to: "Badges are slice 6's: "Spėjimai" counts the current round's unanswered open games; standings, survival and invites wait for their slices."

Create `apps/web/src/app/prediction/results/page.tsx`:

```tsx
import { loadPredictionsPage } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PredictionsView } from '../../../components/predictions/predictions-view';
import { PREDICTIONS_PATH } from '../../../components/shell/shell-paths';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';

/**
 * PredictionResultController::getPredictionResultsUser, behind sportbet's
 * `auth`: a guest goes to sign in and comes back here (the return path);
 * a player sees their rows of the request's tournament (R-28) at
 * `?event=` - a round's id, "all" (R-58), or the current round.
 */
export default async function PredictionResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  await connection();
  const { event } = await searchParams;
  const requested = typeof event === 'string' ? event : null;
  const context = await requestContext();
  if (context.player === null) {
    const here =
      requested === null
        ? PREDICTIONS_PATH
        : `${PREDICTIONS_PATH}?event=${encodeURIComponent(requested)}`;
    redirect(`/login?intended=${encodeURIComponent(here)}`);
  }
  const page =
    context.tournament === null
      ? null
      : await loadPredictionsPage(getDb(), {
          player: context.player.id,
          tournament: context.tournament.tournament,
          requested,
          now: now(),
          rules: ruledRules,
        });
  return <PredictionsView page={page} />;
}
```

A `?event=` the guarded shape refuses (say `?event=abc`) is forgotten at `/login`, and sign-in then ends at `PLAYER_HOME`. That is the hardened check doing its job.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm build && pnpm test:feature && pnpm typecheck && pnpm lint`
Expected: PASS: the component suite, the whole feature suite (`routes.test.ts`'s shell checks included) and the new file.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): /prediction/results - the player's rows by round and Vilnius day; "Spėjimai" with its badge (MissingPredictions); sign-in back to the prediction pages, each shape guarded (#20)`.

---

### Task 6 (lead): The end of 6a - the whole check and a review pass

- [ ] Run the whole check of Task 15 Step 1. Then:
  - Have the architect review `<gate>..HEAD` (`mp-code-review`).
  - Have qa compare the page with sportbet's results.blade.php at 1280 and 390. Use `pnpm --filter @sportbet/web look:signoff` against a local `next start` with the staging seed and the owner's account signed in.
  - Have the security reviewer review Task 5's return path.
- [ ] Fix what they confirm, each fix its own commit ending with the trailer and `#20`.

---

## Part 6b: saving a prediction

### Task 7 (backend-dev): A save's rules - the form, the row, the lock, and who is switched back on (R-57)

**Files:**
- Create: `packages/domain/src/prediction/prediction-form.ts`, `packages/domain/src/prediction/prediction-form.test.ts`
- Create: `packages/domain/src/prediction/predict-match.ts`, `packages/domain/src/prediction/predict-match.test.ts`
- Modify: `packages/domain/src/rules/rule-set.ts`, `packages/domain/src/rules/rule-set.test.ts`
- Modify: `tools/migrate/src/parity/rulings.ts`, `tools/migrate/src/parity/rulings.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/domain/src/prediction/prediction-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { predictionFormEntry } from './prediction-form';

// UpdatePredictionResultRequest: the posted pair, after Laravel's
// TrimStrings and ConvertEmptyStringsToNull, in its order - each field's
// `integer|min:50|max:120`, then (only when those pass) both or neither,
// then not level.

describe('predictionFormEntry (UpdatePredictionResultRequest)', () => {
  it('form: two whole scores from 50 to 120, or neither', () => {
    expect(predictionFormEntry({ home: '88', away: '79' })).toEqual({
      ok: true,
      value: { home: 88, away: 79 },
    });
    expect(predictionFormEntry({ home: '', away: '' })).toEqual({
      ok: true,
      value: { home: null, away: null },
    });
    expect(predictionFormEntry({ home: '50', away: '120' })).toEqual({
      ok: true,
      value: { home: 50, away: 120 },
    });
  });

  it("form: a side that is no whole number, or outside 50-120, is that field's range error - both fields at once", () => {
    for (const bad of ['49', '121', '8.5', 'abc', '007', '1e2', '-80']) {
      expect(predictionFormEntry({ home: bad, away: '79' })).toEqual({
        ok: false,
        errors: [{ field: 'home', problem: 'out-of-range' }],
      });
    }
    expect(predictionFormEntry({ home: '130', away: '20' })).toEqual({
      ok: false,
      errors: [
        { field: 'home', problem: 'out-of-range' },
        { field: 'away', problem: 'out-of-range' },
      ],
    });
  });

  it("form: Laravel's integer takes a sign: +88 is 88", () => {
    expect(predictionFormEntry({ home: '+88', away: '79' })).toEqual({
      ok: true,
      value: { home: 88, away: 79 },
    });
  });

  it('form (R-15): one side alone is "both scores" on the blank one', () => {
    expect(predictionFormEntry({ home: '88', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'away', problem: 'half-typed' }],
    });
    expect(predictionFormEntry({ home: '', away: '79' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'half-typed' }],
    });
  });

  it('form: a level pair is the home field\'s "no draws"', () => {
    expect(predictionFormEntry({ home: '80', away: '80' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'level' }],
    });
  });

  it('form: a range error stops before both-or-neither, as Laravel\'s after() hook does', () => {
    expect(predictionFormEntry({ home: '200', away: '' })).toEqual({
      ok: false,
      errors: [{ field: 'home', problem: 'out-of-range' }],
    });
  });
});
```

Create `packages/domain/src/prediction/predict-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  player,
  tournamentKey,
  unwrap,
} from '../testing';
import { MatchPrediction } from './match-prediction';
import { predictMatch, statusAfterSave } from './predict-match';

const JONAS = player('1');
const EUROLEAGUE = tournamentKey('41');
const OTHER = tournamentKey('42');
const NOW = at('2026-10-15T12:00:00Z');

const OPEN = makeGame({
  id: 10,
  round: 1,
  home: '11',
  away: '12',
  tipOff: '2026-10-20T18:00:00Z',
});
const STARTED = makeGame({
  id: 9,
  round: 1,
  home: '13',
  away: '14',
  tipOff: '2026-10-10T17:30:00Z',
});

const row = (game: number, home: number | null = null, away: number | null = null) =>
  unwrap(
    MatchPrediction.stored({
      player: JONAS,
      game: gameNo(game),
      home,
      away,
      origin: 'real',
      filledInAt: null,
    }),
  );

describe('predictMatch (updatePredictionResultUser)', () => {
  it('save: the player\'s own row of an open game takes the pair, as a real prediction', () => {
    const saved = unwrap(
      predictMatch({
        target: { prediction: row(10), game: OPEN },
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(saved.prediction).toMatchObject({
      home: 88,
      away: 79,
      origin: 'real',
    });
  });

  it('save (issue 254): no row of the player\'s, or a row of another game, is "not yours"', () => {
    expect(
      predictMatch({
        target: null,
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-yours' });
    expect(
      predictMatch({
        target: { prediction: row(9), game: OPEN },
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'not-yours' });
  });

  it('save (LR-1): a game past its tip-off is closed, whatever the pair', () => {
    for (const entry of [
      { home: 88, away: 79 },
      { home: null, away: null },
    ]) {
      expect(
        predictMatch({
          target: { prediction: row(9), game: STARTED },
          entry,
          now: NOW,
          rules: ruledRules,
        }),
      ).toEqual({ ok: false, refusal: 'closed' });
    }
  });

  it("save: MatchPrediction.enter's refusals stand behind the form check", () => {
    expect(
      predictMatch({
        target: { prediction: row(10), game: OPEN },
        entry: { home: 80, away: 80 },
        now: NOW,
        rules: ruledRules,
      }),
    ).toEqual({ ok: false, refusal: 'level' });
  });

  it('save: a saved score is audited with the row as it was; a clear is not (AuditPredictionGameController)', () => {
    const saved = unwrap(
      predictMatch({
        target: { prediction: row(10, 85, 80), game: OPEN },
        entry: { home: 88, away: 79 },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(saved.audit).toEqual({
      old: { home: 85, away: 80 },
      new: { home: 88, away: 79 },
    });
    const cleared = unwrap(
      predictMatch({
        target: { prediction: row(10, 85, 80), game: OPEN },
        entry: { home: null, away: null },
        now: NOW,
        rules: ruledRules,
      }),
    );
    expect(cleared.audit).toBeNull();
  });

  it('save (sportbet, PL-1): any accepted save switches the player back on, a clear included', () => {
    for (const entry of [
      { home: 88, away: 79 },
      { home: null, away: null },
    ]) {
      expect(
        unwrap(
          predictMatch({
            target: { prediction: row(10), game: OPEN },
            entry,
            now: NOW,
            rules: sportbetRules,
          }),
        ).switchesBackOn,
      ).toBe(true);
    }
  });

  it('save (ruled, R-57): only a saved score switches the player back on', () => {
    const switches = (home: number | null, away: number | null) =>
      unwrap(
        predictMatch({
          target: { prediction: row(10), game: OPEN },
          entry: { home, away },
          now: NOW,
          rules: ruledRules,
        }),
      ).switchesBackOn;
    expect(switches(88, 79)).toBe(true);
    expect(switches(null, null)).toBe(false);
  });
});

describe('statusAfterSave (PL-1)', () => {
  const rows = [
    { tournament: EUROLEAGUE, switchedOff: true, adminHidden: false, fillIns: 20 },
    { tournament: OTHER, switchedOff: true, adminHidden: false, fillIns: 20 },
  ];

  it('save (ruled, R-7): back on in its own tournament only, that count reset; the other stays off', () => {
    expect(statusAfterSave(rows, EUROLEAGUE, ruledRules)).toEqual([
      { tournament: EUROLEAGUE, switchedOff: false, adminHidden: false, fillIns: 0 },
      { tournament: OTHER, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
  });

  it('save (ruled, R-19): an admin hide stays', () => {
    expect(
      statusAfterSave(
        [{ tournament: EUROLEAGUE, switchedOff: true, adminHidden: true, fillIns: 20 }],
        EUROLEAGUE,
        ruledRules,
      ),
    ).toEqual([
      { tournament: EUROLEAGUE, switchedOff: false, adminHidden: true, fillIns: 0 },
    ]);
  });

  it("save (sportbet): one switch, on everywhere, every count kept (user_settings.active)", () => {
    expect(statusAfterSave(rows, EUROLEAGUE, sportbetRules)).toEqual([
      { tournament: EUROLEAGUE, switchedOff: false, adminHidden: false, fillIns: 20 },
      { tournament: OTHER, switchedOff: false, adminHidden: false, fillIns: 20 },
    ]);
  });

  it('save: agrees with PlayerStatus.afterRealPrediction under both sets', () => {
    for (const rules of [sportbetRules, ruledRules]) {
      const after = statusAfterSave(rows, EUROLEAGUE, rules);
      const status = unwrap(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set(
              after.filter((each) => each.switchedOff).map((each) => each.tournament),
            ),
            adminHidden: false,
            fillIns: new Map(after.map((each) => [each.tournament, each.fillIns])),
          },
          rules,
        ),
      );
      const expected = unwrap(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set([EUROLEAGUE, OTHER]),
            adminHidden: false,
            fillIns: new Map([
              [EUROLEAGUE, 20],
              [OTHER, 20],
            ]),
          },
          rules,
        ),
      ).afterRealPrediction(EUROLEAGUE, rules);
      for (const tournament of [EUROLEAGUE, OTHER]) {
        expect(status.isSwitchedOffIn(tournament, rules)).toBe(
          expected.isSwitchedOffIn(tournament, rules),
        );
        expect(status.fillInCount(tournament, rules)).toBe(
          expected.fillInCount(tournament, rules),
        );
      }
    }
  });
});
```

In `packages/domain/src/rules/rule-set.test.ts`, add to `DIFFERENCES`, after `switchOff`:

```ts
  onlyAScoreSwitchesBackOn: 'PL-1, R-7, R-57',
```

In `tools/migrate/src/parity/rulings.test.ts`, change the field count test to 25 (`"holds exactly RuleSet's 25 fields, no more"` and `toHaveLength(25)`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/domain exec vitest run src/prediction src/rules && pnpm --filter @sportbet/migrate exec vitest run src/parity/rulings.test.ts`
Expected: FAIL, because the modules and the field do not exist.

- [ ] **Step 3: Write the code**

In `packages/domain/src/rules/rule-set.ts`, in `RuleSet` after `switchOff`, add:

```ts
  /**
   * PL-1, R-7, R-57: does only a saved score switch a player back on?
   * sportbet's save switches them on for any accepted save - a cleared
   * prediction included (PredictionResultController::updatePredictionResultUser
   * reactivates before it looks at the scores).
   */
  readonly onlyAScoreSwitchesBackOn: boolean;
```

and add `onlyAScoreSwitchesBackOn: false,` to `sportbetRules` and `onlyAScoreSwitchesBackOn: true,` to `ruledRules`, each after `switchOff`.

In `tools/migrate/src/parity/rulings.ts`, add after `switchOff`:

```ts
  onlyAScoreSwitchesBackOn: {
    rules: 'PL-1, R-7, R-57',
    ruling: 'only a saved score switches a player back on',
    scoring: false,
    needs: null,
  },
```

Create `packages/domain/src/prediction/prediction-form.ts`:

```ts
import { PREDICTION_MAX, PREDICTION_MIN } from './match-prediction';

/** A posted field: `homeTeamScore` or `awayTeamScore`. */
export type PredictionField = 'home' | 'away';

/** Why a field was refused, in sportbet's words' order (ScoreFormat). */
export type PredictionFieldProblem = 'out-of-range' | 'half-typed' | 'level';

export interface PredictionFieldError {
  readonly field: PredictionField;
  readonly problem: PredictionFieldProblem;
}

/**
 * The pair, or every field's refusal: Laravel reports each field's rule
 * failure, so a refusal is a list rather than one Result string.
 */
export type PredictionFormCheck =
  | {
      readonly ok: true;
      readonly value: {
        readonly home: number | null;
        readonly away: number | null;
      };
    }
  | { readonly ok: false; readonly errors: readonly PredictionFieldError[] };

/** Laravel's `integer` (FILTER_VALIDATE_INT): an optional sign, no leading zero. */
const LARAVEL_INTEGER = /^[+-]?(?:0|[1-9]\d*)$/u;

/** One trimmed field: blank, a score in range, or refused. */
function sideOf(text: string): number | null | 'refused' {
  if (text === '') return null;
  if (!LARAVEL_INTEGER.test(text)) return 'refused';
  const value = Number(text);
  return Number.isSafeInteger(value) &&
    value >= PREDICTION_MIN &&
    value <= PREDICTION_MAX
    ? value
    : 'refused';
}

/**
 * UpdatePredictionResultRequest on the two trimmed fields (TrimStrings has
 * run; an empty one is null, ConvertEmptyStringsToNull): first each field's
 * `nullable|integer|min:50|max:120` - every field that fails, one range
 * error each (ScoreFormat::rangeMessage) - and only when both pass, its
 * after() hook: one side alone is "both scores" on the blank one (R-15),
 * then a level pair is the home field's "no draws".
 */
export function predictionFormEntry(fields: {
  readonly home: string;
  readonly away: string;
}): PredictionFormCheck {
  const home = sideOf(fields.home);
  const away = sideOf(fields.away);
  const ranged: PredictionFieldError[] = [];
  if (home === 'refused') ranged.push({ field: 'home', problem: 'out-of-range' });
  if (away === 'refused') ranged.push({ field: 'away', problem: 'out-of-range' });
  if (home === 'refused' || away === 'refused') {
    return { ok: false, errors: ranged };
  }
  if ((home === null) !== (away === null)) {
    return {
      ok: false,
      errors: [{ field: home === null ? 'home' : 'away', problem: 'half-typed' }],
    };
  }
  if (home !== null && home === away) {
    return { ok: false, errors: [{ field: 'home', problem: 'level' }] };
  }
  return { ok: true, value: { home, away } };
}
```

Create `packages/domain/src/prediction/predict-match.ts`:

```ts
import { PlayerStatus } from '../player/player-status';
import type { Game } from '../round/game';
import type { RuleSet } from '../rules/rule-set';
import type { TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  MatchPrediction,
  type PredictionRefusal,
} from './match-prediction';

/** Why a save writes nothing, beyond the form's own refusals. */
export type PredictRefusal = 'not-yours' | 'closed' | PredictionRefusal;

/** A saved score as audit_prediction_games keeps it: the row before, and after. */
export interface PredictionAudit {
  readonly old: { readonly home: number | null; readonly away: number | null };
  readonly new: { readonly home: number; readonly away: number };
}

/** What a save writes. */
export interface PredictionWritten {
  /** The row, as a real prediction. */
  readonly prediction: MatchPrediction;
  /** The save switches the player back on (PL-1, R-57): statusAfterSave. */
  readonly switchesBackOn: boolean;
  /** Written only for a saved score, as sportbet does. */
  readonly audit: PredictionAudit | null;
}

/**
 * PredictionResultController::updatePredictionResultUser, once the form
 * has passed (predictionFormEntry): the row must be the player's own and
 * of this game (issue 254: the row decides, never the posted id), then
 * the game must be open (LR-1, R-13, R-41: "Šio mačo prognozuoti
 * nebegalima."), then MatchPrediction.enter takes the pair. The player is
 * switched back on by any accepted save under sportbet, by a saved score
 * only under R-57; a saved score is audited with the row as it was.
 */
export function predictMatch(input: {
  readonly target: {
    readonly prediction: MatchPrediction;
    readonly game: Game;
  } | null;
  readonly entry: { readonly home: number | null; readonly away: number | null };
  readonly now: Instant;
  readonly rules: RuleSet;
}): Result<PredictionWritten, PredictRefusal> {
  const { target, entry, now, rules } = input;
  if (target === null || target.prediction.game !== target.game.id) {
    return refuse('not-yours');
  }
  if (!target.game.isOpenAt(now)) {
    return refuse('closed');
  }
  const entered = MatchPrediction.enter({
    player: target.prediction.player,
    game: target.game.id,
    home: entry.home,
    away: entry.away,
  });
  if (!entered.ok) return entered;
  const prediction = entered.value;
  const audit =
    prediction.home === null || prediction.away === null
      ? null
      : {
          old: {
            home: target.prediction.home,
            away: target.prediction.away,
          },
          new: { home: prediction.home, away: prediction.away },
        };
  return ok({
    prediction,
    switchesBackOn: audit !== null || !rules.onlyAScoreSwitchesBackOn,
    audit,
  });
}

/** One tournament_players row of a player, as it is stored. */
export interface TournamentStatusRow {
  readonly tournament: TournamentId;
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: number;
}

/**
 * A player's tournament rows after a save that switches them back on in
 * `tournament` (PlayerStatus.afterRealPrediction, PL-1): under R-7 in that
 * tournament only, its count reset, an admin hide kept (R-19); under
 * sportbet its one switch, on everywhere, every count kept. The rows are
 * read back through PlayerStatus.stored, so one it refuses is a corrupt
 * table and throws.
 */
export function statusAfterSave(
  rows: readonly TournamentStatusRow[],
  tournament: TournamentId,
  rules: RuleSet,
): TournamentStatusRow[] {
  const before = PlayerStatus.stored(
    {
      switchedOffIn: new Set(
        rows.filter((row) => row.switchedOff).map((row) => row.tournament),
      ),
      adminHidden:
        rows.find((row) => row.tournament === tournament)?.adminHidden ?? false,
      fillIns: new Map(rows.map((row) => [row.tournament, row.fillIns])),
    },
    rules,
  );
  if (!before.ok) {
    throw new Error(`statusAfterSave: a stored status is ${before.refusal}`);
  }
  const after = before.value.afterRealPrediction(tournament, rules);
  return rows.map((row) => ({
    tournament: row.tournament,
    switchedOff: after.isSwitchedOffIn(row.tournament, rules),
    adminHidden: row.tournament === tournament ? after.adminHidden : row.adminHidden,
    fillIns:
      rules.switchOff.countedPer === 'tournament'
        ? after.fillInCount(row.tournament, rules)
        : row.fillIns,
  }));
}
```

In `packages/domain/src/index.ts`, add:

```ts
export {
  predictionFormEntry,
  type PredictionField,
  type PredictionFieldError,
  type PredictionFieldProblem,
  type PredictionFormCheck,
} from './prediction/prediction-form';
export {
  predictMatch,
  statusAfterSave,
  type PredictionAudit,
  type PredictionWritten,
  type PredictRefusal,
  type TournamentStatusRow,
} from './prediction/predict-match';
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm test:unit && pnpm --filter @sportbet/migrate exec vitest run src && pnpm typecheck && pnpm lint`
Expected: PASS. The rulings report test still passes: the new field is not a scoring field, so the parity report prints it as "changes no stored row".

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(domain): a save's rules - the form in sportbet's order (UpdatePredictionResultRequest), the row is the player's own (issue 254), the lock, the audit, who is switched back on; R-57 in RuleSet (#20)`.

---

### Task 8 (backend-dev): The save in one transaction, and the prediction audit (migration 0011) **(sensitive)**

**Files:**
- Modify: `packages/db/src/prediction/schema.ts`, `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0011_audit-prediction-games.sql` (generated)
- Create: `packages/db/src/prediction/save.ts`, `packages/db/test/prediction-save.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/db/test/prediction-save.test.ts`. It uses `world.ts`, where it is 2026-10-15: game 10 (round 1) is open and game 9 (round 2, rate 2) has started.

```ts
import {
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import { at, gameNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { savePrediction } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  GAMES,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, GAMES);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  // Blank rows, as joining writes: ADA's of games 9 and 10, BEN's and CAI's of 10.
  await client.query(
    "insert into match_predictions (player_id, game_id, origin) values (1, 9, 'real'), (1, 10, 'real'), (2, 10, 'real'), (3, 10, 'real')",
  );
});

const save = (
  game: number,
  home: number | null,
  away: number | null,
  rules: RuleSet = ruledRules,
  player = ADA,
) =>
  savePrediction(db, {
    player,
    game: gameNo(game),
    entry: { home, away },
    now: NOW,
    rules,
  });

const rowOf = async (player: number, game: number) =>
  z
    .array(
      z.object({
        home: z.int().nullable(),
        away: z.int().nullable(),
        origin: z.string(),
      }),
    )
    .parse(
      (
        await client.query(
          'select home, away, origin from match_predictions where player_id = $1 and game_id = $2',
          [player, game],
        )
      ).rows,
    )[0];

const audits = async () =>
  z
    .array(
      z.object({
        player_id: z.int(),
        game_id: z.int(),
        home: z.int(),
        away: z.int(),
        old_home: z.int().nullable(),
        old_away: z.int().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select player_id, game_id, home, away, old_home, old_away from audit_prediction_games order by id',
        )
      ).rows,
    );

const statusOf = async (tournament: number) =>
  z
    .array(
      z.object({
        switched_off: z.boolean(),
        admin_hidden: z.boolean(),
        fill_ins: z.int(),
      }),
    )
    .parse(
      (
        await client.query(
          'select switched_off, admin_hidden, fill_ins from tournament_players where player_id = 1 and tournament_id = $1',
          [tournament],
        )
      ).rows,
    )[0];

describe('savePrediction (updatePredictionResultUser)', () => {
  it('save: the row takes the pair as a real prediction, and the answer is the odds from the votes now, at the round rate', async () => {
    await client.query(
      'update match_predictions set home = 90, away = 70 where player_id = 2 and game_id = 10',
    );
    const saved = await save(10, 88, 79);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(await rowOf(1, 10)).toEqual({ home: 88, away: 79, origin: 'real' });
    // Two home votes of two: home log2(2/2) = 0, away log2(2/0.5) = 2.
    expect(saved.value.odds.home.hundredths).toBe(0);
    expect(saved.value.odds.away.hundredths).toBe(200);
    expect(saved.value.rate.value).toBe(1);
  });

  it('save: clearing writes the blank pair', async () => {
    await save(10, 88, 79);
    expect((await save(10, null, null)).ok).toBe(true);
    expect(await rowOf(1, 10)).toEqual({
      home: null,
      away: null,
      origin: 'real',
    });
  });

  it('save (issue 254): a game the player has no row of is "not yours", and nothing is written', async () => {
    expect(await save(10, 88, 79, ruledRules, ADA)).toMatchObject({ ok: true });
    expect(await save(7, 88, 79)).toEqual({ ok: false, refusal: 'not-yours' });
    expect(await rowOf(1, 7)).toBeUndefined();
  });

  it('save (LR-1): a started game is closed, and its row is not touched', async () => {
    expect(await save(9, 88, 79)).toEqual({ ok: false, refusal: 'closed' });
    expect(await rowOf(1, 9)).toEqual({ home: null, away: null, origin: 'real' });
  });

  it('save (R-25, R-60): a saved score is audited with the row as it was; a clear and a refusal are not', async () => {
    await save(10, 85, 80);
    await save(10, 88, 79);
    await save(10, null, null);
    await save(9, 88, 79);
    expect(await audits()).toEqual([
      { player_id: 1, game_id: 10, home: 85, away: 80, old_home: null, old_away: null },
      { player_id: 1, game_id: 10, home: 88, away: 79, old_home: 85, old_away: 80 },
    ]);
  });

  it('save (ruled, R-7, R-57): a saved score switches ADA back on in this tournament, its count reset; a clear does not', async () => {
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 1',
    );
    await save(10, null, null);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: true,
      admin_hidden: false,
      fill_ins: 20,
    });
    await save(10, 88, 79);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 0,
    });
  });

  it('save (ruled, R-7): another tournament ADA is switched off in stays off', async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 20 },
    ]);
    await save(10, 88, 79);
    expect(await statusOf(OTHER.id)).toEqual({
      switched_off: true,
      admin_hidden: false,
      fill_ins: 20,
    });
  });

  it('save (ruled, R-19): an admin hide stays', async () => {
    await client.query(
      'update tournament_players set switched_off = true, admin_hidden = true where player_id = 1',
    );
    await save(10, 88, 79);
    expect(await statusOf(TOURNAMENT.id)).toMatchObject({
      switched_off: false,
      admin_hidden: true,
    });
  });

  it('save (sportbet, PL-1): any accepted save switches ADA on everywhere, a clear included, counts kept', async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 3 },
    ]);
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 2 where player_id = 1',
    );
    await save(10, null, null, sportbetRules);
    expect(await statusOf(TOURNAMENT.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 2,
    });
    expect(await statusOf(OTHER.id)).toEqual({
      switched_off: false,
      admin_hidden: false,
      fill_ins: 3,
    });
  });

  it('save: the audit is erased with the account (R-25): its player key cascades', async () => {
    const actions = await client.query(
      "select confdeltype from pg_constraint where conname = 'audit_prediction_games_player_fk'",
    );
    expect(actions.rows).toEqual([{ confdeltype: 'c' }]);
  });
});
```

Postgres reports `confdeltype` as a one-character string; if the driver returns it differently, compare with `String(...)`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/prediction-save.test.ts`
Expected: FAIL, because `savePrediction` and `audit_prediction_games` do not exist.

- [ ] **Step 3: Write the code**

In `packages/db/src/prediction/schema.ts` (which already imports everything the table needs), append:

```ts
/**
 * Each saved score (sportbet's audit_prediction_games, written by
 * AuditPredictionGameController only when both scores are saved): the
 * pair, and the row as it was. Erased with the account (R-25); not copied
 * from production, so it starts empty at switch-over (R-60). No IP is
 * kept (R-45).
 */
export const auditPredictionGames = pgTable(
  'audit_prediction_games',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    home: smallint('home').notNull(),
    away: smallint('away').notNull(),
    oldHome: smallint('old_home'),
    oldAway: smallint('old_away'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'audit_prediction_games_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'audit_prediction_games_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    index('audit_prediction_games_player_idx').on(table.playerId),
    index('audit_prediction_games_game_idx').on(table.gameId),
    ...auditPredictionInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `audit_prediction_games`: each side a score. */
export const auditPredictionInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'audit_prediction_games_home_not_negative',
    column: auditPredictionGames.home,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_away_not_negative',
    column: auditPredictionGames.away,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_old_home_not_negative',
    column: auditPredictionGames.oldHome,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'audit_prediction_games_old_away_not_negative',
    column: auditPredictionGames.oldAway,
    invariant: scoreSideInvariant,
  },
];
```

In `packages/db/src/schema.ts`, import `auditPredictionInvariantChecks` beside `predictionInvariantChecks` and add `...auditPredictionInvariantChecks,` after it in `INVARIANT_CHECKS`.

Generate and read the migration:

```bash
pnpm --filter @sportbet/db db:generate --name audit-prediction-games
cat packages/db/migrations/0011_audit-prediction-games.sql
```

Expected: one `CREATE TABLE "audit_prediction_games"` with the four CHECKs, two foreign keys (`ON DELETE cascade` on the player, `restrict` on the game), and two indexes; nothing else. A statement about any other table means the schema drifted: stop and report.

Create `packages/db/src/prediction/save.ts`:

```ts
import {
  CrowdOdds,
  MatchPrediction,
  predictMatch,
  PREDICTION_ORIGINS,
  scoreSideInvariant,
  statusAfterSave,
  tournamentId,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictRefusal,
  type Rate,
  type Result,
  type RuleSet,
  type TournamentStatusRow,
  ok,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, instantOf, keyOf, playerOf, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { findTournamentById } from '../tournament/repository';
import { auditPredictionGames, matchPredictions } from './schema';

/** One save, as the form has passed it (predictionFormEntry). */
export interface PredictionSave {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly entry: { readonly home: number | null; readonly away: number | null };
  readonly now: Instant;
  readonly rules: RuleSet;
}

/** What the save answers with: the game's odds from its votes now, and its round's rate. */
export interface PredictionSaved {
  readonly odds: CrowdOdds;
  readonly rate: Rate;
}

const side = scoreSideInvariant.schema.nullable();
const targetRows = z.array(
  z.object({
    tournament: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
    filledInAt: z.date().nullable(),
  }),
);
const statusRows = z.array(
  z.object({
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: z.int(),
  }),
);
const voteRows = z.array(
  z.object({
    player: z.int(),
    home: side,
    away: side,
    origin: z.enum(PREDICTION_ORIGINS),
  }),
);

/**
 * PredictionResultController::updatePredictionResultUser in one
 * transaction (a savepoint when `db` is one). The player's row of the game
 * is locked for the rest of it; with none, the save is "not yours" (issue
 * 254). The domain decides (predictMatch) from the row and the game as
 * stored; then the row is written as a real prediction, the player's
 * status where the save switches them back on (statusAfterSave), and an
 * audit row for a saved score. The answer's odds are the game's votes now
 * (CrowdOdds.forGame): nothing is stored for them (odds on read; game_odds
 * holds what a scored game was scored with).
 */
export async function savePrediction(
  db: Executor,
  save: PredictionSave,
): Promise<Result<PredictionSaved, PredictRefusal>> {
  const { player, game, entry, now, rules } = save;
  const playerKey = keyOf(player, 'player');
  return db.transaction(
    async (tx): Promise<Result<PredictionSaved, PredictRefusal>> => {
      const [row] = targetRows.parse(
        await tx
          .select({
            tournament: games.tournamentId,
            home: matchPredictions.home,
            away: matchPredictions.away,
            origin: matchPredictions.origin,
            filledInAt: matchPredictions.filledInAt,
          })
          .from(matchPredictions)
          .innerJoin(games, eq(games.id, matchPredictions.gameId))
          .where(
            and(
              eq(matchPredictions.playerId, playerKey),
              eq(matchPredictions.gameId, game),
            ),
          )
          .for('update', { of: matchPredictions }),
      );
      if (row === undefined) {
        const refused = predictMatch({ target: null, entry, now, rules });
        if (refused.ok) {
          throw new Error('savePrediction: a save with no row was accepted');
        }
        return refused;
      }
      const tournament = await findTournamentById(tx, row.tournament);
      if (tournament === undefined) {
        throw new Error(`savePrediction: tournament ${String(row.tournament)} is not stored`);
      }
      const season = await loadSeason(tx, tournament);
      const scheduled = season.game(game);
      const round =
        scheduled === undefined ? undefined : season.round(scheduled.round);
      if (scheduled === undefined || round === undefined) {
        throw new Error(`savePrediction: game ${String(game)} is not in its season`);
      }
      const key = `${String(playerKey)}/${String(game)}`;
      const prediction = stored(
        MatchPrediction.stored({
          player,
          game,
          home: row.home,
          away: row.away,
          origin: row.origin,
          filledInAt:
            row.filledInAt === null
              ? null
              : instantOf(row.filledInAt, 'match_predictions', key),
        }),
        'match_predictions',
        key,
      );
      const decided = predictMatch({
        target: { prediction, game: scheduled },
        entry,
        now,
        rules,
      });
      if (!decided.ok) return decided;
      const written = decided.value;
      await tx
        .update(matchPredictions)
        .set({
          home: written.prediction.home,
          away: written.prediction.away,
          origin: 'real',
          filledInAt: null,
        })
        .where(
          and(
            eq(matchPredictions.playerId, playerKey),
            eq(matchPredictions.gameId, game),
          ),
        );
      if (written.switchesBackOn) {
        await switchBackOn(tx, playerKey, tournament.id, rules);
      }
      if (written.audit !== null) {
        await tx.insert(auditPredictionGames).values({
          playerId: playerKey,
          gameId: game,
          home: written.audit.new.home,
          away: written.audit.new.away,
          oldHome: written.audit.old.home,
          oldAway: written.audit.old.away,
          at: new Date(now),
        });
      }
      const votes = voteRows
        .parse(
          await tx
            .select({
              player: matchPredictions.playerId,
              home: matchPredictions.home,
              away: matchPredictions.away,
              origin: matchPredictions.origin,
            })
            .from(matchPredictions)
            .where(eq(matchPredictions.gameId, game)),
        )
        .map((vote) => {
          const each = stored(
            MatchPrediction.stored({
              player: playerOf(vote.player),
              game: gameOf(game),
              home: vote.home,
              away: vote.away,
              origin: vote.origin,
              filledInAt: null,
            }),
            'match_predictions',
            `${String(vote.player)}/${String(game)}`,
          );
          return { origin: each.origin, outcome: each.outcome };
        });
      return ok({ odds: CrowdOdds.forGame(votes, rules), rate: round.rate });
    },
  );
}

/** Writes the player's tournament rows statusAfterSave changes, and only those. */
async function switchBackOn(
  tx: Executor,
  playerKey: number,
  tournament: number,
  rules: RuleSet,
): Promise<void> {
  const rows = statusRows.parse(
    await tx
      .select({
        tournament: tournamentPlayers.tournamentId,
        switchedOff: tournamentPlayers.switchedOff,
        adminHidden: tournamentPlayers.adminHidden,
        fillIns: tournamentPlayers.fillIns,
      })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.playerId, playerKey)),
  );
  const keyed = (id: number) =>
    stored(tournamentId(String(id)), 'tournament_players', id);
  const before: TournamentStatusRow[] = rows.map((row) => ({
    tournament: keyed(row.tournament),
    switchedOff: row.switchedOff,
    adminHidden: row.adminHidden,
    fillIns: row.fillIns,
  }));
  const after = statusAfterSave(before, keyed(tournament), rules);
  for (const [index, next] of after.entries()) {
    const was = before[index];
    if (
      was === undefined ||
      (was.switchedOff === next.switchedOff &&
        was.adminHidden === next.adminHidden &&
        was.fillIns === next.fillIns)
    ) {
      continue;
    }
    await tx
      .update(tournamentPlayers)
      .set({
        switchedOff: next.switchedOff,
        adminHidden: next.adminHidden,
        fillIns: next.fillIns,
      })
      .where(
        and(
          eq(tournamentPlayers.playerId, playerKey),
          eq(tournamentPlayers.tournamentId, Number(next.tournament)),
        ),
      );
  }
}
```

`PredictionWritten.prediction.home` is `number | null`, as the column is.

In `packages/db/src/index.ts`, add:

```ts
export {
  savePrediction,
  type PredictionSave,
  type PredictionSaved,
} from './prediction/save';
```

and export `auditPredictionGames` where the other tables are exported, if the index lists tables (it does through `./schema` for the client).

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/db exec vitest run test/prediction-save.test.ts test/invariant-checks.test.ts test/schema.test.ts && pnpm test:db && pnpm typecheck && pnpm lint`
Expected: PASS. `invariant-checks.test.ts` proves the four new CHECKs against `scoreSideInvariant`. `schema.test.ts` replays the migrations, 0011 included.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(db): a prediction saved in one transaction - the player's own row (issue 254), the lock, the status a save switches back on (R-7, R-19, R-57), the audit (migration 0011, R-25, R-60); the answer's odds read from the votes (#20)`.

---

### Task 9 (web-dev): The save's route and its answers **(sensitive)**

**Files:**
- Create: `apps/web/src/server/predictions/texts.ts`
- Create: `apps/web/src/server/predictions/save-prediction.ts`, `apps/web/src/server/predictions/save-prediction.test.ts`
- Create: `apps/web/src/app/prediction/results/save/route.ts`
- Create: `apps/web/tests/feature/prediction-save.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/server/predictions/save-prediction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validationAnswer } from './save-prediction';

describe("validationAnswer (Laravel's 422 for UpdatePredictionResultRequest)", () => {
  it("each field's message under its sportbet name; the message is the first", () => {
    expect(
      validationAnswer([{ field: 'away', problem: 'half-typed' }]),
    ).toEqual({
      status: 422,
      body: {
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      },
    });
    expect(validationAnswer([{ field: 'home', problem: 'level' }]).body).toEqual({
      message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
      errors: {
        homeTeamScore: ['Lygiosios negalimos - komandų rezultatai turi skirtis.'],
      },
    });
  });

  it("two errors: Laravel's \"(and 1 more error)\" after the first", () => {
    expect(
      validationAnswer([
        { field: 'home', problem: 'out-of-range' },
        { field: 'away', problem: 'out-of-range' },
      ]).body,
    ).toEqual({
      message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
      errors: {
        homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
      },
    });
  });
});
```

Create `apps/web/tests/feature/prediction-save.test.ts`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { Browser, type Page } from '../support/browser';
import { gamesOf, jonasPlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// The save (slice 6b, #20): updatePredictionResultUser behind
// UpdatePredictionResultRequest, against the built app, at
// POST /prediction/results/save (decision 1).

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const SAVE = '/prediction/results/save';
const [OPEN_GAME, NEXT_ROUND] = gamesOf(SOONER);
const [STARTED] = gamesOf(CLOSED);

const pair = (game: number, home: string, away: string, row = game) => {
  const body = new FormData();
  body.set('gameID', String(game));
  body.set('prediction_gameID', String(row));
  body.set('homeTeamScore', home);
  body.set('awayTeamScore', away);
  return body;
};

const json = (page: Page): unknown => JSON.parse(page.html);

const rowOf = async (game: number) =>
  z
    .array(z.object({ home: z.int().nullable(), away: z.int().nullable() }))
    .parse(
      (
        await client.query(
          'select home, away from match_predictions where player_id = 1 and game_id = $1',
          [game],
        )
      ).rows,
    )[0];

const audited = async () =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query('select count(*)::int as rows from audit_prediction_games'))
        .rows,
    )[0]?.rows;

const jonas = () => jonasPlaying(db, client, baseUrl, SOONER, CLOSED);

describe('POST /prediction/results/save (updatePredictionResultUser)', () => {
  it("saved: 200 with sportbet's odds and the panel, from Jonas's one vote now", async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    expect(page.status).toBe(200);
    // One home vote: home log2(1/1) = 0, away and draw log2(1/0.5) = 1.
    expect(json(page)).toEqual({
      success: true,
      home_odds: 0,
      draw_odds: 1,
      away_odds: 1,
      panel: { home: '50.0', away: '100.0', draw: '100.0' },
    });
    expect(await rowOf(OPEN_GAME)).toEqual({ home: 88, away: 79 });
    expect(await audited()).toBe(1);
  });

  it('cleared: 200, the row blank again, nothing audited', async () => {
    const browser = await jonas();
    await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    const page = await browser.post(SAVE, pair(OPEN_GAME, '', ''));
    expect(page.status).toBe(200);
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
    expect(await audited()).toBe(1);
  });

  it('a side out of range, or no whole number: 422 with the range message on its field', async () => {
    const browser = await jonas();
    for (const bad of ['130', '49', 'abc', '8.5']) {
      const page = await browser.post(SAVE, pair(OPEN_GAME, bad, '79'));
      expect(page.status).toBe(422);
      expect(json(page)).toEqual({
        message: 'Rezultatas turi būti nuo 50 iki 120.',
        errors: { homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'] },
      });
    }
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
  });

  it('both sides out of range: both fields, and "(and 1 more error)"', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '130', '20'));
    expect(json(page)).toEqual({
      message: 'Rezultatas turi būti nuo 50 iki 120. (and 1 more error)',
      errors: {
        homeTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
        awayTeamScore: ['Rezultatas turi būti nuo 50 iki 120.'],
      },
    });
  });

  it('R-15: one side alone is "Įveskite abu rezultatus." on the blank one', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', ''));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Įveskite abu rezultatus.',
      errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
    });
  });

  it('a level pair: "no draws" on the home field', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '80', '80'));
    expect(json(page)).toEqual({
      message: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
      errors: {
        homeTeamScore: ['Lygiosios negalimos - komandų rezultatai turi skirtis.'],
      },
    });
  });

  it("issue 254: a game Jonas has no row of is \"Šios prognozės išsaugoti negalima.\"", async () => {
    const browser = await jonas();
    await saveTournamentWithGames(db, LATER);
    const [notHis] = gamesOf(LATER);
    const page = await browser.post(SAVE, pair(notHis, '88', '79'));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
  });

  it('issue 254: gameID must name the row\'s game; neither row is written', async () => {
    const browser = await jonas();
    const page = await browser.post(
      SAVE,
      pair(OPEN_GAME, '88', '79', NEXT_ROUND),
    );
    expect(json(page)).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
    expect(await rowOf(NEXT_ROUND)).toEqual({ home: null, away: null });
  });

  it('a missing gameID is "not yours" too (decision 7)', async () => {
    const browser = await jonas();
    const body = pair(OPEN_GAME, '88', '79');
    body.delete('gameID');
    expect(json(await browser.post(SAVE, body))).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
  });

  it('LR-1: a started game is "Šio mačo prognozuoti nebegalima.", and its row is not touched', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(STARTED, '88', '79'));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Šio mačo prognozuoti nebegalima.',
    });
    expect(await rowOf(STARTED)).toEqual({ home: null, away: null });
  });

  it('R-7, R-57: a saved score switches Jonas back on in that tournament; a clear does not', async () => {
    const browser = await jonas();
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 20 where player_id = 1 and tournament_id = $1',
      [SOONER.id],
    );
    const status = async () =>
      (
        await client.query(
          'select switched_off, fill_ins from tournament_players where player_id = 1 and tournament_id = $1',
          [SOONER.id],
        )
      ).rows[0];
    await browser.post(SAVE, pair(OPEN_GAME, '', ''));
    expect(await status()).toEqual({ switched_off: true, fill_ins: 20 });
    await browser.post(SAVE, pair(OPEN_GAME, '88', '79'));
    expect(await status()).toEqual({ switched_off: false, fill_ins: 0 });
  });

  it('a POST from another site is refused, and nothing is written (#16)', async () => {
    const browser = await jonas();
    const page = await browser.post(SAVE, pair(OPEN_GAME, '88', '79'), {
      origin: 'https://evil.example',
    });
    expect(page.status).toBe(403);
    expect(await rowOf(OPEN_GAME)).toEqual({ home: null, away: null });
  });

  it('a guest gets 401 {"message":"Unauthenticated."} (decision 8)', async () => {
    const page = await new Browser(baseUrl, '192.0.2.70').post(
      SAVE,
      pair(OPEN_GAME, '88', '79'),
    );
    expect(page.status).toBe(401);
    expect(json(page)).toEqual({ message: 'Unauthenticated.' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/server/predictions` then `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/prediction-save.test.ts`
Expected: FAIL, because neither the use case nor the route exists (the route answers 404).

- [ ] **Step 3: Write the code**

Create `apps/web/src/server/predictions/texts.ts`:

```ts
import { PREDICTION_MAX, PREDICTION_MIN } from '@sportbet/domain';

/** sportbet's texts for a save (ScoreFormat, PredictionResultController; lang/lt.json). */
export const SAVE_TEXTS = {
  range: `Rezultatas turi būti nuo ${String(PREDICTION_MIN)} iki ${String(PREDICTION_MAX)}.`,
  bothScores: 'Įveskite abu rezultatus.',
  draw: 'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  notThisPrediction: 'Šios prognozės išsaugoti negalima.',
  closed: 'Šio mačo prognozuoti nebegalima.',
} as const;
```

Create `apps/web/src/server/predictions/save-prediction.ts`:

```ts
import { savePrediction, type Db } from '@sportbet/db';
import {
  gameId,
  oddsPanel,
  onePlace,
  predictionFormEntry,
  type GameId,
  type Instant,
  type PlayerId,
  type PredictionFieldError,
  type RuleSet,
} from '@sportbet/domain';
import { SAVE_TEXTS } from './texts';

/** The posted fields, trimmed (form-input.ts): sportbet's names. */
export interface SaveFields {
  /** `gameID` */
  readonly game: string;
  /** `prediction_gameID`: the game of the player's row (its key is player and game). */
  readonly row: string;
  /** `homeTeamScore` */
  readonly home: string;
  /** `awayTeamScore` */
  readonly away: string;
}

/** The status and JSON body the route answers with. */
export interface SaveAnswer {
  readonly status: 200 | 422;
  readonly body: Readonly<Record<string, unknown>>;
}

const FIELD_NAMES = { home: 'homeTeamScore', away: 'awayTeamScore' } as const;

const FIELD_MESSAGES = {
  'out-of-range': SAVE_TEXTS.range,
  'half-typed': SAVE_TEXTS.bothScores,
  level: SAVE_TEXTS.draw,
} as const;

/**
 * Laravel's 422 for a failed FormRequest: `errors`, each field's messages
 * under its name, and `message`, the first of them - with "(and N more
 * error[s])" when there are more, in English as Laravel writes it (sportbet
 * translates no such line; its page reads `errors` only).
 */
export function validationAnswer(
  errors: readonly PredictionFieldError[],
): SaveAnswer {
  const listed = errors.map(
    ({ field, problem }) =>
      [FIELD_NAMES[field], FIELD_MESSAGES[problem]] as const,
  );
  const first = listed[0]?.[1] ?? SAVE_TEXTS.range;
  const more = listed.length - 1;
  return {
    status: 422,
    body: {
      message:
        more === 0
          ? first
          : `${first} (and ${String(more)} more ${more === 1 ? 'error' : 'errors'})`,
      errors: Object.fromEntries(listed.map(([name, text]) => [name, [text]])),
    },
  };
}

/** PredictionSaveResponse::refused: 422 `{success: false, message}`. */
const refused = (message: string): SaveAnswer => ({
  status: 422,
  body: { success: false, message },
});

const GAME_ID = /^[1-9]\d{0,9}$/u;

/** A posted id: a whole number from 1, or null. */
function gameField(text: string): GameId | null {
  if (!GAME_ID.test(text)) return null;
  const id = gameId(Number(text));
  return id.ok ? id.value : null;
}

/**
 * updatePredictionResultUser as a use case. The form first, as sportbet's
 * FormRequest runs before its controller (decision 2): a field's refusal
 * is Laravel's 422. Then the ids: `gameID` must be the row's game, else
 * "Šios prognozės išsaugoti negalima." (issue 254; a missing or unreadable
 * id too, decision 7). Then savePrediction, whose "not yours" and
 * "closed" are sportbet's refusals. Accepted: sportbet's
 * `{success, home_odds, draw_odds, away_odds}` - the odds read from the
 * votes now - and the panel as the page prints it (decision 3).
 */
export async function savePredictionFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly fields: SaveFields;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<SaveAnswer> {
  const { player, fields, now, rules } = input;
  const checked = predictionFormEntry({ home: fields.home, away: fields.away });
  if (!checked.ok) return validationAnswer(checked.errors);
  const game = gameField(fields.game);
  const row = gameField(fields.row);
  if (game === null || row === null || game !== row) {
    return refused(SAVE_TEXTS.notThisPrediction);
  }
  const saved = await savePrediction(db, {
    player,
    game,
    entry: checked.value,
    now,
    rules,
  });
  if (!saved.ok) {
    switch (saved.refusal) {
      case 'not-yours':
        return refused(SAVE_TEXTS.notThisPrediction);
      case 'closed':
        return refused(SAVE_TEXTS.closed);
      default:
        throw new Error(
          `save: the form passed a pair the prediction refuses (${saved.refusal})`,
        );
    }
  }
  const { odds, rate } = saved.value;
  const panel = oddsPanel(odds, rate);
  return {
    status: 200,
    body: {
      success: true,
      home_odds: odds.home.hundredths / 100,
      draw_odds: odds.draw.hundredths / 100,
      away_odds: odds.away.hundredths / 100,
      panel: {
        home: onePlace(panel.home.hundredths),
        away: onePlace(panel.away.hundredths),
        draw: onePlace(panel.draw.hundredths),
      },
    },
  };
}
```

Create `apps/web/src/app/prediction/results/save/route.ts`:

```ts
import { ruledRules } from '@sportbet/domain';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { savePredictionFromForm } from '../../../../server/predictions/save-prediction';
import { signedInPlayer } from '../../../../server/request-context';
import { formText } from '../../../../server/request/form-input';
import { refuseCrossSite } from '../../../../server/request/route-responses';

/**
 * The autosave's POST (sportbet's POST /prediction/results; decision 1),
 * from this site only (#16). A guest is sportbet's `auth` answer to a JSON
 * request, 401 (decision 8). Everything else is savePredictionFromForm's
 * answer, as JSON.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await signedInPlayer();
  if (signedIn === null) {
    return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  }
  const form = await request.formData().catch(() => new FormData());
  const answer = await savePredictionFromForm(getDb(), {
    player: signedIn.player,
    fields: {
      game: formText(form, 'gameID'),
      row: formText(form, 'prediction_gameID'),
      home: formText(form, 'homeTeamScore'),
      away: formText(form, 'awayTeamScore'),
    },
    now: now(),
    rules: ruledRules,
  });
  return Response.json(answer.body, { status: answer.status });
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm build && pnpm test:feature && pnpm typecheck && pnpm lint`
Expected: PASS: the new unit and feature files and every earlier one.

Then try it in a browser:
1. Start `next start` against a local database with the staging seed.
2. Sign in as the seeded account.
3. On `/prediction/results`, type a pair into game 9001: the boxes go green, the odds toggle appears, and the badge in the rail disappears.
4. Empty both boxes: they go grey and the badge returns.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): the save - POST /prediction/results/save from this site only, sportbet's 422s and refusals with their texts, the odds and the panel in the answer (#20)`.

---

### Task 10 (lead): The end of 6b - the whole check and a review pass

- [ ] Run the whole check of Task 15 Step 1. Then:
  - Have the architect review the 6b commits (`mp-code-review`).
  - Have the security reviewer review Tasks 8 and 9. In particular:
    - the row is decided by the session's player and the posted game only;
    - the same-origin check;
    - nothing personal is logged;
    - the audit cascades with the player;
    - the row lock (`for update`) holds two saves of one row in order.
  - Have qa check the save's answers against `PredictionSaveTargetTest`, `HalfTypedPredictionTest`, `PredictionRefusalTest` and `ScoreFormatTest` at 3eb95e7.
- [ ] Fix what they confirm, each fix its own commit ending with the trailer and `#20`.

---

## Part 6c: the single-game page

### Task 11 (backend-dev): One game's page data, seen as R-50 allows **(sensitive)**

**Files:**
- Create: `packages/db/src/prediction/single-game.ts`, `packages/db/test/single-game.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/single-game.test.ts`:

```ts
import { ruledRules } from '@sportbet/domain';
import { at, gameNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSingleGame } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  CAI,
  GAMES,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, GAMES);
  await savePlaying(db, TOURNAMENT, ADA);
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 9, 85, 80, 'real'), (1, 10, null, null, 'real')",
  );
});

const single = (game: number, player = ADA, isAdmin = false) =>
  loadSingleGame(db, {
    viewer: { player, isAdmin },
    game: gameNo(game),
    now: NOW,
    rules: ruledRules,
  });

describe('loadSingleGame (showSingleGame)', () => {
  it('an open game: its teams, tip-off, and the player\'s row', async () => {
    expect(await single(10)).toMatchObject({
      tournament: { id: TOURNAMENT.id },
      home: 'Real',
      away: 'Olympiacos',
      tipOff: at('2026-10-20T18:00:00Z'),
      locked: false,
      prediction: { home: null, away: null },
    });
  });

  it('a started game is locked, with the row as saved', async () => {
    expect(await single(9)).toMatchObject({
      locked: true,
      prediction: { home: 85, away: 80 },
    });
  });

  it("a game the player has no row of: no prediction (\"Spėjimas nerastas\")", async () => {
    expect((await single(7))?.prediction).toBeNull();
  });

  it('an unknown game is not found', async () => {
    expect(await single(999)).toBeNull();
  });

  it("R-50: a non-public tournament's game is not found for a player not in it, and found for an admin", async () => {
    await client.query('update tournaments set is_public = false where id = $1', [
      TOURNAMENT.id,
    ]);
    expect(await single(10, CAI)).toBeNull();
    expect(await single(10, CAI, true)).not.toBeNull();
    expect(await single(10, ADA)).not.toBeNull();
  });
});
```

In `world.ts`, game 10 is Real against Olympiacos, and game 7, which ADA has no row of here, is Zalgiris against Olympiacos.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @sportbet/db exec vitest run test/single-game.test.ts`
Expected: FAIL, because `loadSingleGame` does not exist.

- [ ] **Step 3: Write the code**

Create `packages/db/src/prediction/single-game.ts`:

```ts
import {
  predictionRowState,
  scoreSideInvariant,
  type GameId,
  type Instant,
  type RuleSet,
  type TeamId,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { findVisibleTournament, type PlayerViewer } from '../hub/repository';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { listTeams } from '../team/repository';
import { findTournamentById } from '../tournament/repository';
import { matchPredictions } from './schema';

/** One game's prediction page. */
export interface SingleGame {
  readonly tournament: Tournament;
  readonly home: string;
  readonly away: string;
  readonly tipOff: Instant;
  /** No longer open (GameLock::isClosed, with R-13 and R-41). */
  readonly locked: boolean;
  /** The player's row, or null when they have none ("Spėjimas nerastas"). */
  readonly prediction: {
    readonly home: number | null;
    readonly away: number | null;
  } | null;
}

const side = scoreSideInvariant.schema.nullable();

/**
 * PredictionResultController::showSingleGame: the game, if it exists and
 * its tournament is one the viewer may see (R-50: the page answers "not
 * found" otherwise, as the tournament page does); its teams and tip-off,
 * whether it is locked (predictionRowState), and the player's row of it.
 * sportbet resolves the format from the game, not the session: so does
 * this, from the game's own tournament.
 */
export async function loadSingleGame(
  db: Executor,
  input: {
    readonly viewer: PlayerViewer;
    readonly game: GameId;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<SingleGame | null> {
  const { viewer, game, now, rules } = input;
  const [found] = z
    .array(z.object({ tournament: z.int() }))
    .parse(
      await db
        .select({ tournament: games.tournamentId })
        .from(games)
        .where(eq(games.id, game)),
    );
  if (found === undefined) return null;
  const tournament = await findTournamentById(db, found.tournament);
  if (tournament === undefined) {
    throw new Error(`single game: tournament ${String(found.tournament)} is not stored`);
  }
  if ((await findVisibleTournament(db, tournament.slug, viewer, rules)) === null) {
    return null;
  }
  const season = await loadSeason(db, tournament);
  const scheduled = season.game(game);
  if (scheduled === undefined) {
    throw new Error(`single game: game ${String(game)} is not in its season`);
  }
  const names = new Map(
    (await listTeams(db, tournament)).map(({ id, name }) => [id, name]),
  );
  const nameOf = (team: TeamId): string => {
    const name = names.get(team);
    if (name === undefined) {
      throw new Error(`single game: team ${team} is not stored`);
    }
    return name;
  };
  const [row] = z
    .array(z.object({ home: side, away: side }))
    .parse(
      await db
        .select({ home: matchPredictions.home, away: matchPredictions.away })
        .from(matchPredictions)
        .where(
          and(
            eq(matchPredictions.playerId, keyOf(viewer.player, 'player')),
            eq(matchPredictions.gameId, game),
          ),
        ),
    );
  return {
    tournament,
    home: nameOf(scheduled.home),
    away: nameOf(scheduled.away),
    tipOff: scheduled.tipOff,
    locked: predictionRowState(scheduled, now) !== 'open',
    prediction: row === undefined ? null : { home: row.home, away: row.away },
  };
}
```

In `packages/db/src/index.ts`, add:

```ts
export { loadSingleGame, type SingleGame } from './prediction/single-game';
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm format && pnpm --filter @sportbet/db exec vitest run test/single-game.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(db): one game's prediction page data (showSingleGame) - its teams, tip-off, lock and the player's row; "not found" for a tournament the viewer may not see (R-50) (#20)`.

---

### Task 12 (web-dev): `/prediction/game/<id>` **(sensitive)**

**Files:**
- Modify: `apps/web/src/components/predictions/save-answer.ts`, `apps/web/src/components/predictions/prediction-editor.tsx`
- Create: `apps/web/src/components/predictions/single-game-view.tsx`, `single-game-view.test.tsx`
- Create: `apps/web/src/components/predictions/single-game-form.tsx`, `single-game-form.test.tsx`
- Create: `apps/web/src/app/prediction/game/[id]/page.tsx`
- Create: `apps/web/tests/feature/prediction-game.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/predictions/single-game-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SingleGameView } from './single-game-view';

const GAME = {
  game: 9001,
  home: 'Zalgiris Kaunas',
  away: 'Real Madrid',
  stamp: '2027-03-04 20:00',
  locked: false,
  prediction: { home: '', away: '' },
  min: 50,
  max: 120,
};

describe('SingleGameView (game-single.blade.php)', () => {
  it('"Spėjimas": both crests and names, "vs", the tip-off in Vilnius with " LT"', () => {
    render(<SingleGameView game={GAME} />);
    const card = screen.getByTestId('single-game');
    expect(screen.getByRole('heading', { name: 'Spėjimas' })).toBeDefined();
    expect(card.textContent).toContain('vs');
    expect(card.textContent).toContain('2027-03-04 20:00 LT');
    expect(screen.getAllByAltText('Zalgiris Kaunas')).toHaveLength(1);
    expect(screen.getAllByAltText('Real Madrid')).toHaveLength(1);
  });

  it('open, with a row: the form', () => {
    render(<SingleGameView game={GAME} />);
    expect(screen.getByTestId('single-game-form')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Išsaugoti spėjimą' }),
    ).toBeDefined();
  });

  it("locked: \"Žaidimas jau prasidėjo - spėjimų keisti negalima.\", and the player's prediction when there is one", () => {
    render(
      <SingleGameView
        game={{ ...GAME, locked: true, prediction: { home: '85', away: '80' } }}
      />,
    );
    const card = screen.getByTestId('single-game');
    expect(card.textContent).toContain(
      'Žaidimas jau prasidėjo - spėjimų keisti negalima.',
    );
    expect(card.textContent).toContain('85 : 80');
    expect(card.textContent).toContain('Jūsų spėjimas');
    expect(screen.queryByTestId('single-game-form')).toBeNull();
  });

  it('locked with a blank row: the notice alone', () => {
    render(<SingleGameView game={{ ...GAME, locked: true }} />);
    expect(screen.getByTestId('single-game').textContent).not.toContain(
      'Jūsų spėjimas',
    );
  });

  it('no row: "Spėjimas nerastas. Bandykite dar kartą nuo pagrindinio puslapio."', () => {
    render(<SingleGameView game={{ ...GAME, prediction: null }} />);
    expect(screen.getByTestId('single-game').textContent).toContain(
      'Spėjimas nerastas. Bandykite dar kartą nuo pagrindinio puslapio.',
    );
    expect(
      screen.getByRole('link', { name: 'pagrindinio puslapio' }).getAttribute('href'),
    ).toBe('/');
  });
});
```

Create `apps/web/src/components/predictions/single-game-form.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SingleGameForm } from './single-game-form';

const FORM = {
  game: 9001,
  homeTeam: 'Zalgiris Kaunas',
  awayTeam: 'Real Madrid',
  home: '',
  away: '',
  min: 50,
  max: 120,
};

const answer = (status: number, body: unknown) =>
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    async () => Promise.resolve(Response.json(body, { status })),
  );

async function submit(home: string, away: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Zalgiris Kaunas'), {
    target: { value: home },
  });
  fireEvent.change(screen.getByLabelText('Real Madrid'), {
    target: { value: away },
  });
  await act(async () => {
    fireEvent.submit(screen.getByTestId('single-game-form'));
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SingleGameForm (game-single.blade.php\'s form)', () => {
  it('saved: goes to the player\'s home', async () => {
    vi.stubGlobal(
      'fetch',
      answer(200, {
        success: true,
        home_odds: 0,
        draw_odds: 1,
        away_odds: 1,
        panel: { home: '50.0', away: '100.0', draw: '100.0' },
      }),
    );
    const go = vi.fn();
    render(<SingleGameForm form={FORM} go={go} />);
    await submit('88', '79');
    expect(go).toHaveBeenCalledWith('/');
  });

  it("refused: the server's message under the boxes, the button usable again", async () => {
    vi.stubGlobal(
      'fetch',
      answer(422, {
        message: 'Įveskite abu rezultatus.',
        errors: { awayTeamScore: ['Įveskite abu rezultatus.'] },
      }),
    );
    const go = vi.fn();
    render(<SingleGameForm form={FORM} go={go} />);
    await submit('88', '');
    expect(screen.getByRole('alert').textContent).toBe(
      'Įveskite abu rezultatus.',
    );
    expect(go).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Išsaugoti spėjimą' }),
    ).toHaveProperty('disabled', false);
  });
});
```

Create `apps/web/tests/feature/prediction-game.test.ts`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { Browser, documentOf } from '../support/browser';
import { ACTIVE_PROFILE, withProfile } from '../support/hub';
import { gamesOf, jonasPlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// /prediction/game/<id> (slice 6c, #20): showSingleGame, the reminder
// mail's link, against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

describe('/prediction/game/<id> (showSingleGame)', () => {
  it("an open game of Jonas's: the form", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const [open] = gamesOf(SOONER);
    const page = await browser.get(`/prediction/game/${String(open)}`);
    expect(page.status).toBe(200);
    expect(documentOf(page).querySelector('[data-testid="single-game-form"]')).not.toBeNull();
    expect(page.html).toContain('Home 41');
  });

  it('a started game: locked, "Žaidimas jau prasidėjo"', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const [started] = gamesOf(CLOSED);
    const page = await browser.get(`/prediction/game/${String(started)}`);
    expect(page.html).toContain(
      'Žaidimas jau prasidėjo - spėjimų keisti negalima.',
    );
    expect(documentOf(page).querySelector('[data-testid="single-game-form"]')).toBeNull();
  });

  it('a game of a public tournament Jonas does not play: "Spėjimas nerastas"', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await saveTournamentWithGames(db, LATER);
    await withProfile(db, LATER.tournament.slug, ACTIVE_PROFILE);
    const [notHis] = gamesOf(LATER);
    const page = await browser.get(`/prediction/game/${String(notHis)}`);
    expect(page.html).toContain('Spėjimas nerastas. Bandykite dar kartą nuo');
  });

  it('an unknown game, or one that is no id, is a 404', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    expect((await browser.get('/prediction/game/999999')).status).toBe(404);
    expect((await browser.get('/prediction/game/abc')).status).toBe(404);
  });

  it("R-50: a non-public tournament's game is a 404 for a player not in it", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await saveTournamentWithGames(db, LATER);
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const [hidden] = gamesOf(LATER);
    expect((await browser.get(`/prediction/game/${String(hidden)}`)).status).toBe(
      404,
    );
  });

  it('a guest is sent to sign in, to come back to this game', async () => {
    const page = await new Browser(baseUrl, '192.0.2.80').get(
      '/prediction/game/411',
    );
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent('/prediction/game/411')}`,
    );
  });
});
```

`client` is used only through `jonasPlaying`; if lint flags it as unused elsewhere, keep it as it is passed there.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts src/components/predictions` then `pnpm build && pnpm --filter @sportbet/web exec vitest run --config vitest.feature.config.ts tests/feature/prediction-game.test.ts`
Expected: FAIL, because the components and the page do not exist.

- [ ] **Step 3: Write the code**

Move the posting out of `prediction-editor.tsx` into `save-answer.ts`, so the list and the single game post alike. Append to `apps/web/src/components/predictions/save-answer.ts`:

```ts
import { PREDICTION_SAVE_PATH } from '../shell/shell-paths';

/**
 * Posts one pair as sportbet's pages do - its field names, `prediction_gameID`
 * the row's game - and reads the answer. A lost connection is NOT_SAVED.
 */
export async function postPrediction(
  game: number,
  home: string,
  away: string,
): Promise<SaveOutcome> {
  try {
    const response = await fetch(PREDICTION_SAVE_PATH, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        gameID: String(game),
        prediction_gameID: String(game),
        homeTeamScore: home,
        awayTeamScore: away,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    return readSaveAnswer(response.status, body);
  } catch {
    return { kind: 'refused', message: NOT_SAVED };
  }
}
```

(Put the `import` at the top of the file.) In `prediction-editor.tsx`, delete its `post` function and the `PREDICTION_SAVE_PATH` and `NOT_SAVED` imports, import `postPrediction` from `./save-answer`, and call `postPrediction(row.game, pair[0], pair[1])`. Its tests must pass unchanged.

Create `apps/web/src/components/predictions/single-game-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { BUTTON_PRIMARY } from '../hub/styles';
import { Icon } from '../shell/icon';
import { PLAYER_HOME } from '../shell/shell-paths';
import { postPrediction } from './save-answer';

/** The single game's form, in strings. */
export interface SingleGameFormText {
  readonly game: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly home: string;
  readonly away: string;
  /** The score boxes' bounds (ScoreFormat's min and inputMax). */
  readonly min: number;
  readonly max: number;
}

const BOX =
  'w-20 rounded-[8px] border bg-card px-2 py-1.5 text-center text-[1.25rem] font-bold text-text';

const goTo = (path: string): void => {
  window.location.assign(path);
};

/**
 * game-single.blade.php's form: the two boxes, "Išsaugoti spėjimą"; a save
 * goes to the player's home (sportbet's /main, PLAYER_HOME until slice 8);
 * a refusal shows the server's message under the boxes (R-59), the button
 * usable again. The server checks the pair (decision 4).
 */
export function SingleGameForm({
  form,
  go = goTo,
}: {
  form: SingleGameFormText;
  go?: (path: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = `${BOX} ${message === null ? 'border-border' : 'border-bad shadow-[0_0_0_2px_var(--color-bad-tint)]'}`;
  return (
    <form
      data-testid="single-game-form"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const text = (name: string) => {
          const value = fields.get(name);
          return typeof value === 'string' ? value.trim() : '';
        };
        setBusy(true);
        void postPrediction(
          form.game,
          text('homeTeamScore'),
          text('awayTeamScore'),
        ).then((outcome) => {
          if (outcome.kind === 'saved') {
            go(PLAYER_HOME);
            return;
          }
          setMessage(outcome.message);
          setBusy(false);
        });
      }}
    >
      <div className="mb-6 flex items-center justify-center gap-4">
        <input
          type="number"
          name="homeTeamScore"
          aria-label={form.homeTeam}
          min={form.min}
          max={form.max}
          defaultValue={form.home}
          placeholder="?"
          className={box}
        />
        <span className="text-[1.5rem] font-bold text-muted">:</span>
        <input
          type="number"
          name="awayTeamScore"
          aria-label={form.awayTeam}
          min={form.min}
          max={form.max}
          defaultValue={form.away}
          placeholder="?"
          className={box}
        />
      </div>
      <div
        role="alert"
        hidden={message === null}
        className="px-1.5 pb-1.5 text-center text-[0.72rem] font-semibold text-bad"
      >
        {message}
      </div>
      <div className="text-center">
        <button
          type="submit"
          disabled={busy}
          className={`${BUTTON_PRIMARY} disabled:opacity-60`}
        >
          <Icon name="check2" /> Išsaugoti spėjimą
        </button>
      </div>
    </form>
  );
}
```

Create `apps/web/src/components/predictions/single-game-view.tsx`:

```tsx
import { TeamCrest } from '../hub/team-crest';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { PLAYER_HOME } from '../shell/shell-paths';
import { SingleGameForm } from './single-game-form';

/** One game's page, in strings. */
export interface SingleGameText {
  readonly game: number;
  readonly home: string;
  readonly away: string;
  /** The tip-off, `Y-m-d H:i` in Vilnius (vilniusStamp). */
  readonly stamp: string;
  readonly locked: boolean;
  /** The player's row as typed into the boxes, or null with none. */
  readonly prediction: { readonly home: string; readonly away: string } | null;
  readonly min: number;
  readonly max: number;
}

function Team({ name }: { name: string }) {
  return (
    <div className="text-center">
      <TeamCrest team={name} size="large" />
      <div className="mt-2 font-semibold">{name}</div>
    </div>
  );
}

/**
 * game-single.blade.php: "Spėjimas", the teams, the tip-off in Vilnius
 * with " LT". Locked: the notice, and the player's prediction when it has
 * scores; open with a row: the form; with no row, "Spėjimas nerastas"
 * and the way home.
 */
export function SingleGameView({ game }: { game: SingleGameText }) {
  const { prediction } = game;
  return (
    <div data-testid="single-game" className={`${CARD} mb-4`}>
      <h1 className={CARD_TITLE}>
        <Icon name="pencil-square" /> Spėjimas
      </h1>
      <div className="my-6 flex items-center justify-center gap-6">
        <Team name={game.home} />
        <div className="text-[1.5rem] font-bold text-muted">vs</div>
        <Team name={game.away} />
      </div>
      <div className="mb-6 text-center text-[0.85rem] text-muted">
        <Icon name="clock" /> {game.stamp} LT
      </div>
      {game.locked ? (
        <>
          <div className="rounded-[6px] border border-border bg-surface-2 px-4 py-3 text-center text-muted">
            <Icon name="lock-fill" /> Žaidimas jau prasidėjo - spėjimų keisti
            negalima.
          </div>
          {prediction !== null && prediction.home !== '' ? (
            <div className="mt-4 text-center">
              <span className="text-[1.75rem] font-bold">
                {prediction.home} : {prediction.away}
              </span>
              <div className="mt-1 text-[0.82rem] text-muted">
                Jūsų spėjimas
              </div>
            </div>
          ) : null}
        </>
      ) : prediction !== null ? (
        <SingleGameForm
          form={{
            game: game.game,
            homeTeam: game.home,
            awayTeam: game.away,
            home: prediction.home,
            away: prediction.away,
            min: game.min,
            max: game.max,
          }}
        />
      ) : (
        <div className="rounded-[6px] border border-warn bg-warn-tint px-4 py-3 text-center text-warn">
          Spėjimas nerastas. Bandykite dar kartą nuo{' '}
          <a href={PLAYER_HOME} className="text-accent underline">
            pagrindinio puslapio
          </a>
          .
        </div>
      )}
    </div>
  );
}
```

The locked notice's text is split over two JSX lines by Prettier; React joins them with one space, so the rendered text is sportbet's sentence.

Create `apps/web/src/app/prediction/game/[id]/page.tsx`:

```tsx
import { loadSingleGame } from '@sportbet/db';
import {
  gameId,
  PREDICTION_MAX,
  PREDICTION_MIN,
  ruledRules,
} from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { vilniusStamp } from '../../../../components/format/vilnius-time';
import { SingleGameView } from '../../../../components/predictions/single-game-view';
import { predictionGamePath } from '../../../../components/shell/shell-paths';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { playerViewer } from '../../../../server/viewer';

const side = (score: number | null): string =>
  score === null ? '' : String(score);

/**
 * PredictionResultController::showSingleGame, behind sportbet's `auth`:
 * the reminder mail's link. A guest goes to sign in and comes back here
 * (the return path); an unknown game, or one of a tournament the player
 * may not see (R-50), is a 404; else the game's page.
 */
export default async function PredictionGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const game = /^[1-9]\d{0,9}$/u.test(id) ? gameId(Number(id)) : null;
  if (game === null || !game.ok) notFound();
  const viewer = await playerViewer();
  if (viewer === null) {
    redirect(`/login?intended=${encodeURIComponent(predictionGamePath(game.value))}`);
  }
  const single = await loadSingleGame(getDb(), {
    viewer,
    game: game.value,
    now: now(),
    rules: ruledRules,
  });
  if (single === null) notFound();
  return (
    <SingleGameView
      game={{
        game: game.value,
        home: single.home,
        away: single.away,
        stamp: vilniusStamp(single.tipOff),
        locked: single.locked,
        prediction:
          single.prediction === null
            ? null
            : {
                home: side(single.prediction.home),
                away: side(single.prediction.away),
              },
        min: PREDICTION_MIN,
        max: PREDICTION_MAX,
      }}
    />
  );
}
```

A page builds its component's props here and puts no markup in itself. If the architect reads the props mapping as more than loading, move it into a `singleGameText(single, game)` helper beside the view, with its own test.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm format && pnpm --filter @sportbet/web exec vitest run --config vitest.component.config.ts && pnpm build && pnpm test:feature && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Hand to the lead.** Commit message: `feat(web): /prediction/game/<id> - the reminder mail's page: teams and Vilnius tip-off, the form or "Žaidimas jau prasidėjo", "Spėjimas nerastas"; 404 for an unknown or hidden game (R-50); a guest through sign-in and back (#20)`.

---

### Task 13 (qa): Predicting in a browser, at 1280 and 390

**Files:**
- Create: `apps/web/e2e/predictions.spec.ts`
- Modify: `apps/web/playwright.config.ts`

- [ ] **Step 1: The config.** In `apps/web/playwright.config.ts`:
  - Add `'**/predictions.spec.ts'` to `signInJourney`, which is left out without Mailpit, as against staging.
  - Add `workers: 1` to the config, with this comment: "One worker: sign-in.spec.ts and predictions.spec.ts sign the seeded account in from one Mailpit inbox, and its codes are read as 'the newest to this address' (slice 6, decision 10)."

- [ ] **Step 2: The journey.** Create `apps/web/e2e/predictions.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { answerCookies, scrollsSideways, signIn } from './support/newcomer';

// Predicting (slice 6, #20) as the seeded account (infra/compose/e2e.yml's
// STAGING_ACCOUNT_EMAIL), which the staging seed puts in Euroleague 2026/27
// with a blank row for game 9001 (Zalgiris Kaunas - Real Madrid, to come)
// and 9002 (Real Madrid - Zalgiris Kaunas, started). One sign-in for the
// whole journey: the address allows three codes in ten minutes and
// sign-in.spec.ts uses two (decision 10).

const PLAYER = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  email: 'e2e.player@sportbet.test',
};

test.describe.configure({ mode: 'serial' });

test('from the mail\'s game link through sign-in, to the list, its autosave and odds, a locked game, and the phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // The reminder mail's link, signed out: sign in, and land back on it.
  await page.goto('/prediction/game/9001');
  await expect(page).toHaveURL('/');
  await answerCookies(page);
  await signIn(page, PLAYER);
  await expect(page).toHaveURL('/prediction/game/9001');
  const form = page.getByTestId('single-game-form');
  await form.getByLabel('Zalgiris Kaunas').fill('88');
  await form.getByLabel('Real Madrid').fill('79');
  await form.getByRole('button', { name: 'Išsaugoti spėjimą' }).click();
  await expect(page).toHaveURL('/');

  // The list: the pair kept, the badge gone.
  const rail = page.getByTestId('rail');
  await rail.getByRole('link', { name: 'Spėjimai' }).click();
  await expect(page).toHaveURL('/prediction/results');
  const open = page.locator('[data-testid="prediction-row"][data-game="9001"]');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('88');
  await expect(open.getByLabel('Real Madrid')).toHaveValue('79');
  await expect(rail.locator('[data-missing="results"]')).toBeHidden();

  // Cleared: the badge is back.
  await open.getByLabel('Real Madrid').fill('');
  await open.getByLabel('Zalgiris Kaunas').fill('');
  await expect(rail.locator('[data-missing="results"]')).toBeVisible();

  // Saved again as it is typed: green, and the odds panel opens.
  await open.getByLabel('Zalgiris Kaunas').fill('90');
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveClass(/border-ok/);
  await open.getByRole('button', { name: 'Koeficientai' }).click();
  await expect(open.getByTestId('odds-panel')).toContainText('pt');

  // A level pair is refused in sportbet's words, then put right.
  await open.getByLabel('Real Madrid').fill('90');
  await expect(open.getByRole('alert')).toHaveText(
    'Lygiosios negalimos - komandų rezultatai turi skirtis.',
  );
  await open.getByLabel('Real Madrid').fill('85');
  await expect(open.getByLabel('Real Madrid')).toHaveClass(/border-ok/);

  // The started game: locked on the list, and on its own page.
  const started = page.locator('[data-testid="prediction-row"][data-game="9002"]');
  await expect(started.getByLabel('Real Madrid')).toBeDisabled();
  await page.goto('/prediction/game/9002');
  await expect(
    page.getByText('Žaidimas jau prasidėjo - spėjimų keisti negalima.'),
  ).toBeVisible();


  // At a phone width: the "Spėjimai" tab, and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/prediction/results');
  await expect(
    page.getByTestId('bottom-tabs').getByRole('link', { name: 'Spėjimai' }),
  ).toBeVisible();
  await expect(open.getByLabel('Zalgiris Kaunas')).toHaveValue('90');
  expect(await scrollsSideways(page)).toBe(false);
});
```

The staging tournament has one round, so the round menu is not drawn (sportbet draws it only from two rounds). "Visi etapai" is covered by the feature and component tests.

- [ ] **Step 3: Run it against a fresh local stack**
  1. Build the images from `git archive HEAD`, as Task 16 of slice 5 did.
  2. Start `infra/ci/e2e-stack.sh up sb-qa-t13` and take Mailpit from `e2e-stack.sh mailpit`.
  3. Run `E2E_BASE_URL=... E2E_MAILPIT_URL=... pnpm test:e2e`.
  4. Take the stack down and remove the images.

Expected: every test passes, the earlier 29 and this one. A fresh stack is needed because codes and registrations spend their limits.

- [ ] **Step 4: Hand to the lead.** Commit message: `test(e2e): predicting from the mail's game link through sign-in, the list's autosave, badge and odds, a locked game, at 1280 and 390; one Playwright worker (#20)`.

---

### Task 14 (lead): The records

**Files:** Modify: `CLAUDE.md`. Comment: #20.

- [ ] **Step 1: `CLAUDE.md`.** After the hub bullet ("A tournament's hub data ..."), add:

```markdown
- A match prediction is decided by `predictMatch`
  (`packages/domain/src/prediction/predict-match.ts`), after the posted pair
  passes `predictionFormEntry` in sportbet's order, and written only by
  `savePrediction` (`packages/db/src/prediction/save.ts`): one transaction
  holding the player's own row (issue 254), the status a save switches back
  on (`statusAfterSave`, R-7, R-19, R-57) and the audit row for a saved
  score (`audit_prediction_games`, erased with the account, R-25; empty at
  switch-over, R-60). Odds shown before a result - the list's panel and the
  save's answer - are computed on read from the votes (`CrowdOdds.forGame`),
  never stored: `game_odds` holds only what a scored game was scored with.
  The return path's guarded shapes are the registration form and the
  prediction pages (`guardedReturnPath`).
```

- [ ] **Step 2: Note on #20**: the plan's design decisions 1 to 13, each in one line.
- [ ] **Step 3: Commit.** `docs: slice 6 - a prediction's rules and its one write path, odds on read, the guarded prediction pages in CLAUDE.md (#20)`.

---

### Task 15 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
LC_ALL=C.UTF-8 grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{23F3}]' packages apps tools --include=*.ts --include=*.tsx | grep -v node_modules | wc -l
git diff <gate> -- pnpm-lock.yaml | wc -l
git status --short | wc -l
```

Expected:
- `Done`.
- `All matched files use Prettier code style!`.
- Lint is silent, and the typecheck count is as Task 0's.
- `3` builds.
- Every suite passes, each with more tests than Task 0 recorded.
- `0` emoji typed into a source file.
- `0` lockfile lines: no new dependency.
- `0`: nothing left uncommitted.

- [ ] **Step 2: Review.**
  - Run `mp-code-review` against `<gate>..HEAD` (Standards and Spec; the spec is `docs/superpowers/specs/2026-10-06-match-predictions-design.md`).
  - A new feature landed, so run `improve-codebase-architecture` over `packages/domain/src/prediction/`, `packages/db/src/prediction/`, `apps/web/src/components/predictions/`, `apps/web/src/server/predictions/` and the new routes.
  - Present the architecture report to the owner, and act on no candidate unless the owner picks one.
  - `security-reviewer` reviews every task marked **(sensitive)** together, against sportbet's Security rules.
  - Fix what is confirmed, each fix its own commit ending with the trailer and `#20`, and re-run Step 1 after the last.

- [ ] **Step 3: Push, and watch the run to the end**

```bash
git push origin main
sleep 15
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$run" --json headSha --jq .headSha
gh run watch "$run" --exit-status
```

Expected:
- The run is for the pushed head.
- `check`, `image`, `e2e` (`predictions.spec.ts` with the earlier journeys, one worker), `staging` (migration 0011 on Neon, the seed's game 9002 and the account's rows) and `smoke` all pass.
- A failing job: read it with `gh run view "$run" --log-failed`, fix the cause, commit and push again. Never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #20.** Comment with:
  - the green run's link;
  - the test counts per suite against Task 0's;
  - the reviews' outcomes;
  - the departures (decisions 1 to 13).

  Leave #20 open for Tasks 16 and 17.

---

### Task 16 (lead, with the owner on the owner's PC): Parity still holds

- [ ] **Step 1:** The reader is untouched by this slice except the `RULINGS` entry. Build it (`pnpm --filter @sportbet/migrate build`) and give the owner one instruction to run on this PC:

```
node tools/migrate/dist/migrate.mjs --parity --sportbet-tag 3eb95e7
```

The owner pastes the verdict, the class counts, and the rulings list's new line. Expected:
- `PARITY HOLDS`, with the class counts as #19's.
- The rulings list shows `PL-1, R-7, R-57: only a saved score switches a player back on: changes no stored row`.

- [ ] **Step 2: Post on #20** the verdict and the counts per class.

---

### Task 17 (the owner, with the lead): Predicting on staging

One instruction per message; wait for each answer (the owner's preference).

- [ ] **Step 1: The first instruction**

> Slice 6 is on staging: https://sportbet-new-staging.vercel.app. Please sign in with your own account. In the left menu you should now see "Spėjimai" with a red "!" beside it. Open it: Euroleague 2026/27's "1 turas" shows Zalgiris Kaunas - Real Madrid (4 March) with two empty boxes, and Real Madrid - Zalgiris Kaunas, greyed out because it has started. Type a score into the first game, say 88 and 79: the boxes should turn green, the "!" disappear, and a small chart button appear that opens what a correct winner pays. Tell me "works", or what happened instead.

- [ ] **Step 2: The second instruction (after "works")**

> Now open https://sportbet-new-staging.vercel.app/prediction/game/9002, the started game: it should say "Žaidimas jau prasidėjo - spėjimų keisti negalima." Then sign out, and open https://sportbet-new-staging.vercel.app/prediction/game/9001: the sign-in window opens; after your code you should land back on that game with your 88 : 79 in its boxes. Tell me "works", or what happened instead.

- [ ] **Step 3: Close #20** once the owner says both work, quoting the answers and ticking "Done means". Note that the save's "Šio mačo prognozuoti nebegalima." is proven by the feature and db tests, as the owner cannot make a save arrive after a tip-off by hand (decision 11). A problem the owner names becomes a fix on this plan's files, verified as in Task 15 Step 1, pushed, and the step again.

---

## Self-review against the spec

**Spec coverage** (each spec line, the task that holds it, and its named tests):

| Spec | Task | Named tests |
|---|---|---|
| Odds on read; nothing stored on save | 2, 8, 9 | `list: an open row's panel is from the game's votes now ...`, `save: ... the answer is the odds from the votes now ...`, feature `saved: 200 with sportbet's odds and the panel ...` |
| Sign-in returns to `/prediction/results` (`?event=`) and `/prediction/game/<id>`, each shape guarded | 5, 12, 13 | `guardedReturnPath: the prediction pages (slice 6)` (2), feature `sign-in back to the prediction pages`, `a guest is sent to sign in, to come back here`, `... to come back to this game`, E2E |
| R-50 on a game | 11, 12 | `R-50: a non-public tournament's game is not found ...` (db, feature) |
| After a save on the single game, `PLAYER_HOME` | 12 | `saved: goes to the player's home` |
| `predictMatch` refusals; R-57 under both sets; R-7/R-19 | 7, 8, 9 | `save (issue 254) ...`, `save (LR-1) ...`, `save (sportbet, PL-1) ...`, `save (ruled, R-57) ...`, `statusAfterSave (PL-1)` (4), db `save (ruled, R-7, R-57) ...`, `save (ruled, R-19) ...`, `save (sportbet, PL-1) ...` |
| `winnerPointsAt` at the round's rate (R-10) | 1 | `odds panel: a right call is worth (1 + odds) x 50 x the round rate`, `oddsPanel (results.blade.php)` |
| Grouping (round, Vilnius day, tip-off); default round (R-6, R-40); badge count | 1, 3, 4 | `groupPredictionLines` (2), `predictionsRound` (4), `missingResultPredictions` (2), `dayHeader`, `PredictionsView` |
| `savePrediction`: row, status, audit in one transaction; audit only on a saved score; erased with the account (R-25); the reader reads no audit (R-60) | 8 | `savePrediction` (10); `read-columns.ts` is unchanged |
| `loadPredictionsPage`; `countMissingPredictions` (named `loadMissingResultPredictions` here) | 2 | `loadPredictionsPage` (7), `loadMissingResultPredictions` (2) |
| 6a: list, "Visi etapai" (R-58), day headers, Vilnius times (R-51), scored rows with the breakdown, locked rows, odds panel without a draw column; "Spėjimai" in rail, menu and tabs with the badge | 3, 4, 5 | the component tests of Task 4, feature `/prediction/results` (5) and `"Spėjimai" and its badge` (2) |
| 6b: same-origin POST; sportbet's 200 / 422 shapes and texts; autosave both-or-neither, saved/cleared marks, panel redraw, badge refresh, R-59 | 4, 9 | `readSaveAnswer` (4), `PredictionEditor` (7), `validationAnswer` (2), feature `POST /prediction/results/save` (13) |
| 6c: the single game's page, its states, 404s | 11, 12 | `loadSingleGame` (5), `SingleGameView` (5), `SingleGameForm` (2), feature `/prediction/game/<id>` (6) |
| E2E at 390 and 1280 | 13 | `predictions.spec.ts` |
| Done means: parity holds | 16 | the owner's run |

**Departures from the spec:**
- The save posts to `/prediction/results/save` (decision 1).
- The check order is sportbet's: fields first (decision 2).
- The answer adds `panel` (decision 3).
- The owner's staging check sees the lock, not the save's lock message (decision 11).
- The badge's count function is named `loadMissingResultPredictions`.

**Placeholder scan:** no "TBD" and no "similar to". One step checks a fact this plan could not confirm, and says what to do when it differs: Task 3 checks the four icon paths against their packages.

**Type consistency:**
- `PredictionLine`, `PredictionsPage` and `PredictionsMenuRound` (Task 2) are what `PredictionsView` and `RoundMenu` take (Task 4).
- `SaveOutcome` and `readSaveAnswer` (Task 4) match the bodies `savePredictionFromForm` answers (Task 9): `panel.home` and `panel.away` are strings, and refusals are `message` or `errors`.
- `predictMatch`'s `target`, `PredictRefusal` and `TournamentStatusRow` (Task 7) are what `savePrediction` passes and reads (Task 8).
- `PlayerViewer` is from `packages/db/src/hub/repository.ts`, which `loadSingleGame` (Task 11) and `playerViewer()` (`server/viewer.ts`) share.
