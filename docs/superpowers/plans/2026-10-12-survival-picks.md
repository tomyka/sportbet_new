# Slice 10: survival picks and the survival summary - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-10, web-dev 11-15, qa and architect review each, only the lead commits.

**Goal:** `/prediction/predictionSurvival` - the survival page, its pick save - and `/summary/predictionSurvivals`, at sportbet's URLs and texts, under R-81 to R-84 (#27, closes #13).

**Architecture:** The domain decides every pick (`survivalPickFormEntry`, then `SurvivalRun.withPick` in sportbet's order) and what both pages show (`survivalLedger`, `survivalPickPage`, `survivalSummary`). `packages/db` writes a pick only through `saveSurvivalPick`: one transaction that locks the round's game rows `FOR SHARE`, then the player's statuses, and judges under the lock. It recalculates nothing. `apps/web` has two pages and one JSON route handler. The pick grid is a client radio group that posts each click.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-survival-picks-design.md`. Rulings R-81 to R-84.

## Decisions taken while planning (refine the spec; record them in it in Task 15)

1. **`withPick(team, context, rules)` keeps its shape.** The round the page showed goes in `context.shownRound`, which is optional: a post without it skips `round-changed`, as sportbet's `?int $shownRoundID = null` does. `context.teams` is the tournament's team list (R-81). `context.survivalPlayed` is the tournament's `survival`.
2. **Selectable means `withPick` accepts.** The page calls `withPick` once per card. With 18-20 teams that costs nothing, and it is the one guarantee that the page and the save agree.
3. **The ledger ignores a derived row with null points.** A pick save writes no derived row, so after a switch a pending `survival_points` row may name the old team until the next recalculation. Only `survival_picks` says what is pending.
4. **The staging seed's round 1 plays survival and gains a game** (9004: 9005 v 9006, 2027-03-04T20:00Z). Round 1's games 9001/9002 are one pair playing twice, and 9002 has tipped off, so neither team can be picked. Task 10 checks `seed.test.ts`, `predictions.spec.ts` and the hub's counts.
5. **No survival badge.** As in slice 9, the badge stays 0 until A16's missing-predictions count is built.

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/rules/rule-set.ts`, `rule-set.test.ts` (modify) | the two fields removed (R-81) |
| `tools/migrate/src/parity/rulings.ts` (+ its tests) (modify) | the two entries removed |
| `packages/domain/src/survival/survival-run.ts`, `.test.ts` (modify) | `withPick` in sportbet's order, `usedTeams` |
| `packages/domain/src/survival/survival-pick-form.ts` (create) | `survivalPickFormEntry` |
| `packages/domain/src/survival/save-throttle.ts` (create) | `survivalSaveLimits` |
| `packages/domain/src/survival/survival-ledger.ts` (create) | `survivalLedger` |
| `packages/domain/src/survival/survival-page.ts` (create) | `survivalPickPage`, `SurvivalPickPage` |
| `packages/domain/src/survival/survival-summary.ts` (create) | `survivalSummary`, `SurvivalSummary` |
| `packages/domain/src/ranking/league-table.ts` (modify) | `'survival-summary'` page, tie comparator exported |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/survival/repository.ts` (modify) | `loadSurvivalRun`, `loadPlayerSurvivalRows`, `writeSurvivalPick` |
| `packages/db/src/survival/page.ts`, `summary.ts`, `save.ts` (create) | `loadSurvivalPickPage`, `loadSurvivalSummary`, `saveSurvivalPick` |
| `packages/db/src/index.ts` (modify) | exports |
| `packages/db/test/survival-save.test.ts`, `survival-page.test.ts`, `survival-summary.test.ts` (create) | db tests |
| `packages/db/src/seed/staging.ts`, `packages/db/test/seed.test.ts` (modify) | round 1 plays survival |
| `apps/web/src/components/survival/survival-protocol.ts` (create) | wire format |
| `apps/web/src/server/survival/save-survival.ts`, `texts.ts` (create) | the use case, the refusals' texts |
| `apps/web/src/app/prediction/predictionSurvival/page.tsx`, `save/route.ts` (create) | page and handler |
| `apps/web/src/app/summary/predictionSurvivals/page.tsx` (create) | summary page |
| `apps/web/src/components/survival/*.tsx` (create) | pick view, summary view |
| `apps/web/src/components/shell/{shell-paths,nav-entries}.ts`, `server/sign-in/guarded-pages.ts` (modify) | paths, entries, returns |
| `apps/web/tests/feature/survival.test.ts` (create) | routes and pages |
| `apps/web/e2e/predictions.spec.ts` (modify) | the journey |
| `CLAUDE.md`, the spec, the catalogue (modify) | the write path, R-81 |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`.

---

### Task 1: R-81 - the two pick fields go

**Files:**
- Modify: `packages/domain/src/rules/rule-set.ts`, `rule-set.test.ts`, `packages/domain/src/survival/survival-run.ts`, `survival-run.test.ts`, `tools/migrate/src/parity/rulings.ts` (and any test listing its keys)

`survivalPickLocksAtTipOff` and `survivalTeamOncePerRun` are removed: sportbet at 3eb95e7 locks a pick at its team's tip-off and refuses a used team as well (`SurvivalPick.php:107-109, 111-113`).

- [ ] **Step 1: Change the tests first.** In `survival-run.test.ts`, turn `survival (ruled): a pick cannot change after its team tips off` into a `for (const [set, rules] of bothSets)` test, and delete `survival (sportbet): a pick can still change after its team tips off (...)`. Make SU-5's three ruled tests (`a team used in this run is refused`, `after all 20 teams the list resets`, `a loss frees every team again`) run under both sets, and delete `survival (sportbet): re-picking a used team moves its earlier pick`. Remove the two keys from `DIFFERENCES` in `rule-set.test.ts`.
- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter @sportbet/domain test -- survival-run rule-set`. Expect FAIL: under sportbet the pick moves and the used team is accepted, and the rule set still holds two keys that are no longer listed.
- [ ] **Step 3: Implement.** Delete both fields from the `RuleSet` interface, `sportbetRules` and `ruledRules`. In `withPick`, drop both `rules.` guards so the checks always run. Rewrite `sportbetRules`' doc comment: it applies R-4 and R-11 itself (sportbet#256, #292), so neither is a difference. Remove both entries from `tools/migrate/src/parity/rulings.ts`. Update `survivalAtResultEntry`'s doc comment: both sets refuse a re-pick inside a run, and the fold stays for production's moved picks (SU-10).
- [ ] **Step 4:** `pnpm --filter @sportbet/domain test && pnpm --filter @sportbet/migrate test && pnpm typecheck`. Expect PASS.
- [ ] Commit - `feat(domain): R-81 - a survival pick locks at its tip-off and a team is used once per run in both rule sets; the two RuleSet fields go (#27, #13)`

---

### Task 2: `withPick` in sportbet's order

**Files:**
- Modify: `packages/domain/src/survival/survival-run.ts`, `survival-run.test.ts`

```ts
export interface PickContext {
  readonly season: Season;
  /** The tournament's teams (R-81: "every team used" counts these). */
  readonly teams: readonly TeamId[];
  /** The tournament plays survival (sportbet's `survival_game`). */
  readonly survivalPlayed: boolean;
  readonly now: Instant;
  /** The round the posting page showed, when it says. */
  readonly shownRound?: RoundNumber;
}

export type PickRefusal =
  | 'unknown-team'          // Ši komanda nepasiekiama.
  | 'no-current-round'      // Šiuo metu nėra raundo, kuriam būtų galima rinktis.
  | 'round-changed'         // Turas pasikeitė - perkraukite puslapį.
  | 'round-has-no-survival' // Šiame ture išlikimo žaidimo nėra.
  | 'round-already-scored'  // Šis turas jau užskaitytas.
  | 'team-not-playing'      // Ši komanda šiame ture nežaidžia.
  | 'team-already-started'  // Šios komandos rungtynės jau prasidėjo.
  | 'pick-locked'           // Tavo pasirinktos komandos rungtynės jau prasidėjo - ...
  | 'team-used-in-run';     // Šią komandą jau rinkaisi - ...

/** R-11, R-81: the teams used in the run the round's pick joins (the round itself left out). */
export function usedTeams(
  run: SurvivalRun,
  context: Pick<PickContext, 'season' | 'teams'>,
  round: RoundNumber,
): ReadonlySet<TeamId>;
```

The order follows `SurvivalPick::decide`:
1. `team` not in `context.teams` -> `unknown-team`.
2. `season.currentRound(now, rules)` is null -> `no-current-round`.
3. `shownRound` is given and differs -> `round-changed`.
4. The round's flag is off, `!survivalPlayed`, or `rules.survivalRegularSeasonOnly` with a non-regular stage -> `round-has-no-survival`.
5. The round's existing pick has a game with a `winner()` -> `round-already-scored`.
6. The team plays no game in the round -> `team-not-playing` (R-81).
7. Any of the team's games in the round is not `isOpenAt(now)` -> `team-already-started` (LR-1 closed, the owner's #13 ruling: a result before tip-off, postponed, or locked after a move).
8. The existing pick's game `hasTippedOffAt(now)` -> `pick-locked` (R-4, the clock: a pick postponed before its tip-off may still change).
9. The team is in `usedTeams(...)` -> `team-used-in-run`, counted against `context.teams.length`, not `season.teams()`.

Re-posting the current pick while its game is open is accepted, and the run is unchanged.

- [ ] **Step 1: Write the failing tests.** Change the file's `context` helper to `(season, now, extra?: Partial<PickContext>) => ({ season, teams: season.teams(), survivalPlayed: true, now: at(now), ...extra })`. Then add one test per refusal, each named by the refusal and run under both sets, plus these:
  - `survival (${set}): refusals come in sportbet's order`: a post that breaks 6 and 9 at once answers `team-not-playing`;
  - `survival (${set}): a team with no game in the round is refused (R-81)`;
  - `survival (${set}): a team whose game has a result before its tip-off is refused (R-81, LR-1)`;
  - `survival (${set}): a postponed game's team cannot be picked`;
  - `survival (${set}): a pick on a game postponed before its tip-off can still change (R-4, the clock)`;
  - `survival (${set}): the used list resets after the tournament's team list, a team without a game included (R-81)`: this replaces the `R-11: the season decides how many teams there are` describe. With `teams` = A, B, C, D and games for A-C only, A is still used after A, B, C;
  - `survival (${set}): a pending pick counts as used (R-11, R-12)`;
  - `survival (${set}): a page that names a round that moved on is refused`;
  - `survival (${set}): a post that names no round is judged on the current one`;
  - `survival (${set}): a tournament without survival refuses every pick`;
  - `survival (${set}): re-posting the current pick is accepted and changes nothing`.
- [ ] **Step 2: Run and watch them fail.** `pnpm --filter @sportbet/domain test -- survival-run`. Expect FAIL.
- [ ] **Step 3: Implement.** `existingPickKept` splits in two: the scored check runs at 5 and the lock at 8. `usedInRun` becomes the exported `usedTeams` (`foldSurvival` over the other rounds' picks, cleared on `lost`, cleared at `teams.length`). Rewrite the class's doc comment for the new order.
- [ ] **Step 4:** run the domain tests again. Expect PASS.
- [ ] Commit - `feat(domain): withPick asks sportbet's nine questions in its order (R-4, R-11, R-81) (#27)`

---

### Task 3: The form and the throttle

**Files:**
- Create: `packages/domain/src/survival/survival-pick-form.ts`, `.test.ts`, `packages/domain/src/survival/save-throttle.ts`, `.test.ts`

```ts
export interface SurvivalPickEntry {
  readonly team: TeamId;
  readonly shownRound: RoundNumber | null;
}
export type SurvivalFormRefusal = 'no-team' | 'bad-team' | 'bad-round';

/** updatePredictionSurvivalUser's validation: one refusal, in its match(true) order. */
export function survivalPickFormEntry(posted: {
  readonly teamID: string | null;
  readonly round: string | null;
}): Result<SurvivalPickEntry, SurvivalFormRefusal>;

export function survivalSaveLimits(player: PlayerId): readonly ThrottleLimit[]; // 60 / 60 s, key `survival-save:player:${player}`
```

A missing or empty `teamID` is `no-team` ("Nepasirinkta komanda."). A `teamID` that `idFromText` refuses is `bad-team`: `0`, a sign, or anything past Postgres' integer, where Laravel's `integer` would let `0` through to "Ši komanda nepasiekiama." anyway, so the text is the same. A `round` given but refused is `bad-round`; an empty `round` means the page did not say.

- [ ] Tests first: each refusal; `no-team` before `bad-round`; `bad-team` before `bad-round`; the accepted shapes. Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(domain): the survival pick form and its throttle (#27)`

---

### Task 4: `survivalLedger`

**Files:**
- Create: `packages/domain/src/survival/survival-ledger.ts`, `.test.ts`

```ts
export interface LedgerRound {
  readonly round: RoundNumber;
  readonly team: TeamId;
  readonly state: 'survived' | 'lost' | 'pending';
  /** The stored running total; null while pending. */
  readonly points: Points | null;
  /** R-34: an earlier pick still pending will change this total. */
  readonly provisional: boolean;
}

/**
 * One player's survival in round order, as the pages show it: a stored row
 * of the rule set's source with points decides its round; a pick with no
 * such row is pending. A stored row with null points is never read.
 */
export function survivalLedger(
  run: SurvivalRun,
  rows: readonly SurvivalPoints[], // this player's
): readonly LedgerRound[];
```

- [ ] Tests first: `a stored row decides its round (hit > 0, lost 0)`, `a pick without a stored row is pending`, `a stored row with null points is ignored and the pick decides (planning decision 3)`, `a stored row without a pick still shows (sportbet's stored rows)`, `provisional is the stored row's`, `round order`. Run and expect FAIL; implement; run and expect PASS.
- [ ] Commit - `feat(domain): the survival ledger - stored rows decide, picks wait (#27)`

---

### Task 5: `survivalPickPage`

**Files:**
- Create: `packages/domain/src/survival/survival-page.ts`, `.test.ts`

```ts
export type CardState =
  | { readonly kind: 'open' }
  | { readonly kind: 'started' }
  | { readonly kind: 'used'; readonly round: RoundNumber | null };

export interface SurvivalCard {
  readonly team: TeamId;
  readonly opponent: TeamId;
  readonly ground: 'home' | 'away';
  readonly state: CardState;
  readonly selectable: boolean; // withPick(team, context, rules).ok
  readonly picked: boolean;
}

export type SurvivalPickPage =
  | { readonly kind: 'over' } // "Išlikimo žaidimas baigėsi."
  | {
      readonly kind: 'open';
      readonly round: RoundNumber;
      readonly picked: TeamId | null;
      readonly verdict: { readonly state: 'survived'; readonly points: Points } | { readonly state: 'lost' } | null;
      readonly pickLocked: boolean;   // R-4: the notice, every card disabled
      readonly choosing: boolean;     // "· Rinkis komandą"
      readonly cards: readonly SurvivalCard[]; // by team id
      readonly free: number;
      readonly used: number;
      readonly run: readonly LedgerRound[]; // the current run before this round
      readonly streak: number;              // survived rows of the run
      readonly runPoints: Points;           // the sum of the run's stored rows
      readonly stake: { readonly home: number; readonly away: number }; // last running total + 10 / + 12
    };

export function survivalPickPage(input: {
  readonly season: Season;
  readonly teams: readonly TeamId[];
  readonly survivalPlayed: boolean;
  readonly run: SurvivalRun;
  readonly rows: readonly SurvivalPoints[];
  readonly rules: RuleSet;
  readonly now: Instant;
}): SurvivalPickPage;
```

The page is `over` when there is no current round, the round has no survival, or the tournament plays none (sportbet's `eventSurvival`). There is one card per team with a game in the round. `used` takes its round from the run's ledger row of that team in the current run, or null. A card is `started` when not every one of its games is `isOpenAt(now)`. `choosing` is true when the round is not scored, no pick is locked, and some card is selectable.

- [ ] Tests first:
  - each card state and its mark data;
  - `selectable equals withPick for every card`, a property over the fixtures: sportbet issue 292;
  - after a reset (every team used) every card is open again;
  - the verdict, survived and lost;
  - `pickLocked` disables every card;
  - the stake, with the last running total from the ledger (a provisional one included);
  - the run and streak with a pending earlier pick (R-12): the pick shows in the run but is not counted in the streak;
  - `over` in all three cases.
  Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(domain): the survival page - cards the save accepts, the run, the stake (#27)`

---

### Task 6: `survivalSummary`

**Files:**
- Create: `packages/domain/src/survival/survival-summary.ts`, `.test.ts`
- Modify: `packages/domain/src/ranking/league-table.ts` (`RankedPage` gains `'survival-summary'`; export `tieOrderOf(page, rules)`; sportbet's order for this page is `byteOrder`, as PHP's `<=>`)

```ts
export interface SummaryTile {
  readonly round: RoundNumber;
  readonly state: 'hit' | 'miss' | 'pending' | 'none';
  /** Null for none, and for a pick hidden from this viewer (R-82). */
  readonly team: TeamId | null;
  readonly hidden: boolean; // "Pasirinkta"
  readonly points: Points | null;
}

export interface SummaryRow {
  readonly rank: number; // position, 1-based
  readonly player: PlayerId;
  readonly username: string;
  readonly initials: string;
  readonly me: boolean;
  readonly tiles: readonly SummaryTile[]; // one per summary round
  readonly streak: number;                // trailingHits
  readonly total: Points;                 // TournamentTotal.survival
  readonly provisional: boolean;          // R-83: "~"
}

export function survivalSummary(input: {
  readonly season: Season;
  readonly rules: RuleSet;
  readonly now: Instant;
  readonly viewer: PlayerId;
  readonly players: readonly { player: PlayerId; username: string; initials: string }[]; // the listed players
  readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
  readonly rows: readonly SurvivalPoints[];
  readonly totals: readonly TournamentTotal[];
}): { readonly rounds: readonly RoundNumber[]; readonly rows: readonly SummaryRow[] };
```

`rounds` (R-84) is the season's rounds with `survival` and a number up to `currentRound(now, rules)`, or every survival round when there is none. A pending tile is `hidden` unless the viewer made the pick, or the picked team's game in that round `hasTippedOffAt(now)` or has a result (R-82). `provisional` is true when any of the player's ledger rows in `rounds` is provisional. Rows are ordered by total, then streak, then `tieOrderOf('survival-summary', rules)` on usernames.

- [ ] Tests first:
  - R-82: hidden before tip-off, shown at tip-off, shown with a result, shown when postponed after its tip-off, always shown to the viewer;
  - R-83: "~" only with a provisional row;
  - R-84: the window at round 5 lists 1-5; with no current round it lists every round; with `survivalRegularSeasonOnly` there is no round 39;
  - the trailing run: a pending tile and a none tile are skipped, a miss stops;
  - the order under `ruledRules` (Š after S) and under `sportbetRules` (byte order);
  - a listed player without picks gets a row of `none` tiles and a zero total.
  Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(domain): the survival summary - R-82 hidden picks, R-83 provisional totals, R-84 rounds (#27)`

---

### Task 7: `loadSurvivalPickPage`

**Files:**
- Modify: `packages/db/src/survival/repository.ts`
- Create: `packages/db/src/survival/page.ts`, `packages/db/test/survival-page.test.ts`

```ts
export async function loadSurvivalRun(db: Executor, tournament: Tournament, player: PlayerId): Promise<SurvivalRun>;
/** One player's survival rows of the source: read only, never summed (totals: loadTournamentTotals). */
export async function loadPlayerSurvivalRows(db: Executor, tournament: Tournament, source: PointsSource, player: PlayerId): Promise<SurvivalPoints[]>;

export interface SurvivalPickPageData {
  readonly page: SurvivalPickPage;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  readonly roundName: string | null; // rounds.name; null when the page is over
}
export async function loadSurvivalPickPage(
  db: Executor,
  load: { player: PlayerId; tournament: Tournament; rules: RuleSet; now: Instant },
): Promise<SurvivalPickPageData>;
```

The page reads the season (`loadSeason`), the tournament's teams with their names, the tournament's `survival`, the player's run and the player's rows of `rules.name` (the rule set's source). It is decided by `survivalPickPage`. Every row is parsed before it leaves `db`.

- [ ] Tests first (`useTestDatabase`): a seeded tournament gives the expected cards, run and stake; the rows read are those of the rule set's source only; another player's picks are not read; an empty run. Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(db): loadSurvivalPickPage (#27)`

---

### Task 8: `saveSurvivalPick`

**Files:**
- Create: `packages/db/src/survival/save.ts`, `packages/db/test/survival-save.test.ts`
- Modify: `packages/db/src/survival/repository.ts` (`writeSurvivalPick`: one upsert on `survival_picks_pk`)

```ts
/**
 * PredictionSurvivalController::updatePredictionSurvivalUser, as the form
 * passed it (survivalPickFormEntry): the posted team's tournament, the
 * round's game rows of the posted team and of the player's current pick
 * locked FOR SHARE in game id order, then the player's statuses
 * (lockPlayerStatuses) as the mutex of their picks; the season and the run
 * read again under the locks and judged by SurvivalRun.withPick at the
 * later of `now` and the database's time; one survival_picks row written.
 * Nothing is recalculated, no status changes, no tournament lock is taken.
 * A refusal writes nothing (decideUnderLock).
 */
export async function saveSurvivalPick(
  db: Executor,
  save: { player: PlayerId; entry: SurvivalPickEntry; rules: RuleSet; now: Instant },
  clock: DatabaseClock = databaseClock,
): Promise<Result<SurvivalPick, PickRefusal>>;
```

`load` resolves the posted team's tournament; a team that is not stored is null, which is `unknown-team`. It reads the season unlocked to find the current round, then locks those games in id order and `lockPlayerStatuses(tx, player)`. When the player has no row in that tournament it returns null, which is again `unknown-team`. Then it re-reads the season and the run and returns `{ run, context }` with `now = await judgedAt(tx, clock, now)`. `decide` is `run.withPick(...)` plus a check that the decided round is still the one locked: if not, `round-changed`. `write` is `writeSurvivalPick`.

- [ ] Tests first:
  - a pick written, then switched within the round, leaves one row;
  - a refusal writes nothing, also inside a caller's transaction (a savepoint);
  - a team of another tournament, or a player not in its tournament, gets `unknown-team`;
  - judged at the database's time under the lock: a lagging clock is never early, and a save that waits across the tip-off is refused;
  - two concurrent posts by one player for the last free team: one is accepted, the other gets `team-used-in-run`;
  - a game row held `FOR UPDATE` by another transaction for over 5 s fails the save with 55P03;
  - no `survival_points` row and no status changes.
  Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(db): saveSurvivalPick - game rows then statuses, judged under the lock (#27)`

---

### Task 9: `loadSurvivalSummary`

**Files:**
- Create: `packages/db/src/survival/summary.ts`, `packages/db/test/survival-summary.test.ts`

```ts
export interface SurvivalSummaryData {
  readonly summary: ReturnType<typeof survivalSummary>;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
}
export async function loadSurvivalSummary(
  db: Executor,
  load: { viewer: PlayerId; tournament: Tournament; rules: RuleSet; now: Instant },
): Promise<SurvivalSummaryData>;
```

It reads through `loadTournamentStanding` (listed players, `rows.survival`, totals, usernames), `loadSurvivalRuns`, `loadSeason`, the round names and team names, and the listed players' `displayInitials` (the username's first letter when both are empty). A surname never leaves `db`. The roster comes only from `loadTournamentStanding`'s `listed`: there is no query of its own on `tournament_players`, and the initials are read for exactly those players. Slice 12 adds a roster scope parameter there (a league, guests against the viewer: `LeagueRoster::visibleTo`), and that one change narrows this summary too.

- [ ] Tests first: the roster is the listed players only (a switched-off or hidden player is left out, RA-4); the total is the stored total; the initials, with no surname in the result; the rule set's source only. Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(db): loadSurvivalSummary through loadTournamentStanding (#27)`

---

### Task 10: The staging seed plays survival

**Files:**
- Modify: `packages/db/src/seed/staging.ts`, `packages/db/test/seed.test.ts`

Round 1 gets `survival: true` and the game `{ id: 9004, round: 1, home: '9005', away: '9006', tipOff: '2027-03-04T20:00:00Z' }` (planning decision 4).

- [ ] Update `seed.test.ts`'s expectations. Then run it, `apps/web/e2e/predictions.spec.ts` and the hub's feature tests, and fix any count that moved: round 1 now lists two open games.
- [ ] Commit - `chore(seed): staging round 1 plays survival, with a pickable game (#27)`

---

### Task 11: The wire format, the use case and the route

**Files:**
- Create: `apps/web/src/components/survival/survival-protocol.ts`, `.test.ts`, `apps/web/src/server/survival/save-survival.ts`, `.test.ts`, `texts.ts`, `apps/web/src/app/prediction/predictionSurvival/save/route.ts`
- Modify: `apps/web/src/components/shell/shell-paths.ts` (`SURVIVAL_PATH = '/prediction/predictionSurvival'`, `SURVIVAL_SAVE_PATH`, `SURVIVAL_SUMMARY_PATH = '/summary/predictionSurvivals'`)

```ts
export const SURVIVAL_FIELDS = { team: 'teamID', round: 'round' } as const;
export type SurvivalSaveAnswer =
  | { status: 200; body: { success: true } }
  | { status: 422; body: { success: false; message: string } }
  | { status: 429; body: ReturnType<typeof throttledBody> }
  | { status: 503; body: { success: false; message: string } };
```

`texts.ts` maps every `SurvivalFormRefusal` and `PickRefusal` to sportbet's text, verbatim (the spec's reference list). Every texts test compares against the literal string. `saveSurvivalPickFromForm` runs the form first, so a refused form does not count against the throttle. Then come `survivalSaveLimits` and `saveSurvivalPick(db, { ..., rules: ruledRules })`. A 55P03 becomes 503 "Pasirinkimas neišsaugotas. Bandykite dar kartą.", the way `saveStandingsRowFromForm` handles it. It calls no `pointsChanged()`. The route is `autosaveRoute` (same-origin, guest 401).

- [ ] Tests first: every refusal's text; the form before the throttle; 503 on a lock timeout. Run them and expect FAIL; implement; run them and expect PASS.
- [ ] Commit - `feat(web): the survival pick's route handler and its texts (#27)`

---

### Task 12: The pick page

**Files:**
- Create: `apps/web/src/app/prediction/predictionSurvival/page.tsx`, `apps/web/src/components/survival/survival-view.tsx`, `survival-grid.tsx`, `survival-run-card.tsx`, `survival-rules.tsx` (each with `.test.tsx`)
- Modify: `apps/web/src/components/shell/nav-entries.ts`, `server/sign-in/guarded-pages.ts` (`survival: []`), `apps/web/tests/feature/survival.test.ts` (create)

The page works like `app/prediction/standings/page.tsx`: a guest goes to `signInAndReturn('survival')`, a player with no tournament goes to `/`, and anyone else gets `loadSurvivalPickPage(..., rules: ruledRules)` and then `<SurvivalView data={...} />`. The view uses sportbet's markup and texts (the spec's reference):
- the hero: "Iš eilės", the pips, "Surinkta serijoje **N** taškų", the verdict, and "+N" "Už šį turą";
- the card: the heading with "· Rinkis komandą", "Laisvų: x · Panaudotų: y", the lock notice, the alert, and the hint;
- the grid: a `role="radiogroup"` labelled "Rinkis komandą", with each card a radio. A disabled card is not selectable;
- each card has its crest (`TeamCrest`), name, line and mark;
- "Tavo serija" with chips: ":round turas · +:points", and ":round turas · dar nežinoma" for a pending pick;
- "Taisyklės": the four rules, with the home/away text since 10 and 12 differ, and the points table.

A click posts at once with `teamID` and `round`. On 200 it keeps the radio and moves the stake. On anything else it shows the message (a 422's own, otherwise the fallback) in the `role="alert"` and puts the radio back on the held pick.

Navigation: add "Išlikimas" after "Eiga" in `NAV_ENTRIES`: `icon: 'bullseye'`, `group: 'main'`, `surfaces: ['rail', 'menu', 'tabs']`, `badge: 'survival'`, `shownWhen: (view) => view.nav.survival`.

- [ ] Component tests first:
  - each card state's line and mark;
  - disabled cards cannot be chosen;
  - the stake follows the radio ("+10/12" before a pick);
  - a 422 shows its message and reverts;
  - a 503 shows the fallback;
  - the run chips, pending included;
  - the rules table values (10..50 / 150, 12..60 / 180);
  - the `over` card;
  - no colour literals (token guard).
- [ ] Feature tests: the page for a player, a guest's return after sign-in, no tournament, the `over` page; every save answer (each text, 422, 403 cross-site, 401 guest, 429).
- [ ] Commit - `feat(web): the survival page at /prediction/predictionSurvival (#27)`

---

### Task 13: The summary page

**Files:**
- Create: `apps/web/src/app/summary/predictionSurvivals/page.tsx`, `apps/web/src/components/survival/survival-summary-view.tsx`, `survival-board.tsx` (each with `.test.tsx`)
- Modify: `nav-entries.ts`, `guarded-pages.ts` (`survivalSummary: []`), `apps/web/tests/feature/survival.test.ts`

The page loads `loadSurvivalSummary(..., rules: ruledRules)` and returns `<SurvivalSummaryView data={...} />`. The view has the header, the legend (four tiles drawn by the same component as the board's), and the board: an `<ol>` of rows. Each row shows the rank (the top one marked), the initials avatar, the username, the run, "Iš eilės", and "~N" / "N" with "taškų". The viewer's row is marked.

A tile's title is "<round name> · <team> · <points>", "· dar nežinoma", or "· nepasirinkta"; a hidden pick reads "<round name> · Pasirinkta · dar nežinoma" with no crest. Every run shares one `scrollLeft`, starts anchored at the right, and has arrows "Ankstesni turai" / "Vėlesni turai" that show only when the runs overflow. If there are no rounds or no players, the page shows "Išlikimo turų šiame turnyre dar nėra.".

Navigation: add "Išlikimas" with `icon: 'shield-check'`, `group: 'summary'`, `surfaces: ['rail', 'menu']`, `shownWhen: (view) => view.nav.summary && view.nav.survivalSummary`, listed after the main entries.

- [ ] Component tests first:
  - the legend;
  - each tile state and title;
  - "Pasirinkta" with no crest;
  - "~22";
  - the viewer's row;
  - the arrows shown only when the board overflows (stub the sizes);
  - the empty card.
- [ ] Feature tests: the page for a player, a guest's return, no tournament, the empty summary, another player's pending pick hidden.
- [ ] Commit - `feat(web): the survival summary at /summary/predictionSurvivals (#27)`

---

### Task 14: E2E

**Files:**
- Modify: `apps/web/e2e/predictions.spec.ts` (inside its signed-in journey: no new sign-in, because the seeded address's codes are already spent)

At 1280:
1. Open "Išlikimas" from the rail and pick the first selectable team (read its name from the grid; don't assume it).
2. Switch to another selectable team.
3. Reload: the switch was kept.
4. Pick a team whose game has started (9001 or 9002). It is disabled, so assert the disabled state rather than a refusal.
5. Open the summary: the viewer's round-1 tile shows their team.

At 390: no sideways scroll on either page (`scrollsSideways`).

- [ ] `pnpm test:e2e -- predictions.spec.ts`. Expect PASS.
- [ ] Commit - `test(e2e): survival pick and summary at 1280 and 390 (#27)`

---

### Task 15: Docs

**Files:**
- Modify: `CLAUDE.md`, the spec, `docs/superpowers/specs/2026-09-29-euroleague-rules-catalogue.md`

- [ ] **CLAUDE.md**, after the standings paragraph, add:

```markdown
- A survival pick is decided by `SurvivalRun.withPick`
  (`packages/domain/src/survival/survival-run.ts`), after the post passes
  `survivalPickFormEntry`, in sportbet's order (`SurvivalPick::decide`),
  and written only by `saveSurvivalPick` (`packages/db/src/survival/save.ts`):
  one transaction on the posted team's tournament, the round's game rows
  locked FOR SHARE, then the player's statuses (`lockPlayerStatuses`) as
  the mutex of their picks, judged under the lock. A save recalculates
  nothing and switches nothing back on; saves are limited per player
  (`survivalSaveLimits`). What the survival page and summary show comes
  from the rule set's stored rows and the picks (`survivalLedger`); a card
  is offered only when `withPick` accepts it.
```

  In the lock-order paragraph, add: "A survival pick takes no tournament lock: the round's game rows FOR SHARE in id order, then `lockPlayerStatuses`, waiting at most 5 s."
- [ ] **Catalogue:** SU-4 and SU-5's "Sets" lines become "same (R-81): ..."; the tests named there follow Task 1. Fix item 3 of "Sources" (`:34-35`).
- [ ] **The spec:** add the five planning decisions under "Lead decisions".
- [ ] Commit - `docs: slice 10 - the survival write path in CLAUDE.md; R-81 in the catalogue; the plan's decisions in the spec (#27, #13)`

---

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] Parity run (`tools/migrate --parity`) still holds: R-81 changes no stored point.
- [ ] `mp-code-review` from 3f0d2d0; `improve-codebase-architecture` on the new files (a new feature landed).
- [ ] Push; CI deploys staging; the owner checks the done-means; close #13 (R-81) and #27.
