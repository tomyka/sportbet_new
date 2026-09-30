# Parity Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `--parity --sportbet-tag <commit>` stage of the production-copy reader that runs sportbet's own full recalculation on the restored copy (oracle b), classifies every `point_results`, `point_standings`, `point_survivals` and `game_odds` row as `match`, `stale`, `new-code-wrong` or `refused` against production's rows (oracle a) and the new code under `sportbetRules`, measures each owner ruling one `RuleSet` field at a time, compares every league's ranking with sportbet's own, and prints a parity report whose verdict is `PARITY HOLDS` only when no row is `new-code-wrong`.

**Architecture:** `packages/db` gains the one "recalculate under a rule set" operation (`recalculateUnderRuleSet`, and `loadInputsUnderRuleSet` for in-memory runs), which the reader's load and the golden db test use. The reader reads the restored MySQL as today (oracle a), then starts sportbet's own image on a private, internal Docker network beside that MySQL, runs one `php artisan tinker --execute` script (full recalculation, standings recalculation, every league's ranking as ids), and reads the same copy again through the same `READ_COLUMNS` and `mapSportbet` (oracle b), before the MySQL is removed. After the load and the recalculations, `tools/migrate/src/parity/` compares in memory: `compare.ts` (pure classification), `rulings.ts` (one field at a time through `recalculateTournament`), `rankings.ts` (the domain's `rankPlayers` against sportbet's), `report.ts` (text and JSON) and `stage.ts` (the assembly run.ts calls). Nothing of oracle (b) is stored.

**Tech Stack:** TypeScript 6.0 (strict), Zod 4, Drizzle ORM 0.45 on node-postgres, Vitest 5, Testcontainers 12.1 (and its dockerode client for the network), mysql2 3.24, esbuild 0.28, Docker (`postgres:18.6`, `mysql:26.7.0`, sportbet's `sportbet-app:<commit>` built locally from `docker/staging/Dockerfile --target app`), PHP 8.4 / Laravel tinker inside that image only.

**Spec:** `docs/superpowers/specs/2026-09-30-parity-checker-design.md`. **Scope:** `docs/phase-2-inventory.md` section 6. **Issue:** #11 (part of #1). **Builds on:** #9 (the reader) and #12 (one tournament save), both on `main` before Task 1 (Task 0).

---

## Conventions for every task

- Work on `main` (trunk-based, `CLAUDE.md`). Each task names the teammate role that owns its folders (`docs/agent-team.md`): the teammate edits only those folders; `qa` reviews every task against its criteria and `architect` against the rules; **only the lead commits**, once both have passed the task. Every commit message references `#11` and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push until Task 13.
- Shell snippets are Git Bash on Windows, run from the repository root `D:\Projects\sportbet_new`. The db and migrate suites need Docker running. Prefix a `docker` command that names a path inside a container with `MSYS_NO_PATHCONV=1` (Git Bash rewrites `/var/...` otherwise).
- Docker is used only through Testcontainers, its dockerode client and `docker exec`/`docker build` as the steps say. Never start, stop or touch a `sportbet-staging-*` container, and never prune anything.
- **Only one migrate suite at a time on this PC.** The reader's end-to-end tests check that no `sportbet-migrate-*` directory, labelled container or labelled network is left anywhere on the PC, so two `pnpm test:migrate` runs at once (two teammates, or a teammate and the lead) fail each other's checks. This happened while this plan was written; it is not a bug to fix. The lead says who runs it.
- **No production data, at any step.** The old app runs in tests only on the synthetic dump (sentinel names and emails). Task 14 is the owner's manual run on the latest backup; it is not part of this plan's execution and not part of CI.
- **The old app's image is built, never pulled** (design decision 1). Task 0 builds `sportbet-app:1ac955f` on this PC; every migrate run from Task 8 on needs it.
- The domain imports only `zod`; `packages/db` never imports web or the reader; `tools/migrate` imports only `@sportbet/db` (and its `migrations` entry), `@sportbet/domain`, `zod`, `mysql2`, the Testcontainers packages and Node built-ins. Lint enforces all of it. No `any`, no `as` other than `as const`, no `!`.
- Every verify step runs `pnpm format` first; the code below is already formatted as Prettier leaves it, so `pnpm format:check` must then pass.
- "sportbet" means the old app at `1ac955f` (`D:\Projects\sportbet`), the commit production runs and the parity tests pin, unless a step names another commit. The rules catalogue cites `0da316f`, which differs from `1ac955f` only by R-42.
- **Test counts.** Every count given for a new test file is exact: each was produced while writing this plan, by running that file on a copy of `tools/migrate` and `packages/db` at `68c6346` with this plan's changes applied (the end-to-end parity test included, on the real `sportbet-app` image of `0da316f`). #8 then moves the golden scenario to R-42 (`1ac955f`); the only values that change are the golden league's totals (ada and cai +30.00, Tasks 5 and 8), recomputed here from sportbet's own change (ae59615: ada's EL h3 full 149.50 -> 179.50; cai's EL h3 now 95:90, full 119.50 -> 149.50), not rerun, and marked so. Row counts and classes do not change. A suite's total is given relative to the gate's (Task 0 records it), because #9's review fixes, #8 and #12 land in between.

## File map

```
packages/db/src/recalculation/repository.ts   + loadInputsUnderRuleSet, recalculateUnderRuleSet, RuleSetRecalculationRefusal
packages/db/src/index.ts                      exports them
packages/db/test/golden.test.ts               the golden master saves through recalculateUnderRuleSet
tools/migrate/src/load.ts                     recalculateLoaded calls recalculateUnderRuleSet
tools/migrate/src/map.ts                      MappedTournament + leagues, refusedPoints; League, RefusedPoints
tools/migrate/src/parity/compare.ts           the pure classification: match | stale | new-code-wrong | refused (new)
tools/migrate/src/parity/rulings.ts           RULINGS (every RuleSet field), rulingsImpact (new)
tools/migrate/src/parity/rankings.ts          compareRankings, OldAppRank (new)
tools/migrate/src/parity/report.ts            ParityReport, describeTournament, namesOf, parityReport, renderParity (new)
tools/migrate/src/parity/stage.ts             checkParity: the stage run.ts calls (new)
tools/migrate/src/sportbet-app.ts             OLD_APP_SCRIPT, parseOldAppOutput, parityOptionOf, runSportbetApp (new)
tools/migrate/src/containers.ts               + SPORTBET_APP_IMAGE, imageExists, the private network, startSportbetApp, labelled networks
tools/migrate/src/run.ts                      the parity stage, the old app's cleanup
tools/migrate/src/problem.ts                  + stages old-app, read-old-app, parity
tools/migrate/src/report.ts                   Report.parity, its exit status and its lines
tools/migrate/src/bin/migrate.ts              --parity, --sportbet-tag
tools/migrate/src/**/*.test.ts                compare, rulings, rankings, parity report, sportbet-app (new); report (extended)
tools/migrate/test/map.test.ts                leagues and refusedPoints
tools/migrate/test/fixtures/create-tables.ts  + points_calculations (the old app reads it)
tools/migrate/test/fixtures/sportbet-dump.ts  + points_calculations: []
tools/migrate/test/support/reader-containers.ts  + SPORTBET_TEST_TAG
tools/migrate/test/reader-parity.test.ts      the parity stage end to end (new)
tools/migrate/README.md                       --parity, building the image, finding production's tag
.github/workflows/ci.yml                      builds sportbet-app:1ac955f before pnpm test:migrate
CLAUDE.md, docs/decisions.md, docs/phase-2-inventory.md   the records
```

## Design decisions this plan makes

None is a scoring rule; each is how the spec is held, and each departs from its letter only where the code or the infrastructure showed it had to:

1. **The old app's image is built on this PC, never pulled.** The spec first assumed `ghcr.io/tomyka/sportbet-app:<tag>` could be pulled (it now says the image is built locally). It cannot be: `gh api users/tomyka/packages/container/sportbet-app` answers 404 and an anonymous pull is denied, because sportbet's CI never pushes it - its `production` job ships the image with `docker save | ssh ... docker load` (`.github/workflows/ci.yml` in sportbet); production's images are arm64 only (built on the A1 runner); and `tomyka/sportbet` is private. So `--sportbet-tag <commit>` names a local image `sportbet-app:<commit>` - with no registry prefix, since it is never pushed or pulled (sportbet's own CI tags its images `ghcr.io/tomyka/...` only as a name for `docker save`; nothing here needs that) - that must already be on this PC, built from that commit with the same Dockerfile and target sportbet's CI uses (`docker/staging/Dockerfile --target app`; its base images are pinned by digest and its dependencies by `composer.lock` and `package-lock.json`, so the code is the code production runs, native to this PC). The reader checks for it before fetching anything and never pulls. CI builds `1ac955f`'s from a checkout made with a read-only token (Task 10, owner step Task 11). Verified while writing this plan, on `0da316f`'s image: it builds in a few minutes, and the tinker script below runs on it against the synthetic dump in under a second. Nothing the script or the build uses changed between `0da316f` and `1ac955f`: `git diff --stat 0da316f 1ac955f` over `docker/staging`, `composer.json`, `Recalculation.php`, `PointController.php`, `PointStandingController.php`, `Ranking.php` and `LeagueRoster.php` is empty.
2. **Oracle (b) is taken before the MySQL is removed.** The spec places the parity stage between the recalculation and the report, but the reader removes its MySQL as soon as it has read it. So the old app runs, and the copy is read back, right after oracle (a) is read; the comparison runs after the recalculation, as the spec says. Both reads go through `readSportbet` and both are mapped through `mapSportbet`, so oracle (b) passes the same `READ_COLUMNS` and `sportbetColumns` as oracle (a) (spec 2), and only its points rows are kept, in memory.
3. **The private network is made through dockerode**, as Testcontainers' `Network` has no internal option: `Internal: true` (no route off the PC), labelled `sportbet-migrate=<run>` and with the pid label like the containers. The MySQL joins it under the alias `sportbet-mysql` and keeps its loopback port for the reader; the old app's container has this network only and publishes no port. The cleanup removes the network after the containers on it (Docker refuses a network in use), the preflight removes an abandoned run's, and the final check fails the run if one is left.
4. **One tinker run, markers and ids only.** The three steps run in one `php artisan tinker --execute`, as the image's default user (root), over an idle `tail -f /dev/null`: a marker after each step, then the rankings as `league`, `user` id, `rank` and the total to the cent (`number_format(Ranking::leaderboardTotal($row), 2, '.', '')`, PHP's half-away-from-zero, read back exactly with `decimalUnits`). Every member is visible with the viewer guest level `PHP_INT_MAX`; `LeagueRoster` still drops a switched-off player, as sportbet's leaderboard does. What the app prints is parsed and never printed: a failure is its exit code and how many steps finished. `getAllUserPoints` selects `users.name` and `surname` inside the container; the script never prints them.
5. **A survival row is keyed by sportbet's id.** sportbet's refold updates `point_survivals` in place (`PointSurvivalController::recalculateSurvivalPoints`), so ids survive oracle (b), and every row the new code refolds under `sportbetRules` names the production row it rewrites. The report names the row by player and round.
6. **`refused` covers the rows the reader could not feed alike.** A row is `refused` when the reader refused it, or refused the prediction or standings row it is scored from while that row's game, team and player loaded (the new code never scores it; sportbet does), or when it is a match row of a game whose odds rows were refused (the new code scores it at CO-5's 1.0, sportbet at one of those rows). The synthetic dump shows why: sportbet scores dan's `generated` of `'2'`, which the reader refuses, so its `point_results` row is `refused`, not `new-code-wrong`. A row a refused row feeds indirectly (a crowd count, a serija) is not caught; the report says so under "cannot check".
7. **Only scored games' odds are compared.** sportbet inserts a blank `game_odds` row with every game; the new code writes odds only for a scored game (CO-7).
8. **Rulings run over every field, typed.** `RULINGS` is a record over every `RuleSet` field, so a new field does not compile until it is classed as read by `recalculateTournament` or not; points changed are summed from `recalculateTournament`'s own totals (players' totals are derived only there, `CLAUDE.md`). The "all rulings" line recalculates `ruledRules` in memory from the same inputs the reader stored its `ruled` rows from, with the same function.
9. **`recalculateUnderRuleSet(db, tournament, rules)` takes the `Tournament`**, as every repository function does, not a tournament id; it returns the refusal or `null`. Its read half, `loadInputsUnderRuleSet`, is exported for the rulings runs, which save nothing.
10. **`parity/stage.ts`** holds the stage's assembly; `run.ts` calls it once (spec 6 says run.ts gains the stage; this keeps run.ts's lifecycle code apart from the comparison).
11. **The synthetic dump gains `points_calculations`, empty.** sportbet's full recalculation rescores the dump's football game through that table; a missing lookup scores 0, so no rows are needed. The reader never reads it.
12. **The tests pin sportbet `1ac955f`**, the commit production runs and the one #8 regenerated `golden-points.json` - the synthetic dump's production rows - from (`SPORTBET_TEST_TAG`, the SHA in CI, and the image Task 0 builds). If #8 regenerated from another commit, Task 0 records that SHA and it replaces `1ac955f` in all three.

## Findings the lead passes to the owner

- **Production runs `1ac955f`** (deployment of 2026-09-30 20:20 UTC), which includes sportbet#291 (R-42), and was recalculated after that deploy (owner, 2026-10-01). #8's R-42 half lands before this plan (Task 0), so the new code under `sportbetRules` scores R-42 as production does, and the tests pin `1ac955f`. R-38 follows sportbet#274 as a later commit to pin.
- **The image is not on ghcr.io at all** (decision 1): CI needs a read-only token to sportbet's repository (Task 11, one owner step).

---

### Task 0 (lead): The gate - #9's review fixes and #12 on `main`, and the old app's image

**Files:** none.

- [ ] **Step 1: All three are in: #9's review fixes, #8's R-42 half, #12.**

```bash
gh issue view 12 --json state --jq .state
grep -n "export function inputReadsOf" packages/domain/src/rules/input-reads.ts
grep -n "inputReadsOf" packages/domain/src/index.ts
grep -n "source: PointsSource" packages/db/src/recalculation/repository.ts packages/db/src/survival/repository.ts
grep -n "saveTournamentSnapshot" packages/db/src/index.ts tools/migrate/src/load.ts packages/db/test/golden.test.ts
grep -n "bingo: 50" packages/domain/src/prediction/match-scoring.ts
grep -n "1ac955f" packages/domain/src/golden/golden-scenario.ts
grep -n "'cai', 3, 95, 90" packages/domain/src/golden/golden-scenario.ts
git status --short | wc -l
```

Expected: `CLOSED`; one line each for `input-reads.ts` and `index.ts`; the `source: PointsSource` parameter in both repositories; `saveTournamentSnapshot` exported by db and used by `load.ts` and the golden test; R-42 in the domain's Euroleague points (bingo 50, the exact-margin +20 under both rule sets, #8); the golden scenario regenerated from sportbet `1ac955f` (its header names the commit, and cai's EL h3 prediction is 95:90, as sportbet's own golden scenario has had since ae59615); `0` changed files. If any is missing, the gate is not met: stop. If #8 regenerated the golden fixture from a commit other than `1ac955f`, note that SHA: it replaces `1ac955f` in Task 0 Step 4, Task 8 Step 2 (`SPORTBET_TEST_TAG`) and Task 10 (the CI ref, which takes the full SHA, and the image tag).

- [ ] **Step 2: The names this plan assumes, at the gate.** Each of these was read in #9's review-fix work in progress while this plan was written; confirm each, and reconcile any that differs with `backend-dev` before Task 1 (the task that uses it is in brackets):

  - A1. `inputReadsOf(rules): InputReads` and `type InputReads` are exported from `@sportbet/domain` (`packages/domain/src/rules/input-reads.ts`), and no longer from `@sportbet/db` [1, 4].
  - A2. `loadTournamentInputs(db, tournament, reads, source: PointsSource)`: the stored odds and survival rows it reads are those of `source` [1].
  - A3. `saveTournamentPoints(db, tournament, source, rows)` is still exported by `packages/db/src/points/repository.ts` (#12 may drop it from the package's index; `recalculateUnderRuleSet` imports it from the file) [1].
  - A4. `packages/db/test/golden.test.ts` has in scope `db`, `GOLDEN_EL`, `IDS`, `unwrap`, `goldenOdds`, `snapshotOf`, `GOLDEN_POINTS`, `GOLDEN_POINTS_RULED`, `sportbetRules` and `ruledRules`, and a test that saves `sportbet` and `ruled` rows by hand (at `68c6346`: `golden (db): a recalculation saved under its rule set reads back as the same rows`) [1].
  - A5. `tools/migrate/src/map.ts` holds, once each and inside the function that maps one pass (`mapSportbet`, or the `mapWith` #9's fix introduces): the lines `readonly production: PointsRows;`, `const members = new PerTournament<number>();`, `    members.add(tournament, row.user_id);`, `        survival: survivalPoints.of(id).map(({ row }) => row),`, `  // Each loaded tournament: its players are its leagues' members and`, and the imports `  type GameOdds,` and `  type TeamOutcome,`; and the names `games`, `teams`, `rounds`, `users`, `predictions`, `standingsRows`, `matchPoints`, `standingsPoints`, `survivalPoints`, `odds` and `leagueTournament` in that scope [2].
  - A6. `tools/migrate/src/run.ts`, `containers.ts`, `problem.ts` and `bin/migrate.ts` are as at `68c6346`, and `report.ts` still has `if (report.problem !== null)` in `renderReport` [6, 7, 9].

```bash
for line in "readonly production: PointsRows;" "const members = new PerTournament<number>();" "    members.add(tournament, row.user_id);" "        survival: survivalPoints.of(id).map(({ row }) => row)," "  // Each loaded tournament: its players are its leagues' members and" "  type GameOdds," "  type TeamOutcome,"; do printf '%s\n' "$(grep -cF -- "$line" tools/migrate/src/map.ts)"; done | sort | uniq -c
git diff --stat 68c6346 -- tools/migrate/src/run.ts tools/migrate/src/containers.ts tools/migrate/src/problem.ts tools/migrate/src/bin/migrate.ts
```

Expected: `      7 1` (each of the seven lines once) and no diff for the four files.

- [ ] **Step 3: Record the baseline.** Run the suites and note each `Tests` count; later tasks give their totals relative to these.

```bash
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: every suite passes (the counts are whatever the gate holds).

- [ ] **Step 4: Build the old app's image the tests run.** From `D:\Projects\sportbet` at `1ac955f`, with sportbet's own Dockerfile and target, into this PC's Docker only:

```bash
git -C /d/Projects/sportbet cat-file -t 1ac955f
git -C /d/Projects/sportbet archive 1ac955f | docker build -q -f docker/staging/Dockerfile --target app -t sportbet-app:1ac955f -
docker image ls sportbet-app --format '{{.Repository}}:{{.Tag}}'
```

Expected: `commit`; an image id (`sha256:...`, a few minutes the first time); `sportbet-app:1ac955f`. (The plan's author left `ghcr.io/tomyka/sportbet-app:0da316f` on this PC from checking the plan; it is no longer used and can be removed with `docker image rm ghcr.io/tomyka/sportbet-app:0da316f`.)

---

### Task 1 (backend-dev): One operation recalculates a tournament under a rule set

Architecture candidate 3 of the #9 review (spec 6): given a tournament and a rule set, read what the rule set reads, call `recalculateTournament` once, save under the rule set's own name. The reader's load and the golden db test stop pairing reads, rules and source by hand.

**Files:**
- Modify: `packages/db/src/recalculation/repository.ts`, `packages/db/src/index.ts`, `tools/migrate/src/load.ts`
- Test: `packages/db/test/golden.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/db/test/golden.test.ts`, add `loadInputsUnderRuleSet`, `recalculateUnderRuleSet` and `type PointsSource` to the import from `'../src'` (keep its other names), then replace the whole test that saves `sportbet` and `ruled` rows by hand (A4; at `68c6346` it starts `  it('golden (db): a recalculation saved under its rule set reads back as the same rows', async () => {` and ends at its `  });`) with:

```ts
  it('golden (db): loadInputsUnderRuleSet reads what each rule set reads', async () => {
    const sportbet = unwrap(
      await loadInputsUnderRuleSet(db, GOLDEN_EL, sportbetRules),
    );
    expect(sportbet.odds).toEqual(goldenOdds(GOLDEN_POINTS.game_odds, IDS));
    expect(sportbet.survival.from).toBe('stored-rows');
    const ruled = unwrap(
      await loadInputsUnderRuleSet(db, GOLDEN_EL, ruledRules),
    );
    expect(ruled.odds).toBe('from-votes');
    expect(ruled.survival.from).toBe('picks');
  });

  it('golden (db): recalculateUnderRuleSet saves each rule set under its own name, and leaves production alone', async () => {
    expect(
      await recalculateUnderRuleSet(db, GOLDEN_EL, sportbetRules),
    ).toBeNull();
    expect(await recalculateUnderRuleSet(db, GOLDEN_EL, ruledRules)).toBeNull();
    const points = async (source: PointsSource) =>
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, source), IDS);
    expect(await points('sportbet')).toEqual(GOLDEN_POINTS);
    expect(await points('ruled')).toEqual(GOLDEN_POINTS_RULED);
    expect(await points('production')).toEqual(GOLDEN_POINTS);
    // Each sportbet survival row rewrites the production row of its id.
    const sportbet = await loadTournamentPoints(db, GOLDEN_EL, 'sportbet');
    expect(sportbet.survival.map((row) => row.storedId).toSorted()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('golden (db): recalculating twice under one rule set leaves the same rows', async () => {
    await recalculateUnderRuleSet(db, GOLDEN_EL, sportbetRules);
    const once = await loadTournamentPoints(db, GOLDEN_EL, 'sportbet');
    await recalculateUnderRuleSet(db, GOLDEN_EL, sportbetRules);
    expect(await loadTournamentPoints(db, GOLDEN_EL, 'sportbet')).toEqual(once);
  });
```

If an import the replaced test alone used (such as `saveTournamentPoints`, `AS_STORED` or `recalculate`) is now unused, remove it: lint names it in Step 5.

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/golden.test.ts 2>&1 | grep -E "×|is not a function|Test Files|Tests "
```

Expected: the three new tests fail with `TypeError: ... is not a function` (`loadInputsUnderRuleSet`, `recalculateUnderRuleSet`); every other golden test passes; `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the operation**

In `packages/db/src/recalculation/repository.ts`, add `recalculateTournament` and `type RecalculationRefusal` to the import from `'@sportbet/domain'`, and `inputReadsOf` too if the file does not import it yet (A1: it comes from the domain now); make sure `type RuleSet` is imported from there; and import `saveTournamentPoints` beside `loadGameOdds`:

```ts
import { loadGameOdds, saveTournamentPoints } from '../points/repository';
```

Then append to the file:

```ts
/** Why recalculateUnderRuleSet saved nothing: the inputs', or the recalculation's. */
export type RuleSetRecalculationRefusal =
  TournamentInputsRefusal | RecalculationRefusal;

/**
 * One tournament's inputs as `rules` reads them (inputReadsOf): the stored
 * odds and survival rows it reads are production's, as sportbet's full
 * recalculation reads them. The parity checker's rulings runs read these
 * and recalculate in memory, saving nothing.
 */
export function loadInputsUnderRuleSet(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Result<TournamentInputs, TournamentInputsRefusal>> {
  return loadTournamentInputs(
    db,
    tournament,
    inputReadsOf(rules),
    'production',
  );
}

/**
 * Recalculates one tournament under `rules` and saves the result: its
 * inputs as the rule set reads them, recalculateTournament once, and every
 * row saved under the rule set's own name as its points_source - so the
 * source is named by the caller, through the rule set it passes, never
 * defaulted, and no rule set writes the production rows. Null once saved;
 * else the refusal, and nothing is saved.
 */
export async function recalculateUnderRuleSet(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<RuleSetRecalculationRefusal | null> {
  const inputs = await loadInputsUnderRuleSet(db, tournament, rules);
  const result = inputs.ok
    ? recalculateTournament(inputs.value, rules)
    : inputs;
  if (!result.ok) return result.refusal;
  await saveTournamentPoints(db, tournament, rules.name, result.value);
  return null;
}
```

In `packages/db/src/index.ts`, in the export from `'./recalculation/repository'`, add `loadInputsUnderRuleSet`, `recalculateUnderRuleSet` and `type RuleSetRecalculationRefusal` beside `loadTournamentInputs`.

- [ ] **Step 4: Run them to see them pass**

```bash
pnpm --filter @sportbet/db exec vitest run test/golden.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, and `Tests` two more than at the gate (three added, one replaced).

- [ ] **Step 5: The reader recalculates through it**

In `tools/migrate/src/load.ts`, replace:

```ts
/** One recalculation the reader ran: refused, or saved under its rule set. */
export interface Recalculation {
  readonly tournament: number;
  readonly rules: RuleSet['name'];
  /** The inputs' refusal, or the recalculation's. */
  readonly refusal: TournamentInputsRefusal | RecalculationRefusal | null;
}
```

with:

```ts
/** One recalculation the reader ran: refused, or saved under its rule set. */
export interface Recalculation {
  readonly tournament: number;
  readonly rules: RuleSet['name'];
  /** The inputs' refusal, or the recalculation's. */
  readonly refusal: RuleSetRecalculationRefusal | null;
}
```

and replace the whole of `recalculateLoaded` - from its doc comment, whose first line is ` * recalculateTournament over each loaded tournament under both rule sets,`, to its closing `}` - with:

```ts
/**
 * Each loaded tournament recalculated under both rule sets, each saved
 * under its own name (recalculateUnderRuleSet). A refusal is reported, not
 * thrown.
 */
export async function recalculateLoaded(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<Recalculation[]> {
  const done: Recalculation[] = [];
  for (const tournament of tournaments) {
    for (const rules of RULE_SETS) {
      done.push({
        tournament: tournament.id,
        rules: rules.name,
        refusal: await recalculateUnderRuleSet(db, tournament, rules),
      });
    }
  }
  return done;
}
```

Import `recalculateUnderRuleSet` and `type RuleSetRecalculationRefusal` from `'@sportbet/db'`, and remove the imports the file no longer uses (at the gate: `loadTournamentInputs`, `type TournamentInputsRefusal`, `inputReadsOf`, `recalculateTournament`, `type RecalculationRefusal`, and `saveTournamentPoints` if `loadMapped` no longer calls it). Then:

```bash
pnpm format && pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm --filter @sportbet/migrate exec vitest run test/load.test.ts 2>&1 | grep -E "×|Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint silent and `4` packages typechecked; `load.test.ts` passes with its gate count, unchanged; the db suite passes, two tests more than at the gate.

- [ ] **Step 6: Commit (lead)**

```bash
git add packages/db/src/recalculation/repository.ts packages/db/src/index.ts packages/db/test/golden.test.ts tools/migrate/src/load.ts
git commit -m "$(cat <<'EOF'
feat(db): one operation recalculates a tournament under a rule set (#11)

recalculateUnderRuleSet reads what the rule set reads, calls
recalculateTournament once and saves under the rule set's name, so the
points_source is named through the rule set the caller passes. The
reader's load and the golden db test use it; loadInputsUnderRuleSet is
its read half, for in-memory runs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 (backend-dev): The map says which leagues each tournament has, and which points rows cannot be compared

**Files:**
- Modify: `tools/migrate/src/map.ts`
- Test: `tools/migrate/test/map.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tools/migrate/test/map.test.ts` (it uses the file's own `map`, `changed`, `euroleague` and `withSecondTournament`, and the fixture's `IDS` and `syntheticDump`, all imported or defined there at `68c6346`):

```ts
describe('map: what the parity checker needs', () => {
  it("map: each tournament's leagues with their loaded members, for sportbet's rankings", () => {
    expect(euroleague(map()).leagues).toEqual([
      { id: 2, members: ['1', '2', '3', '4'] },
    ]);
  });

  it("map: a row refused while its game and player loaded is a key parity cannot compare; an orphan's is none", () => {
    // dan's generated '2' (prediction 14) is refused; sportbet scores it.
    expect(euroleague(map()).refusedPoints).toEqual({
      matches: [{ player: '4', game: IDS.game(1) }],
      standings: [],
      survival: [],
      odds: [],
    });
  });

  it('map: a game whose odds rows differ is a game parity cannot compare', () => {
    const differing = map(
      changed('game_odds', (rows) => [
        ...rows,
        {
          id: 12,
          game_id: IDS.game(2),
          home_odds: '1.00',
          draw_odds: '1.00',
          away_odds: '1.00',
        },
      ]),
    );
    expect(euroleague(differing).refusedPoints.odds).toEqual([IDS.game(2)]);
  });

  it('map: a refused standings points row is a key parity cannot compare', () => {
    const mapped = map(
      changed('point_standings', (rows) =>
        rows.map((row) =>
          row['id'] === 2
            ? { ...row, group_position_points: '380.00001' }
            : row,
        ),
      ),
    );
    expect(euroleague(mapped).refusedPoints.standings).toEqual([
      { player: '1', team: '5' },
    ]);
  });

  it("map: a refused survival row is a key parity cannot compare, by sportbet's id", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      point_survivals: [
        ...dump.point_survivals,
        {
          id: 50,
          user_id: IDS.player('ada'),
          event_id: IDS.event(1),
          team_id: 30,
          survival_points: 10,
        },
      ],
    });
    expect(euroleague(mapped).refusedPoints.survival).toEqual([50]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run test/map.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: the five new tests fail (`expected undefined to deeply equal ...`: no `leagues`, no `refusedPoints`); every other map test passes; `Test Files  1 failed (1)`.

- [ ] **Step 3: Map them**

In `tools/migrate/src/map.ts`, add `  type GameId,` before `  type GameOdds,` and `  type TeamId,` before `  type TeamOutcome,` in the import from `'@sportbet/domain'`.

Replace:

```ts
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
}
```

with:

```ts
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
  /** The tournament's leagues, each with its loaded members (parity rankings). */
  readonly leagues: readonly League[];
  /** The points rows the parity checker cannot compare. */
  readonly refusedPoints: RefusedPoints;
}

/** A league of a tournament and its members, as `league_members` holds them. */
export interface League {
  readonly id: number;
  readonly members: readonly PlayerId[];
}

/**
 * The keys of a tournament's points rows the parity checker cannot compare,
 * as the class `refused`: a row whose game, team, round and player loaded
 * but which did not load itself - a points row the map refused, or a
 * prediction or standings row it refused, which the new code never scores
 * and sportbet does - and each game whose odds rows it refused, which the
 * new code scores at CO-5's 1.0 and sportbet at one of those rows. Keys
 * hold a player's id; the report only counts them.
 */
export interface RefusedPoints {
  readonly matches: readonly {
    readonly player: PlayerId;
    readonly game: GameId;
  }[];
  readonly standings: readonly {
    readonly player: PlayerId;
    readonly team: TeamId;
  }[];
  /** sportbet's `point_survivals` ids. */
  readonly survival: readonly number[];
  readonly odds: readonly GameId[];
}
```

Replace `  const members = new PerTournament<number>();` with:

```ts
  const members = new PerTournament<number>();
  const leagueMembers = new Map<number, PlayerId[]>();
```

Replace `    members.add(tournament, row.user_id);` with:

```ts
    members.add(tournament, row.user_id);
    leagueMembers.set(row.league_id, [
      ...(leagueMembers.get(row.league_id) ?? []),
      playerOf(row.user_id),
    ]);
```

Replace `  // Each loaded tournament: its players are its leagues' members and` with:

```ts
  // The keys of tournament `id` the parity checker cannot compare
  // (RefusedPoints): a row whose parents loaded, not loaded itself.
  const refusedPointsOf = (id: number): RefusedPoints => {
    const matchOf = (row: { user_id: number; game_id: number }) => {
      const game = games.get(row.game_id);
      return game?.tournament === id && users.has(row.user_id)
        ? { player: playerOf(row.user_id), game: game.game.id }
        : null;
    };
    const standingOf = (row: { user_id: number; team_id: number }) => {
      const team = teams.get(row.team_id);
      return team?.tournament === id && users.has(row.user_id)
        ? { player: playerOf(row.user_id), team: team.row.id }
        : null;
    };
    const matchKey = (key: { player: PlayerId; game: GameId }) =>
      `${key.player}/${String(key.game)}`;
    const standingKey = (key: { player: PlayerId; team: TeamId }) =>
      `${key.player}/${key.team}`;
    return {
      matches: [
        ...unloaded(
          rows.prediction_results.map(matchOf),
          predictions.of(id).map(({ prediction }) => prediction),
          matchKey,
        ),
        ...unloaded(
          rows.point_results.map(matchOf),
          matchPoints.of(id).map(({ row }) => row),
          matchKey,
        ),
      ],
      standings: [
        ...unloaded(
          rows.prediction_standings.map(standingOf),
          standingsRows.of(id).map(({ user, pick }) => ({
            player: playerOf(user),
            team: pick.team,
          })),
          standingKey,
        ),
        ...unloaded(
          rows.point_standings.map(standingOf),
          standingsPoints.of(id).map(({ row }) => row),
          standingKey,
        ),
      ],
      survival: unloaded(
        rows.point_survivals.map((row) =>
          rounds.get(row.event_id)?.tournament === id &&
          teams.has(row.team_id) &&
          users.has(row.user_id)
            ? row.id
            : null,
        ),
        survivalPoints.of(id).flatMap(({ row }) => row.storedId ?? []),
        String,
      ),
      odds: unloaded(
        rows.game_odds.map((row) => {
          const game = games.get(row.game_id);
          return game?.tournament === id ? game.game.id : null;
        }),
        odds.of(id).map(({ game }) => game),
        String,
      ),
    };
  };

  // Each loaded tournament: its players are its leagues' members and
```

Replace the end of the `production:` block in `mapped.push`:

```ts
        survival: survivalPoints.of(id).map(({ row }) => row),
      },
```

with:

```ts
        survival: survivalPoints.of(id).map(({ row }) => row),
      },
      leagues: [...leagueTournament]
        .filter(([, of]) => of === id)
        .map(([league]) => ({
          id: league,
          members: leagueMembers.get(league) ?? [],
        })),
      refusedPoints: refusedPointsOf(id),
```

Append to the file:

```ts

/**
 * The keys in `found` (null: a row whose parents did not load) that no
 * loaded row has, each once, in the order found.
 */
function unloaded<K>(
  found: readonly (K | null)[],
  loaded: readonly K[],
  keyOf: (key: K) => string,
): K[] {
  const done = new Set(loaded.map(keyOf));
  const out = new Map<string, K>();
  for (const key of found) {
    if (key !== null && !done.has(keyOf(key))) out.set(keyOf(key), key);
  }
  return [...out.values()];
}
```

- [ ] **Step 4: Run them to see them pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run test/map.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, and `Tests` five more than at the gate.

- [ ] **Step 5: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/map.ts tools/migrate/test/map.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): the map names each tournament's leagues and the rows parity cannot compare (#11)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: lint and typecheck silent.

---

### Task 3 (backend-dev): The classification

Spec 1: every row key of the four tables gets one class, from the three sides, compared exactly. Pure: the tests plant one difference per class and per edge case of inventory section 6 that can differ in a Euroleague tournament (knockout, negative difference points, missing odds row at 1.0, contrarian odds, generated rows, the serija, standings null against 0, survival totals and resets, multi-tournament players, precision).

**Files:**
- Create: `tools/migrate/src/parity/compare.ts`
- Test: `tools/migrate/src/parity/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/migrate/src/parity/compare.test.ts`:

```ts
import {
  CrowdOdds,
  MatchPrediction,
  Odds,
  Points,
  recalculateTournament,
  sportbetRules,
  StandingsOdds,
  StandingsPoints,
  type PointsRows,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type TournamentInputs,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { RefusedPoints } from '../map';
import {
  compareTournament,
  type ParitySides,
  type ParityTable,
  type TableParity,
} from './compare';

type Name = (typeof GOLDEN.players)[number];
type TeamName = (typeof GOLDEN.teams)[number];

/** The golden inputs as the reader loads them: stored odds and survival rows. */
const STORED = {
  game_odds: GOLDEN_POINTS.game_odds,
  point_survivals: GOLDEN_POINTS.point_survivals,
};

const rowsOf = (inputs: TournamentInputs): PointsRows => {
  const { odds, matches, standings, survival } = unwrap(
    recalculateTournament(inputs, sportbetRules),
  );
  return { odds, matches, standings, survival };
};

/** golden-points.json's 25 entries, as all three sides hold them. */
const GOLDEN_ROWS = rowsOf(goldenInputs(STORED));

const NONE: RefusedPoints = {
  matches: [],
  standings: [],
  survival: [],
  odds: [],
};

const sides = (over: Partial<ParitySides> = {}): ParitySides => ({
  production: GOLDEN_ROWS,
  oldApp: GOLDEN_ROWS,
  newCode: GOLDEN_ROWS,
  refused: NONE,
  scored: new Set([gameNo(1), gameNo(2), gameNo(3)]),
  ...over,
});

const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
const who = (name: Name) => NAME_IDS.player(name);

/** `rows` with one match row changed. */
function withMatch(
  rows: PointsRows,
  name: Name,
  game: 1 | 2 | 3,
  change: (row: StoredMatchRow) => StoredMatchRow,
): PointsRows {
  return {
    ...rows,
    matches: rows.matches.map((row) =>
      row.player === who(name) && row.game === gameNo(game) ? change(row) : row,
    ),
  };
}

/** `rows` with one standings row changed. */
function withStandings(
  rows: PointsRows,
  name: Name,
  team: TeamName,
  change: (row: StandingsRow) => StandingsRow,
): PointsRows {
  return {
    ...rows,
    standings: rows.standings.map((row) =>
      row.player === who(name) && row.team === NAME_IDS.team(team)
        ? change(row)
        : row,
    ),
  };
}

/** `rows` with one survival row changed. */
function withSurvival(
  rows: PointsRows,
  name: Name,
  round: 1 | 2,
  change: (row: SurvivalPoints) => SurvivalPoints,
): PointsRows {
  return {
    ...rows,
    survival: rows.survival.map((row) =>
      row.player === who(name) && row.round === round ? change(row) : row,
    ),
  };
}

const tableOf = (result: readonly TableParity[], table: ParityTable) => {
  const found = result.find((each) => each.table === table);
  if (found === undefined) throw new Error(`no ${table}`);
  return found;
};

const counts = (result: readonly TableParity[]) =>
  Object.fromEntries(result.map(({ table, counts: c }) => [table, c]));

const only = (result: readonly TableParity[], table: ParityTable) => {
  const [row, ...rest] = tableOf(result, table).rows;
  expect(rest).toEqual([]);
  return row;
};

describe('compareTournament', () => {
  it('classes every row match when the three sides agree', () => {
    expect(counts(compareTournament(sides()))).toEqual({
      point_results: { match: 9, stale: 0, 'new-code-wrong': 0, refused: 0 },
      point_standings: { match: 8, stale: 0, 'new-code-wrong': 0, refused: 0 },
      point_survivals: { match: 5, stale: 0, 'new-code-wrong': 0, refused: 0 },
      game_odds: { match: 3, stale: 0, 'new-code-wrong': 0, refused: 0 },
    });
  });

  it('classes a row stale when only production differs, one hundredth apart', () => {
    const production = withMatch(GOLDEN_ROWS, 'ada', 1, (row) => ({
      ...row,
      points: { ...row.points, full: hundredths(12_549) },
    }));
    const result = compareTournament(sides({ production }));
    expect(tableOf(result, 'point_results').counts).toEqual({
      match: 8,
      stale: 1,
      'new-code-wrong': 0,
      refused: 0,
    });
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('ada'), game: gameNo(1) },
      class: 'stale',
      differences: [
        {
          column: 'full_points',
          production: '125.49',
          oldApp: '125.50',
          newCode: '125.50',
        },
      ],
    });
  });

  it('classes a row new-code-wrong when the old app differs, whatever production says', () => {
    const planted = withMatch(GOLDEN_ROWS, 'ben', 2, (row) => ({
      ...row,
      points: { ...row.points, winner: hundredths(7_951) },
    }));
    const result = compareTournament(
      sides({ production: planted, oldApp: planted }),
    );
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('ben'), game: gameNo(2) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'winner_points',
          production: '79.51',
          oldApp: '79.51',
          newCode: '79.50',
        },
      ],
    });
  });

  it('classes a row only the old app has as new-code-wrong: a missing row differs', () => {
    const ada = GOLDEN_ROWS.matches.find(
      (row) => row.player === who('ada') && row.game === gameNo(1),
    );
    if (ada === undefined) throw new Error('no ada / 1');
    const oldApp = {
      ...GOLDEN_ROWS,
      matches: [...GOLDEN_ROWS.matches, { ...ada, player: who('dan') }],
    };
    const result = compareTournament(sides({ oldApp }));
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('dan'), game: gameNo(1) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'row',
          production: 'no row',
          oldApp: 'present',
          newCode: 'no row',
        },
      ],
    });
  });

  it('classes a row the reader refused, or whose prediction it refused, refused, whatever the sides say', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'cai', 1, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    const result = compareTournament(
      sides({
        oldApp,
        refused: {
          ...NONE,
          matches: [{ player: who('cai'), game: gameNo(1) }],
        },
      }),
    );
    expect(tableOf(result, 'point_results').counts).toEqual({
      match: 8,
      stale: 0,
      'new-code-wrong': 0,
      refused: 1,
    });
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('cai'), game: gameNo(1) },
      class: 'refused',
      differences: [],
    });
  });

  it("classes every match row of a game whose odds were refused refused: the new code scores it at CO-5's 1.0", () => {
    const result = compareTournament(
      sides({ refused: { ...NONE, odds: [gameNo(2)] } }),
    );
    expect(counts(result)).toMatchObject({
      point_results: { match: 6, stale: 0, 'new-code-wrong': 0, refused: 3 },
      game_odds: { match: 2, stale: 0, 'new-code-wrong': 0, refused: 1 },
    });
  });

  it("compares no odds of a game without a result: sportbet's blank row is its own", () => {
    const [first] = GOLDEN_ROWS.odds;
    if (first === undefined) throw new Error('no odds');
    const blank = { game: gameNo(4), odds: first.odds };
    const production = { ...GOLDEN_ROWS, odds: [...GOLDEN_ROWS.odds, blank] };
    const result = compareTournament(sides({ production, oldApp: production }));
    expect(tableOf(result, 'game_odds').counts).toEqual({
      match: 3,
      stale: 0,
      'new-code-wrong': 0,
      refused: 0,
    });
  });
});

describe('compareTournament, on the edge cases of inventory section 6', () => {
  it('a Euroleague knockout game scores like a group game (2): a winner bonus the old app withholds is found', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'ada', 3, (row) => ({
      ...row,
      points: { ...row.points, winner: Points.ZERO },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      class: 'new-code-wrong',
      differences: [
        {
          column: 'winner_points',
          production: '79.50',
          oldApp: '0.00',
          newCode: '79.50',
        },
      ],
    });
  });

  it('negative difference points (3): -45.00 and -44.99 differ', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'ada', 2, (row) => ({
      ...row,
      points: { ...row.points, margin: hundredths(-4_499) },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      differences: [
        {
          column: 'difference_points',
          production: '-45.00',
          oldApp: '-44.99',
          newCode: '-45.00',
        },
      ],
    });
  });

  it('a missing odds row scores at 1.0 (5): where the old app had a row, every column the 1.0 changes is found', () => {
    const newCode = rowsOf(
      goldenInputs({
        ...STORED,
        game_odds: Object.fromEntries(
          Object.entries(STORED.game_odds).filter(([key]) => key !== 'EL h2'),
        ),
      }),
    );
    const result = compareTournament(sides({ newCode }));
    expect(counts(result)).toMatchObject({
      point_results: { match: 6, 'new-code-wrong': 3 },
      game_odds: { match: 2, 'new-code-wrong': 1 },
    });
    expect(
      tableOf(result, 'point_results').rows.map(({ subject, differences }) => [
        subject,
        differences,
      ]),
    ).toEqual([
      [
        { table: 'point_results', player: who('ada'), game: gameNo(2) },
        [
          {
            column: 'odds',
            production: '1.59',
            oldApp: '1.59',
            newCode: '1.00',
          },
        ],
      ],
      [
        { table: 'point_results', player: who('ben'), game: gameNo(2) },
        [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '100.00',
          },
          {
            column: 'odds',
            production: '0.59',
            oldApp: '0.59',
            newCode: '1.00',
          },
          {
            column: 'full_points',
            production: '114.50',
            oldApp: '114.50',
            newCode: '135.00',
          },
        ],
      ],
      [
        { table: 'point_results', player: who('cai'), game: gameNo(2) },
        [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '100.00',
          },
          {
            column: 'odds',
            production: '0.59',
            oldApp: '0.59',
            newCode: '1.00',
          },
          {
            column: 'full_points',
            production: '119.50',
            oldApp: '119.50',
            newCode: '140.00',
          },
        ],
      ],
    ]);
  });

  it('contrarian odds (5): the draw nobody picked, 2.59, and 2.58 differ', () => {
    const [first, ...rest] = GOLDEN_ROWS.odds;
    if (first === undefined) throw new Error('no odds');
    const draw = unwrap(Odds.ofHundredths(258));
    const oldApp: PointsRows = {
      ...GOLDEN_ROWS,
      odds: [
        {
          game: first.game,
          odds: CrowdOdds.stored(first.odds.home, first.odds.away, draw),
        },
        ...rest,
      ],
    };
    expect(
      only(compareTournament(sides({ oldApp })), 'game_odds'),
    ).toMatchObject({
      subject: { table: 'game_odds', game: gameNo(1) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'draw_odds',
          production: '2.59',
          oldApp: '2.58',
          newCode: '2.59',
        },
      ],
    });
  });

  it('a generated row (6) is compared like any other: odds 0, no serija', () => {
    const inputs = goldenInputs(STORED);
    const withFillIn: TournamentInputs = {
      ...inputs,
      predictions: [
        ...inputs.predictions,
        unwrap(
          MatchPrediction.stored({
            player: who('dan'),
            game: gameNo(1),
            home: 81,
            away: 80,
            origin: 'fill-in',
            filledInAt: null,
          }),
        ),
      ],
    };
    const newCode = rowsOf(withFillIn);
    const dan = newCode.matches.find((row) => row.player === who('dan'));
    expect([dan?.points.odds.toString(), dan?.serija.toString()]).toEqual([
      '0.00',
      '0.00',
    ]);
    const oldApp = withMatch(newCode, 'dan', 1, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    const result = compareTournament(
      sides({ production: newCode, oldApp, newCode }),
    );
    expect(only(result, 'point_results')).toMatchObject({
      subject: { player: who('dan'), game: gameNo(1) },
      differences: [
        {
          column: 'streak_bonus',
          production: '0.00',
          oldApp: '10.00',
          newCode: '0.00',
        },
      ],
    });
  });

  it('the serija (8): a bonus walked in id order instead of tip-off order is found', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'cai', 3, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      differences: [
        {
          column: 'streak_bonus',
          production: '20.00',
          oldApp: '10.00',
          newCode: '20.00',
        },
      ],
    });
  });

  it('standings (9): null and 0 differ', () => {
    const oldApp = withStandings(GOLDEN_ROWS, 'ada', 'REA', (row) => ({
      ...row,
      playOffs: { ...row.playOffs, odds: StandingsOdds.ZERO },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_standings'),
    ).toMatchObject({
      subject: {
        table: 'point_standings',
        player: who('ada'),
        team: NAME_IDS.team('REA'),
      },
      differences: [
        {
          column: 'quarterfinal_odds',
          production: 'null',
          oldApp: '0.0000',
          newCode: 'null',
        },
      ],
    });
  });

  it('standings (12): compared to four places, 380.0000 and 380.0001 differ', () => {
    const oldApp = withStandings(GOLDEN_ROWS, 'ada', 'ZAL', (row) => ({
      ...row,
      place: {
        ...row.place,
        points: unwrap(StandingsPoints.ofTenThousandths(3_800_001)),
      },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_standings'),
    ).toMatchObject({
      differences: [
        {
          column: 'group_position_points',
          production: '380.0000',
          oldApp: '380.0001',
          newCode: '380.0000',
        },
      ],
    });
  });

  it('survival (10): a running total the old app resets is found, by the stored row', () => {
    const oldApp = withSurvival(GOLDEN_ROWS, 'ada', 2, (row) => ({
      ...row,
      points: Points.ZERO,
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_survivals'),
    ).toMatchObject({
      subject: {
        table: 'point_survivals',
        player: who('ada'),
        round: 2,
        storedId: 2,
      },
      differences: [
        {
          column: 'survival_points',
          production: '22.00',
          oldApp: '0.00',
          newCode: '22.00',
        },
      ],
    });
  });

  it('multi-tournament players (11): a row the new code files under another tournament is missing here', () => {
    const newCode = {
      ...GOLDEN_ROWS,
      matches: GOLDEN_ROWS.matches.filter(
        (row) => !(row.player === who('ada') && row.game === gameNo(3)),
      ),
    };
    expect(
      only(compareTournament(sides({ newCode })), 'point_results'),
    ).toMatchObject({
      subject: { player: who('ada'), game: gameNo(3) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'row',
          production: 'present',
          oldApp: 'present',
          newCode: 'no row',
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/compare.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `FAIL  src/parity/compare.test.ts` with `Error: Cannot find module './compare' imported from .../tools/migrate/src/parity/compare.test.ts`, and `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the classification**

Create `tools/migrate/src/parity/compare.ts`:

```ts
import type {
  GameId,
  PlayerId,
  PointsRows,
  RoundNumber,
  StandingsLine,
  SurvivalPoints,
  TeamId,
} from '@sportbet/domain';
import type { RefusedPoints } from '../map';

/** The tables the checker compares; `game_odds` last, as it explains the others. */
export const PARITY_TABLES = [
  'point_results',
  'point_standings',
  'point_survivals',
  'game_odds',
] as const;
export type ParityTable = (typeof PARITY_TABLES)[number];

/** Spec 1: the class each row key gets. */
export const PARITY_CLASSES = [
  'match',
  'stale',
  'new-code-wrong',
  'refused',
] as const;
export type ParityClass = (typeof PARITY_CLASSES)[number];

/** What a row is about, so the report can name it. */
export type RowSubject =
  | {
      readonly table: 'point_results';
      readonly player: PlayerId;
      readonly game: GameId;
    }
  | {
      readonly table: 'point_standings';
      readonly player: PlayerId;
      readonly team: TeamId;
    }
  | {
      readonly table: 'point_survivals';
      readonly player: PlayerId;
      readonly round: RoundNumber;
      /**
       * sportbet's `point_survivals.id` (two rows may share a player and a
       * round); null for a row folded from the picks (rulings.ts).
       */
      readonly storedId: number | null;
    }
  | { readonly table: 'game_odds'; readonly game: GameId };

/**
 * One column that differs, with its value on each side: the exact decimal
 * text sportbet stores (two places for points and odds, four for
 * standings), `null`, or - for the column `row` - `present` or `no row`.
 */
export interface ColumnDifference {
  readonly column: string;
  readonly production: string;
  readonly oldApp: string;
  readonly newCode: string;
}

export interface ClassifiedRow {
  readonly subject: RowSubject;
  readonly class: ParityClass;
  /**
   * `new-code-wrong`: the columns where the new code and the old app
   * differ; `stale`: where the new code and production differ; else none.
   */
  readonly differences: readonly ColumnDifference[];
}

export interface TableParity {
  readonly table: ParityTable;
  readonly counts: Readonly<Record<ParityClass, number>>;
  /** Every row that is not a `match`, in key order. */
  readonly rows: readonly ClassifiedRow[];
}

/** One tournament's three sets of rows, and what the reader refused. */
export interface ParitySides {
  /** Oracle (a): production's rows as dumped. */
  readonly production: PointsRows;
  /** Oracle (b): the same copy after sportbet's own full recalculation. */
  readonly oldApp: PointsRows;
  /** The new code under sportbetRules, as the reader stored it. */
  readonly newCode: PointsRows;
  /** The rows the reader could not compare, from both oracles' maps. */
  readonly refused: RefusedPoints;
  /**
   * The tournament's games with a result: only their odds are compared, as
   * sportbet inserts a blank odds row with every game and only a scored
   * game is scored (CO-7).
   */
  readonly scored: ReadonlySet<GameId>;
}

/** One row of one side: what it is about, and each column's exact text. */
export interface KeyedRow {
  readonly subject: RowSubject;
  readonly cells: Readonly<Record<string, string>>;
}

/** How a side's survival rows are keyed. */
export type SurvivalKey = (row: SurvivalPoints) => string;

/**
 * By the stored row each rewrites (sportbet's id): every row refolded
 * under sportbetRules has one, and sportbet's refold updates rows in place.
 */
const byStoredRow: SurvivalKey = (row) => {
  if (row.storedId === null) {
    throw new Error('compare: a survival row rewrites no stored row');
  }
  return String(row.storedId);
};

const line = (name: string, value: StandingsLine) => ({
  [`${name}_points`]: value.points?.toString() ?? 'null',
  [`${name}_odds`]: value.odds?.toString() ?? 'null',
});

/**
 * One table of one side, by key, each row as its columns' exact text: the
 * odds of `scored` games only, survival rows keyed by `survivalKey`.
 */
export function keyedRows(
  rows: PointsRows,
  table: ParityTable,
  scored: ReadonlySet<GameId>,
  survivalKey: SurvivalKey = byStoredRow,
): ReadonlyMap<string, KeyedRow> {
  const out = new Map<string, KeyedRow>();
  const put = (key: string, entry: KeyedRow) => {
    if (out.has(key)) {
      // Every side comes through the map, which refuses a duplicate key.
      throw new Error(`compare: ${table} ${key} twice on one side`);
    }
    out.set(key, entry);
  };
  switch (table) {
    case 'point_results':
      for (const { player, game, points, serija } of rows.matches) {
        put(`${player}/${String(game)}`, {
          subject: { table, player, game },
          cells: {
            winner_points: points.winner.toString(),
            difference_points: points.margin.toString(),
            bingo_points: points.bingo.toString(),
            odds: points.odds.toString(),
            odds_points: points.oddsPoints.toString(),
            full_points: points.full.toString(),
            streak_bonus: serija.toString(),
          },
        });
      }
      break;
    case 'point_standings':
      for (const row of rows.standings) {
        put(`${row.player}/${row.team}`, {
          subject: { table, player: row.player, team: row.team },
          cells: {
            ...line('group_position', row.place),
            ...line('quarterfinal', row.playOffs),
            ...line('semifinal', row.finalFour),
            ...line('final', row.final),
          },
        });
      }
      break;
    case 'point_survivals':
      for (const row of rows.survival) {
        put(survivalKey(row), {
          subject: {
            table,
            player: row.player,
            round: row.round,
            storedId: row.storedId,
          },
          cells: {
            survival_points: row.points?.toString() ?? 'null',
            team_id: row.team,
          },
        });
      }
      break;
    case 'game_odds':
      for (const { game, odds } of rows.odds) {
        if (!scored.has(game)) continue;
        put(String(game), {
          subject: { table, game },
          cells: {
            home_odds: odds.home.toString(),
            away_odds: odds.away.toString(),
            draw_odds: odds.draw.toString(),
          },
        });
      }
      break;
  }
  return out;
}

/** The columns where two sides' rows differ: `row` when only one has it. */
export function differing(
  a: KeyedRow | undefined,
  b: KeyedRow | undefined,
): string[] {
  if (a === undefined && b === undefined) return [];
  if (a === undefined || b === undefined) return ['row'];
  return Object.keys(a.cells).filter(
    (column) => a.cells[column] !== b.cells[column],
  );
}

/** The keys of `table` the reader refused, or whose inputs it refused. */
function refusedKeys(
  refused: RefusedPoints,
  table: ParityTable,
): ReadonlySet<string> {
  switch (table) {
    case 'point_results':
      return new Set(
        refused.matches.map(({ player, game }) => `${player}/${String(game)}`),
      );
    case 'point_standings':
      return new Set(
        refused.standings.map(({ player, team }) => `${player}/${team}`),
      );
    case 'point_survivals':
      return new Set(refused.survival.map(String));
    case 'game_odds':
      return new Set(refused.odds.map(String));
  }
}

const valueOf = (side: KeyedRow | undefined, column: string): string => {
  if (column === 'row') return side === undefined ? 'no row' : 'present';
  return side?.cells[column] ?? 'no row';
};

function compareTable(sides: ParitySides, table: ParityTable): TableParity {
  const production = keyedRows(sides.production, table, sides.scored);
  const oldApp = keyedRows(sides.oldApp, table, sides.scored);
  const newCode = keyedRows(sides.newCode, table, sides.scored);
  const refused = refusedKeys(sides.refused, table);
  // A game whose odds were refused is scored at CO-5's 1.0 by the new code
  // and at one of its rows by sportbet: none of its match rows compares.
  const oddsRefused = new Set(sides.refused.odds);
  const counts: Record<ParityClass, number> = {
    match: 0,
    stale: 0,
    'new-code-wrong': 0,
    refused: 0,
  };
  const rows: ClassifiedRow[] = [];
  const keys = [
    ...new Set([...production.keys(), ...oldApp.keys(), ...newCode.keys()]),
  ].sort();
  for (const key of keys) {
    const a = production.get(key);
    const b = oldApp.get(key);
    const n = newCode.get(key);
    const subject = (n ?? b ?? a)?.subject;
    if (subject === undefined) throw new Error('compare: a key with no row');
    const isRefused =
      refused.has(key) ||
      (subject.table === 'point_results' && oddsRefused.has(subject.game));
    const againstOldApp = differing(n, b);
    const againstProduction = differing(n, a);
    const kind: ParityClass = isRefused
      ? 'refused'
      : againstOldApp.length > 0
        ? 'new-code-wrong'
        : againstProduction.length > 0
          ? 'stale'
          : 'match';
    counts[kind] += 1;
    if (kind === 'match') continue;
    const columns =
      kind === 'new-code-wrong'
        ? againstOldApp
        : kind === 'stale'
          ? againstProduction
          : [];
    rows.push({
      subject,
      class: kind,
      differences: columns.map((column) => ({
        column,
        production: valueOf(a, column),
        oldApp: valueOf(b, column),
        newCode: valueOf(n, column),
      })),
    });
  }
  return { table, counts, rows };
}

/**
 * Spec 1: every row key of one tournament's four points tables, classed
 * against both oracles. Exact: each value is compared as the text sportbet
 * stores (points in hundredths, standings in ten-thousandths, null apart
 * from zero), and a missing or an extra row differs. Pure.
 */
export function compareTournament(sides: ParitySides): readonly TableParity[] {
  return PARITY_TABLES.map((table) => compareTable(sides, table));
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/compare.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, `Tests  17 passed (17)`.

- [ ] **Step 5: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/parity/compare.ts tools/migrate/src/parity/compare.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): classify every points row against both oracles (#11)

match, stale, new-code-wrong or refused, compared exactly: points in
hundredths, standings in ten-thousandths, null apart from zero, a
missing or extra row a difference.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 (backend-dev): The rulings, one field at a time

Spec 3. `RULINGS` classes every `RuleSet` field; the ones `recalculateTournament` reads (directly, or through the crowd odds, the standings scoring or the survival refold: `missingOddsScoreAtOne`, `crowdOddsCountFilledIn`, `survivalScoredFromStoredRows`, `positionsGetCrowdBonus`, `standingsBonusPopulation`, `placesScoredOnlyFromFinalTable`, `unscoredPlaceStoresNull` - found by reading every `rules.` in `packages/domain/src` outside tests) are recalculated in memory, each alone; the others change no stored row.

**Files:**
- Create: `tools/migrate/src/parity/rulings.ts`
- Test: `tools/migrate/src/parity/rulings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/migrate/src/parity/rulings.test.ts`:

```ts
import {
  inputReadsOf,
  ok,
  refuse,
  TeamOutcomes,
  type RuleSet,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN_POINTS,
  goldenInputs,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { RULINGS, rulingsImpact, type InputsUnder } from './rulings';

const SCORED = new Set([gameNo(1), gameNo(2), gameNo(3)]);

/**
 * The golden inputs as the db reads them under `rules` (inputReadsOf):
 * the stored odds and survival rows where the set reads them, else the
 * votes and the picks; the table final, or not, as the reader loads it.
 */
const golden =
  (tableIsFinal: boolean): InputsUnder =>
  (rules: RuleSet) => {
    const reads = inputReadsOf(rules);
    const inputs = goldenInputs({
      ...(reads.odds === 'stored'
        ? { game_odds: GOLDEN_POINTS.game_odds }
        : {}),
      ...(reads.survival === 'stored-rows'
        ? { point_survivals: GOLDEN_POINTS.point_survivals }
        : {}),
    });
    return Promise.resolve(
      ok({
        ...inputs,
        outcomes: unwrap(
          TeamOutcomes.stored(inputs.outcomes.teams, tableIsFinal),
        ),
      }),
    );
  };

const effects = async (tableIsFinal: boolean) => {
  const impact = unwrap(await rulingsImpact(golden(tableIsFinal), SCORED));
  return {
    fields: Object.fromEntries(
      impact.fields.map(({ field, effect }) => [field, effect]),
    ),
    ruled: impact.ruled,
  };
};

const NONE = { kind: 'changes', rows: 0, players: 0, points: 0 };

describe('rulingsImpact', () => {
  it('names every RuleSet field after its catalogue rule and ruling', () => {
    expect(
      Object.values(RULINGS).filter(
        ({ label }) => !/^[A-Z]{2}-\d+[,:]/.test(label),
      ),
    ).toEqual([]);
  });

  it("attributes the golden scenario's ruled differences to ST-4 and ST-5, one field at a time", async () => {
    const { fields, ruled } = await effects(true);
    expect(fields['positionsGetCrowdBonus']).toEqual({
      kind: 'changes',
      rows: 4,
      players: 1,
      points: -7_600_000,
    });
    expect(fields['standingsBonusPopulation']).toEqual({
      kind: 'changes',
      rows: 1,
      players: 1,
      points: 600_000,
    });
    expect(ruled).toEqual({
      kind: 'changes',
      rows: 4,
      players: 1,
      points: -7_000_000,
    });
  });

  it("reproduces #9's unscored places under R-14 alone, on a table not marked final", async () => {
    const { fields, ruled } = await effects(false);
    // ada's four exact places (380 each) and ben's four near ones (180) pay 0.
    expect(fields['placesScoredOnlyFromFinalTable']).toEqual({
      kind: 'changes',
      rows: 8,
      players: 2,
      points: -22_400_000,
    });
    expect(ruled).toEqual({
      kind: 'changes',
      rows: 8,
      players: 2,
      points: -21_800_000,
    });
  });

  it('shows a field whose effect needs another only in the whole: an unscored place stores null only under R-14', async () => {
    const { fields } = await effects(false);
    expect(fields['unscoredPlaceStoresNull']).toEqual(NONE);
  });

  it('reads what each variant reads: odds from the votes and survival from the picks agree with the stored rows here', async () => {
    const { fields } = await effects(true);
    expect([
      fields['missingOddsScoreAtOne'],
      fields['survivalScoredFromStoredRows'],
    ]).toEqual([NONE, NONE]);
  });

  it('lists a field recalculateTournament does not read as changing no stored row', async () => {
    const { fields } = await effects(true);
    expect(fields['movedGameReopens']).toEqual({ kind: 'no-stored-row' });
    expect(
      Object.entries(RULINGS)
        .filter(([, { scoring }]) => scoring)
        .map(([field]) => field),
    ).toEqual([
      'missingOddsScoreAtOne',
      'crowdOddsCountFilledIn',
      'survivalScoredFromStoredRows',
      'positionsGetCrowdBonus',
      'standingsBonusPopulation',
      'placesScoredOnlyFromFinalTable',
      'unscoredPlaceStoresNull',
    ]);
  });

  it('reports a variant whose inputs cannot be read as refused, and the rest as usual', async () => {
    const picksRefused: InputsUnder = (rules) =>
      inputReadsOf(rules).survival === 'picks'
        ? Promise.resolve(refuse('row-of-player-not-in-tournament'))
        : golden(true)(rules);
    const impact = unwrap(await rulingsImpact(picksRefused, SCORED));
    expect(
      impact.fields.find(
        ({ field }) => field === 'survivalScoredFromStoredRows',
      )?.effect,
    ).toEqual({ kind: 'refused', refusal: 'row-of-player-not-in-tournament' });
    expect(impact.ruled).toEqual({
      kind: 'refused',
      refusal: 'row-of-player-not-in-tournament',
    });
  });

  it('is refused when the sportbet inputs cannot be read', async () => {
    expect(
      await rulingsImpact(
        () => Promise.resolve(refuse('row-of-player-not-in-tournament')),
        SCORED,
      ),
    ).toEqual({ ok: false, refusal: 'row-of-player-not-in-tournament' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/rulings.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `Error: Cannot find module './rulings' imported from .../tools/migrate/src/parity/rulings.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the runs**

Create `tools/migrate/src/parity/rulings.ts`:

```ts
import {
  ok,
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type GameId,
  type PlayerId,
  type Result,
  type RuleSet,
  type TournamentInputs,
  type TournamentPoints,
  type TournamentTotal,
} from '@sportbet/domain';
import {
  differing,
  keyedRows,
  PARITY_TABLES,
  type SurvivalKey,
} from './compare';

/** A RuleSet field: one difference between sportbet and the rulings. */
export type RuleField = Exclude<keyof RuleSet, 'name'>;

/**
 * Every RuleSet field, named after its catalogue rule and ruling, and
 * whether recalculateTournament reads it (directly, or through the crowd
 * odds, the standings or the survival refold). A field it does not read
 * governs entry or ranking only and changes no stored row. Typed over
 * every field, so a new one does not compile until it is placed here.
 */
export const RULINGS: Readonly<
  Record<RuleField, { readonly label: string; readonly scoring: boolean }>
> = Object.freeze({
  movedGameReopens: {
    label: 'LR-2, R-13: a moved game reopens only before its tip-off',
    scoring: false,
  },
  currentRound: {
    label: 'LR-3, R-6, R-40: the current round is the soonest next game',
    scoring: false,
  },
  stageRates: {
    label: 'LR-4, R-10: each stage carries its rate',
    scoring: false,
  },
  finishedTournamentsFrozen: {
    label: 'LR-6, R-21, R-22: a finished tournament is frozen',
    scoring: false,
  },
  levelResultAllowed: {
    label: 'MS-10, R-38: no level Euroleague result',
    scoring: false,
  },
  halfTypedPredictionStored: {
    label: 'MS-1, MS-2, R-15: a half-typed prediction is not stored',
    scoring: false,
  },
  missingOddsScoreAtOne: {
    label: 'CO-5, CO-7: odds from the votes, never a missing row at 1.0',
    scoring: true,
  },
  crowdOddsCountFilledIn: {
    label: 'CO-6, R-2, R-9: filled-in predictions are not crowd votes',
    scoring: true,
  },
  fillInsOfMistakenResultRemoved: {
    label: "FI-4, R-5: a mistaken result's fill-ins are removed",
    scoring: false,
  },
  survivalPickLocksAtTipOff: {
    label: "SU-4, R-4: a pick locks at its team's tip-off",
    scoring: false,
  },
  survivalRoundClosesAtFirstTipOff: {
    label: "SU-4, R-41: a round's pick closes at its first tip-off",
    scoring: false,
  },
  survivalTeamOncePerRun: {
    label: 'SU-5, R-11: a team is used once per run',
    scoring: false,
  },
  survivalRegularSeasonOnly: {
    label: 'SU-7, R-10: survival in regular-season rounds only',
    scoring: false,
  },
  survivalScoredFromStoredRows: {
    label: 'SU-10, R-5: survival folded from the pick history',
    scoring: true,
  },
  positionsGetCrowdBonus: {
    label: 'ST-4, R-35: no crowd bonus on a table position',
    scoring: true,
  },
  standingsBonusPopulation: {
    label:
      'ST-5, ST-7, R-3, R-36: the crowd bonus counts every standings player',
    scoring: true,
  },
  placesScoredOnlyFromFinalTable: {
    label: 'ST-8, R-14: places paid only from the final table',
    scoring: true,
  },
  unscoredPlaceStoresNull: {
    label: 'ST-6, ST-8, R-14: an unscored place stores null, not 0',
    scoring: true,
  },
  everyPageRanksByFullTotal: {
    label: 'RA-1, R-18: every page ranks by the full total',
    scoring: false,
  },
  tieOrder: {
    label: 'RA-3, R-30: ties listed in Lithuanian order',
    scoring: false,
  },
  adminHideSeparate: {
    label: 'RA-4, R-19: an admin hide is a state of its own',
    scoring: false,
  },
  rankHistoryFromWhenEarned: {
    label: 'RA-5, R-17: standings and survival count from when earned',
    scoring: false,
  },
  switchOff: {
    label: 'PL-1, R-7, R-32: switched off after 20 fill-ins in a tournament',
    scoring: false,
  },
  registrationClosesAt: {
    label: 'PL-2, R-8: registration closes at the standings deadline',
    scoring: false,
  },
  lateJoinersFilledIn: {
    label: 'PL-2, R-9: a late joiner is filled in for games already played',
    scoring: false,
  },
});

const FIELDS = Object.keys(RULINGS).filter(
  (field): field is RuleField => field in RULINGS,
);

/** What a rule set changes against plain sportbetRules. */
export type Effect =
  | { readonly kind: 'no-stored-row' }
  | { readonly kind: 'refused'; readonly refusal: string }
  | {
      readonly kind: 'changes';
      /** Rows added, removed or with a column changed, over the four tables. */
      readonly rows: number;
      /** Players with a changed row or total. */
      readonly players: number;
      /** The players' totals added up, variant minus sportbet, in ten-thousandths. */
      readonly points: number;
    };

export interface FieldImpact {
  readonly field: RuleField;
  readonly label: string;
  readonly effect: Effect;
}

export interface RulingsImpact {
  /** Plain sportbetRules, in memory: the rankings are compared on its totals. */
  readonly base: TournamentPoints;
  readonly fields: readonly FieldImpact[];
  /** Every ruling at once (the ruledRules run the reader stored). */
  readonly ruled: Effect;
}

/**
 * A tournament's inputs as a rule set reads them (the db's
 * loadInputsUnderRuleSet), or why they cannot be read.
 */
export type InputsUnder = (
  rules: RuleSet,
) => Promise<Result<TournamentInputs, string>>;

/**
 * Survival rows by player, round and their order within it: a row folded
 * from the picks rewrites no stored row, so it has no stored id.
 */
const byPlayerAndRound = (): SurvivalKey => {
  const seen = new Map<string, number>();
  return (row) => {
    const key = `${row.player}/${String(row.round)}`;
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    return `${key}/${String(nth)}`;
  };
};

/** A total's four parts in ten-thousandths (RA-1). */
const tenThousandths = (total: TournamentTotal) =>
  (total.match.hundredths +
    total.serija.hundredths +
    total.survival.hundredths) *
    100 +
  total.standings.tenThousandths;

function effectOf(
  base: TournamentPoints,
  other: TournamentPoints,
  scored: ReadonlySet<GameId>,
): Effect {
  const players = new Set<PlayerId>();
  let rows = 0;
  for (const table of PARITY_TABLES) {
    const before = keyedRows(base, table, scored, byPlayerAndRound());
    const after = keyedRows(other, table, scored, byPlayerAndRound());
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(key);
      const b = after.get(key);
      if (differing(a, b).length === 0) continue;
      rows += 1;
      const subject = (b ?? a)?.subject;
      if (subject !== undefined && 'player' in subject) {
        players.add(subject.player);
      }
    }
  }
  const totalOf = (points: TournamentPoints) =>
    new Map(
      points.totals.map((total) => [total.player, tenThousandths(total)]),
    );
  const before = totalOf(base);
  const after = totalOf(other);
  let points = 0;
  for (const player of new Set([...before.keys(), ...after.keys()])) {
    const change = (after.get(player) ?? 0) - (before.get(player) ?? 0);
    if (change !== 0) players.add(player);
    points += change;
  }
  return { kind: 'changes', rows, players: players.size, points };
}

/**
 * Spec 3: for each field recalculateTournament reads, one recalculation
 * under sportbetRules with only that field set to its ruledRules value,
 * each reading what its own rule set reads, compared in memory with plain
 * sportbetRules; then every ruling at once. Nothing is stored. A field
 * whose effect needs another (the crowd votes count only where the odds
 * come from the votes) shows its share only in the difference between the
 * sum and the whole.
 */
export async function rulingsImpact(
  inputsUnder: InputsUnder,
  scored: ReadonlySet<GameId>,
): Promise<Result<RulingsImpact, string>> {
  const run = async (
    rules: RuleSet,
  ): Promise<Result<TournamentPoints, string>> => {
    const inputs = await inputsUnder(rules);
    return inputs.ok ? recalculateTournament(inputs.value, rules) : inputs;
  };
  const base = await run(sportbetRules);
  if (!base.ok) return base;
  const against = (result: Result<TournamentPoints, string>): Effect =>
    result.ok
      ? effectOf(base.value, result.value, scored)
      : { kind: 'refused', refusal: result.refusal };
  const fields: FieldImpact[] = [];
  for (const field of FIELDS) {
    const { label, scoring } = RULINGS[field];
    if (!scoring) {
      fields.push({ field, label, effect: { kind: 'no-stored-row' } });
      continue;
    }
    const variant: RuleSet = Object.freeze({
      ...sportbetRules,
      [field]: ruledRules[field],
    });
    fields.push({ field, label, effect: against(await run(variant)) });
  }
  return ok({
    base: base.value,
    fields,
    ruled: against(await run(ruledRules)),
  });
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/rulings.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, `Tests  8 passed (8)`.

- [ ] **Step 5: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/parity/rulings.ts tools/migrate/src/parity/rulings.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): each owner ruling's impact, one RuleSet field at a time (#11)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 (backend-dev): League rankings against sportbet's own

Spec 4: `rankPlayers` over the new code's sportbet totals against sportbet's leaderboard, rank and total per player, for every league. The expected totals in the test (1934.00, 978.50, 427.50) are sportbet's leaderboard for the synthetic dump's league at `1ac955f`, recomputed, not rerun: at `0da316f` sportbet's own leaderboard printed 1904.00, 978.50 and 397.50 for it while this plan was written, and R-42 (ae59615) adds 30.00 to ada (EL h3 exact score: bingo 20 -> 50) and to cai (EL h3 now 95:90, the exact margin: difference 40 -> 70); ben's total and every rank are unchanged. If a total differs at Step 4, recompute it from the gate's golden scenario (`goldenSnapshot(sportbetRules)` summed per player) rather than editing the domain.

**Files:**
- Create: `tools/migrate/src/parity/rankings.ts`
- Test: `tools/migrate/src/parity/rankings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/migrate/src/parity/rankings.test.ts`:

```ts
import type { TournamentPlayer } from '@sportbet/db';
import {
  recalculateTournament,
  sportbetRules,
  type PlayerId,
} from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  compareRankings,
  type OldAppRank,
  type RankingsInput,
} from './rankings';

const { totals } = unwrap(
  recalculateTournament(
    goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    }),
    sportbetRules,
  ),
);
const who = (name: (typeof GOLDEN.players)[number]) => NAME_IDS.player(name);

/** dan is switched off, as in the synthetic dump: sportbet lists him nowhere. */
const PLAYERS: readonly TournamentPlayer[] = GOLDEN.players.map((name) => ({
  player: who(name),
  switchedOff: name === 'dan',
  adminHidden: false,
  fillIns: 0,
}));

/** sportbet's own leaderboard of the golden league: 1934.00, 978.50, 427.50. */
const SPORTBET: readonly OldAppRank[] = [
  { league: 2, player: who('ada'), rank: 1, totalCents: 193_400 },
  { league: 2, player: who('ben'), rank: 2, totalCents: 97_850 },
  { league: 2, player: who('cai'), rank: 3, totalCents: 42_750 },
];

const input = (oldApp: readonly OldAppRank[]): RankingsInput => ({
  leagues: [{ id: 2, members: GOLDEN.players.map(who) }],
  totals,
  players: PLAYERS,
  usernames: new Map<PlayerId, string>(
    GOLDEN.players.map((name) => [who(name), name]),
  ),
  oldApp,
});

describe('compareRankings', () => {
  it("agrees with sportbet's leaderboard of the golden league: no difference, dan listed on neither", () => {
    expect(compareRankings(input(SPORTBET))).toEqual([
      { league: 2, players: 3, differences: [] },
    ]);
  });

  it('lists each player whose rank differs, with both ranks', () => {
    const swapped = SPORTBET.map((row) =>
      row.player === who('ben')
        ? { ...row, rank: 3 }
        : row.player === who('cai')
          ? { ...row, rank: 2 }
          : row,
    );
    expect(compareRankings(input(swapped))[0]?.differences).toEqual([
      {
        player: who('ben'),
        username: 'ben',
        newCode: { rank: 2, totalCents: 97_850 },
        oldApp: { rank: 3, totalCents: 97_850 },
      },
      {
        player: who('cai'),
        username: 'cai',
        newCode: { rank: 3, totalCents: 42_750 },
        oldApp: { rank: 2, totalCents: 42_750 },
      },
    ]);
  });

  it('compares totals to the cent (12): 1934.00 and 1934.01 differ', () => {
    const off = SPORTBET.map((row) =>
      row.player === who('ada') ? { ...row, totalCents: 193_401 } : row,
    );
    expect(compareRankings(input(off))[0]?.differences).toEqual([
      {
        player: who('ada'),
        username: 'ada',
        newCode: { rank: 1, totalCents: 193_400 },
        oldApp: { rank: 1, totalCents: 193_401 },
      },
    ]);
  });

  it('lists a player only one side ranks', () => {
    const withDan = [
      ...SPORTBET,
      { league: 2, player: who('dan'), rank: 4, totalCents: 3_400 },
    ];
    expect(compareRankings(input(withDan))[0]).toEqual({
      league: 2,
      players: 4,
      differences: [
        {
          player: who('dan'),
          username: 'dan',
          newCode: null,
          oldApp: { rank: 4, totalCents: 3_400 },
        },
      ],
    });
  });

  it("ranks a league on its own tournament's totals only (11): another league's rows are not its", () => {
    const withOther = [
      ...SPORTBET,
      { league: 1, player: who('ada'), rank: 1, totalCents: 8_000 },
    ];
    expect(compareRankings(input(withOther))).toEqual([
      { league: 2, players: 3, differences: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/rankings.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `Error: Cannot find module './rankings' imported from .../tools/migrate/src/parity/rankings.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the comparison**

Create `tools/migrate/src/parity/rankings.ts`:

```ts
import type { TournamentPlayer } from '@sportbet/db';
import {
  rankPlayers,
  sportbetRules,
  type PlayerId,
  type TournamentTotal,
} from '@sportbet/domain';
import type { League } from '../map';

/** One row of sportbet's own leaderboard (sportbet-app.ts). */
export interface OldAppRank {
  readonly league: number;
  readonly player: PlayerId;
  readonly rank: number;
  /** The total sportbet ranks by, to the cent (issue #229). */
  readonly totalCents: number;
}

/** A player's place on one side. */
export interface Placed {
  readonly rank: number;
  readonly totalCents: number;
}

/** A player whose rank or total differs; null where one side lists them not. */
export interface RankDifference {
  readonly player: PlayerId;
  readonly username: string;
  readonly newCode: Placed | null;
  readonly oldApp: Placed | null;
}

export interface LeagueRanking {
  readonly league: number;
  /** Players listed on either side. */
  readonly players: number;
  readonly differences: readonly RankDifference[];
}

export interface RankingsInput {
  readonly leagues: readonly League[];
  /** The new code's totals under sportbetRules (recalculateTournament's). */
  readonly totals: readonly TournamentTotal[];
  /** Who is listed: not switched off, not hidden by an admin (RA-4). */
  readonly players: readonly TournamentPlayer[];
  readonly usernames: ReadonlyMap<PlayerId, string>;
  readonly oldApp: readonly OldAppRank[];
}

/**
 * Spec 4: for every league, the domain's league table over the new code's
 * sportbet totals against sportbet's own (PointController::getAllUserPoints
 * with every member visible, then Ranking): rank and total per player. Only
 * oracle (b)'s ranking is compared, as a ranking over stale rows is stale
 * too. Pure.
 */
export function compareRankings(
  input: RankingsInput,
): readonly LeagueRanking[] {
  const totalOf = new Map(input.totals.map((total) => [total.player, total]));
  const statusOf = new Map(input.players.map((each) => [each.player, each]));
  const nameOf = (player: PlayerId) => {
    const name = input.usernames.get(player);
    if (name === undefined)
      throw new Error('rankings: a player has no username');
    return name;
  };
  return input.leagues.map((league) => {
    const ranked = rankPlayers(
      league.members.map((player) => {
        const total = totalOf.get(player);
        const status = statusOf.get(player);
        if (total === undefined || status === undefined) {
          // Every league member is a player of the tournament (mapSportbet),
          // and recalculateTournament totals every player.
          throw new Error('rankings: a league member has no total');
        }
        return {
          ...total,
          username: nameOf(player),
          listed: !status.switchedOff && !status.adminHidden,
        };
      }),
      'league-table',
      sportbetRules,
    );
    const newCode = new Map(
      ranked.map((row) => [
        row.player,
        { rank: row.rank, totalCents: row.totalCents },
      ]),
    );
    const oldApp = new Map(
      input.oldApp
        .filter((row) => row.league === league.id)
        .map((row) => [
          row.player,
          { rank: row.rank, totalCents: row.totalCents },
        ]),
    );
    const players = [...new Set([...newCode.keys(), ...oldApp.keys()])];
    const differences = players.flatMap((player): RankDifference[] => {
      const ours = newCode.get(player) ?? null;
      const theirs = oldApp.get(player) ?? null;
      return ours?.rank === theirs?.rank &&
        ours?.totalCents === theirs?.totalCents
        ? []
        : [{ player, username: nameOf(player), newCode: ours, oldApp: theirs }];
    });
    return { league: league.id, players: players.length, differences };
  });
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/rankings.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, `Tests  5 passed (5)`.

- [ ] **Step 5: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/parity/rankings.ts tools/migrate/src/parity/rankings.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): compare every league's ranking with sportbet's own (#11)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6 (backend-dev): sportbet's own app on the reader's private network

Spec 2. The script the old app runs, how its output is read (markers and ids only, never printed), the command's two flags, and the containers: the image check, the internal network, the idle app container. Talks to Docker only through `containers.ts`. The end-to-end test (Task 8) runs it on the real image.

**Files:**
- Create: `tools/migrate/src/sportbet-app.ts`
- Modify: `tools/migrate/src/containers.ts`
- Test: `tools/migrate/src/sportbet-app.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/migrate/src/sportbet-app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parityOptionOf, parseOldAppOutput } from './sportbet-app';

const STEPS = ['PARITY-STEP recalculated', 'PARITY-STEP standings'];
const RANKINGS =
  'PARITY-RANKINGS [{"league":2,"user":1,"rank":1,"total":"1934.00"},{"league":2,"user":3,"rank":2,"total":"-0.50"}]';

const printed = (...lines: string[]) => [...STEPS, ...lines].join('\n');

describe("the old app's output", () => {
  it('reads the rankings as ids, ranks and totals to the cent, whatever else tinker prints', () => {
    expect(
      parseOldAppOutput(0, ['a notice', ...STEPS, RANKINGS, ''].join('\r\n')),
    ).toEqual({
      ok: true,
      value: [
        { league: 2, player: '1', rank: 1, totalCents: 193_400 },
        { league: 2, player: '3', rank: 2, totalCents: -50 },
      ],
    });
  });

  it('says only the exit code and the steps done when the old app fails, never what it printed', () => {
    const failed = `PARITY-STEP recalculated\nSQLSTATE[23000]: 'sentinel.ada@example.invalid'`;
    expect(parseOldAppOutput(1, failed)).toEqual({
      ok: false,
      refusal: 'exited with 1 after 1 of 3 steps',
    });
  });

  it('refuses output that stops before the rankings', () => {
    expect(parseOldAppOutput(0, printed())).toEqual({
      ok: false,
      refusal: 'finished 2 of 3 steps',
    });
  });

  it('refuses rankings that are not JSON, do not parse, or hold a total with more than two places', () => {
    expect(parseOldAppOutput(0, printed('PARITY-RANKINGS {'))).toEqual({
      ok: false,
      refusal: 'printed rankings that are not JSON',
    });
    expect(
      parseOldAppOutput(0, printed('PARITY-RANKINGS [{"league":2}]')),
    ).toEqual({
      ok: false,
      refusal:
        'printed rankings that do not parse (ZodError: 3 issues; first: user invalid_type (expected number))',
    });
    expect(
      parseOldAppOutput(
        0,
        printed(
          'PARITY-RANKINGS [{"league":2,"user":1,"rank":1,"total":"1.005"}]',
        ),
      ),
    ).toEqual({
      ok: false,
      refusal: 'printed a total that is not a decimal (too-many-places)',
    });
  });
});

describe('--parity and --sportbet-tag', () => {
  it('takes neither, or both with a commit', () => {
    expect(parityOptionOf(false, undefined)).toEqual({ ok: true, value: null });
    expect(parityOptionOf(true, '1ac955f')).toEqual({
      ok: true,
      value: { tag: '1ac955f' },
    });
  });

  it('refuses one without the other, and a tag that is not a commit', () => {
    expect(parityOptionOf(true, undefined)).toEqual({
      ok: false,
      refusal: '--parity needs --sportbet-tag <commit>',
    });
    expect(parityOptionOf(false, '1ac955f')).toEqual({
      ok: false,
      refusal: '--sportbet-tag needs --parity',
    });
    expect(parityOptionOf(true, 'latest')).toEqual({
      ok: false,
      refusal: '--sportbet-tag is a commit of sportbet: 7 to 40 hex digits',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/sportbet-app.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `Error: Cannot find module './sportbet-app' imported from .../tools/migrate/src/sportbet-app.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 3: The containers**

In `tools/migrate/src/containers.ts`, replace:

```ts
import { getContainerRuntimeClient } from 'testcontainers';
```

with:

```ts
import {
  GenericContainer,
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
```

Replace:

```ts
/** The labels of a container started by run `run` of this process. */
const labels = (run: string, role: 'mysql' | 'postgres') => ({
```

with:

```ts
/** The labels of a container or network made by run `run` of this process. */
const labels = (
  run: string,
  role: 'mysql' | 'postgres' | 'sportbet-app' | 'network',
) => ({
```

Append to the file:

```ts

/**
 * sportbet's own application image, as production runs it: the parity
 * checker's oracle (b). The reader never pulls it: it must already be on
 * this PC (README: building it from sportbet's commit).
 */
export const SPORTBET_APP_IMAGE = 'sportbet-app';

/** The MySQL container's name on the run's private network. */
const MYSQL_ALIAS = 'sportbet-mysql';

/** Whether a Docker error says the object does not exist (404). */
const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  Reflect.get(error, 'statusCode') === 404;

/** Whether `image` is on this PC's Docker. */
export async function imageExists(image: string): Promise<boolean> {
  const client = await getContainerRuntimeClient();
  try {
    await client.container.dockerode.getImage(image).inspect();
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/**
 * The run's private network: internal, so nothing on it has a route out
 * of this PC, and labelled like the run's containers. Its name.
 */
export async function startNetwork(run: string): Promise<string> {
  const client = await getContainerRuntimeClient();
  const name = `${LABEL}-${run}`;
  await client.container.dockerode.createNetwork({
    Name: name,
    Internal: true,
    Labels: labels(run, 'network'),
  });
  return name;
}

/** Joins the MySQL to the network, where the old app finds it as MYSQL_ALIAS. */
export async function joinNetwork(
  network: string,
  mysql: StartedMySqlContainer,
): Promise<void> {
  const client = await getContainerRuntimeClient();
  await client.container.dockerode.getNetwork(network).connect({
    Container: mysql.getId(),
    EndpointConfig: { Aliases: [MYSQL_ALIAS] },
  });
}

/**
 * sportbet's own app at `tag`, idle, on the run's private network only: no
 * port published and no route out, a throwaway APP_KEY, mail kept in
 * memory, jobs run at once, logs dropped (spec 2). It reads and rewrites
 * the restored copy as MySQL's root, as the copy is thrown away with it.
 */
export async function startSportbetApp(
  run: string,
  tag: string,
  network: string,
  mysql: StartedMySqlContainer,
): Promise<StartedTestContainer> {
  return new GenericContainer(`${SPORTBET_APP_IMAGE}:${tag}`)
    .withNetworkMode(network)
    .withEntrypoint(['tail'])
    .withCommand(['-f', '/dev/null'])
    .withEnvironment({
      APP_ENV: 'parity',
      APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
      APP_DEBUG: 'false',
      DB_CONNECTION: 'mysql',
      DB_HOST: MYSQL_ALIAS,
      DB_PORT: '3306',
      DB_DATABASE: MYSQL_DATABASE,
      DB_USERNAME: 'root',
      DB_PASSWORD: mysql.getRootPassword(),
      CACHE_STORE: 'array',
      SESSION_DRIVER: 'array',
      MAIL_MAILER: 'array',
      QUEUE_CONNECTION: 'sync',
      LOG_CHANNEL: 'null',
    })
    .withLabels(labels(run, 'sportbet-app'))
    .start();
}

/** Every network carrying the reader's label - of run `run` only, when given. */
export async function labelledNetworks(
  run?: string,
): Promise<LabelledContainer[]> {
  const client = await getContainerRuntimeClient();
  const networks = await client.container.dockerode.listNetworks({
    filters: { label: [run === undefined ? LABEL : `${LABEL}=${run}`] },
  });
  return networks.map(({ Id, Labels }) => {
    const pid = Number(Labels?.[PID_LABEL]);
    return {
      id: Id,
      run: Labels?.[LABEL] ?? '',
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    };
  });
}

/**
 * Removes the networks `ids`; returns how many it removed. A network still
 * in use refuses removal, so the containers on it go first.
 */
async function removeNetworks(ids: readonly string[]): Promise<number> {
  const client = await getContainerRuntimeClient();
  let removed = 0;
  for (const id of ids) {
    try {
      await client.container.dockerode.getNetwork(id).remove();
      removed += 1;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return removed;
}

/** Removes run `run`'s networks; returns how many it removed. */
export async function removeRunNetworks(run: string): Promise<number> {
  return removeNetworks((await labelledNetworks(run)).map(({ id }) => id));
}

/** Removes the labelled networks a crashed run left (abandoned). */
export async function removeAbandonedNetworks(): Promise<number> {
  return removeNetworks(
    abandoned(await labelledNetworks()).map(({ id }) => id),
  );
}
```

(`isGone` is not reused for networks on purpose: it takes a 409 as "already being removed", and Docker answers 409 for a network that still has a container on it.)

- [ ] **Step 4: The old app's run**

Create `tools/migrate/src/sportbet-app.ts`:

```ts
import { playerOf } from '@sportbet/db';
import { decimalUnits, ok, refuse, type Result } from '@sportbet/domain';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedTestContainer } from 'testcontainers';
import { z } from 'zod';
import { joinNetwork, startNetwork, startSportbetApp } from './containers';
import type { OldAppRank } from './parity/rankings';
import { issuesSummary, ReaderProblem } from './problem';

/** A commit of sportbet, as its deploys tag the image: 7 to 40 hex digits. */
const SPORTBET_TAG = /^[0-9a-f]{7,40}$/;

/**
 * The command's `--parity` and `--sportbet-tag`: the parity stage's tag,
 * none without `--parity`, or why the two do not go together. The tag is
 * required - a run against a tag that is not production's proves nothing -
 * and is a commit, as production's deploys tag its image.
 */
export function parityOptionOf(
  parity: boolean,
  tag: string | undefined,
): Result<{ readonly tag: string } | null, string> {
  if (!parity) {
    return tag === undefined
      ? ok(null)
      : refuse('--sportbet-tag needs --parity');
  }
  if (tag === undefined)
    return refuse('--parity needs --sportbet-tag <commit>');
  return SPORTBET_TAG.test(tag)
    ? ok({ tag })
    : refuse('--sportbet-tag is a commit of sportbet: 7 to 40 hex digits');
}

/**
 * What the old app runs, in one `php artisan tinker --execute` (spec 2):
 * sportbet's full recalculation (what /admin/recalculateAllGamePoints runs:
 * every scored game rescored, the serija rebuilt, survival refolded from
 * the stored rows; no fill-ins and no odds), the standings recalculation
 * (/admin/updateStandingPoints), and every league's leaderboard with every
 * member visible (the highest guest level), ranked by sportbet's Ranking.
 * It prints a marker after each step and the rankings as ids, ranks and
 * totals to the cent - never a username, a name or an email.
 */
export const OLD_APP_SCRIPT = [
  'app(App\\Services\\Recalculation::class)->all();',
  'echo "PARITY-STEP recalculated\\n";',
  'app(App\\Http\\Controllers\\PointStandingController::class)->updateStandingPoints();',
  'echo "PARITY-STEP standings\\n";',
  '$rows = [];',
  "foreach (Illuminate\\Support\\Facades\\DB::table('leagues')->orderBy('id')->pluck('id') as $league) {",
  '    foreach (app(App\\Http\\Controllers\\PointController::class)->getAllUserPoints((int) $league, PHP_INT_MAX) as $row) {',
  "        $rows[] = ['league' => (int) $league, 'user' => (int) $row['userID'], 'rank' => (int) $row['rank'], 'total' => number_format(App\\Support\\Ranking::leaderboardTotal($row), 2, '.', '')];",
  '    }',
  '}',
  'echo \'PARITY-RANKINGS \', json_encode($rows), "\\n";',
].join('\n');

const STEPS = ['recalculated', 'standings'] as const;
const RANKINGS = 'PARITY-RANKINGS ';

const printedRanks = z.array(
  z.object({
    league: z.int().positive(),
    user: z.int().positive(),
    rank: z.int().positive(),
    total: z.string(),
  }),
);

/**
 * The old app's output, parsed: its rankings, or why they cannot be read
 * - the exit code and how many steps it finished, never a line of what it
 * printed, which an error could fill with a row's values.
 */
export function parseOldAppOutput(
  exitCode: number,
  stdout: string,
): Result<readonly OldAppRank[], string> {
  const lines = stdout.split(/\r?\n/);
  const done = STEPS.filter((step) =>
    lines.includes(`PARITY-STEP ${step}`),
  ).length;
  if (exitCode !== 0) {
    return refuse(
      `exited with ${String(exitCode)} after ${String(done)} of 3 steps`,
    );
  }
  const printed = lines.find((line) => line.startsWith(RANKINGS));
  if (done < STEPS.length || printed === undefined) {
    return refuse(`finished ${String(done)} of 3 steps`);
  }
  let json: unknown;
  try {
    json = JSON.parse(printed.slice(RANKINGS.length));
  } catch {
    return refuse('printed rankings that are not JSON');
  }
  const rows = printedRanks.safeParse(json);
  if (!rows.success) {
    return refuse(
      `printed rankings that do not parse (${issuesSummary(rows.error.issues)})`,
    );
  }
  const ranks: OldAppRank[] = [];
  for (const row of rows.data) {
    const cents = decimalUnits(row.total, 2);
    if (!cents.ok) {
      return refuse(`printed a total that is not a decimal (${cents.refusal})`);
    }
    ranks.push({
      league: row.league,
      player: playerOf(row.user),
      rank: row.rank,
      totalCents: cents.value,
    });
  }
  return ok(ranks);
}

/** What the old app's run makes, so the run's cleanup removes it on every path. */
export interface OldAppResources {
  /** The run's id: the value of the label on everything it makes. */
  readonly id: string;
  network: string | null;
  sportbetApp: StartedTestContainer | null;
}

/**
 * Oracle (b), spec 2: sportbet's own app at `tag` recalculates the restored
 * copy in `mysql` - on the run's private network, through containers.ts -
 * and ranks every league. Its rankings; its rows are then read back from
 * the MySQL. The app's container is removed as soon as it is done; the
 * network goes with the MySQL.
 */
export async function runSportbetApp(
  resources: OldAppResources,
  tag: string,
  mysql: StartedMySqlContainer,
): Promise<readonly OldAppRank[]> {
  resources.network = await startNetwork(resources.id);
  await joinNetwork(resources.network, mysql);
  const app = await startSportbetApp(
    resources.id,
    tag,
    resources.network,
    mysql,
  );
  resources.sportbetApp = app;
  const { exitCode, stdout } = await app.exec(
    ['php', 'artisan', 'tinker', `--execute=${OLD_APP_SCRIPT}`],
    { workingDir: '/var/www/html' },
  );
  await app.stop({ remove: true, removeVolumes: true });
  resources.sportbetApp = null;
  const ranks = parseOldAppOutput(exitCode, stdout);
  if (!ranks.ok) {
    throw new ReaderProblem(`sportbet's own recalculation ${ranks.refusal}`);
  }
  return ranks.value;
}
```

- [ ] **Step 5: Run it to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/sportbet-app.test.ts src/containers.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  2 passed (2)`; `sportbet-app.test.ts` has `6` tests, `containers.test.ts` its gate count.

- [ ] **Step 6: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/sportbet-app.ts tools/migrate/src/sportbet-app.test.ts tools/migrate/src/containers.ts
git commit -m "$(cat <<'EOF'
feat(migrate): run sportbet's own recalculation on the copy, on a private network (#11)

The old app's image is never pulled; its container joins only an
internal network beside the reader's MySQL, with a throwaway key, mail
in memory and logs dropped. It prints markers and ids only, and a
failure is reported as its exit code and the steps it finished.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7 (backend-dev): The parity report, and its place in the load report

Spec 5: per table the counts per class, each `new-code-wrong` row by username and game (teams and date), team or round with all three values, `stale` rows counted per column, the rulings, the rankings, what it cannot check, and the verdict; in text and in `--json`. Exit 1 when a row is `new-code-wrong` or refused.

**Files:**
- Create: `tools/migrate/src/parity/report.ts`
- Modify: `tools/migrate/src/report.ts`
- Test: `tools/migrate/src/parity/report.test.ts`, `tools/migrate/src/report.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/migrate/src/parity/report.test.ts`:

```ts
import {
  ok,
  Points,
  recalculateTournament,
  sportbetRules,
  type GameId,
  type PointsRows,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  roundNo,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  DUMP_IDS,
  EUROLEAGUE,
  readRows,
  syntheticDump,
} from '../../test/fixtures/sportbet-dump';
import { mapSportbet } from '../map';
import { compareTournament } from './compare';
import {
  describeTournament,
  namesOf,
  notCompared,
  parityReport,
  renderParity,
  type Names,
} from './report';

const base = unwrap(
  recalculateTournament(
    goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    }),
    sportbetRules,
  ),
);
const ROWS: PointsRows = base;

const GAMES = new Map<GameId, string>([
  [gameNo(1), 'ZAL-OLY 2026-06-15'],
  [gameNo(2), 'REA-FEN 2026-06-15'],
  [gameNo(3), 'ZAL-FEN 2026-06-20'],
]);
/** The golden scenario's own names: its ids are its names (NAME_IDS). */
const NAMES: Names = {
  player: (id) => id,
  team: (id) => id,
  round: (number) => `EL E${String(number)}`,
  game: (id) => GAMES.get(id) ?? '?',
};

/** ada's EL h1 winner points off by a cent in the new code; ben's EL h2 serija lost from production. */
function planted() {
  const newCode: PointsRows = {
    ...ROWS,
    matches: ROWS.matches.map((row) =>
      row.player === NAME_IDS.player('ada') && row.game === gameNo(1)
        ? {
            ...row,
            points: {
              ...row.points,
              winner: unwrap(Points.ofHundredths(7_949)),
            },
          }
        : row,
    ),
  };
  const production: PointsRows = {
    ...ROWS,
    matches: ROWS.matches.map((row) =>
      row.player === NAME_IDS.player('cai') && row.game === gameNo(2)
        ? { ...row, serija: Points.ZERO }
        : row,
    ),
  };
  return compareTournament({
    production,
    oldApp: ROWS,
    newCode,
    refused: { matches: [], standings: [], survival: [], odds: [] },
    scored: new Set(GAMES.keys()),
  });
}

const RULINGS = ok({
  base,
  fields: [
    {
      field: 'positionsGetCrowdBonus' as const,
      label: 'ST-4, R-35: no crowd bonus on a table position',
      effect: {
        kind: 'changes' as const,
        rows: 4,
        players: 1,
        points: -7_600_000,
      },
    },
    {
      field: 'movedGameReopens' as const,
      label: 'LR-2, R-13: a moved game reopens only before its tip-off',
      effect: { kind: 'no-stored-row' as const },
    },
  ],
  ruled: { kind: 'changes' as const, rows: 4, players: 1, points: -7_000_000 },
});

const described = () =>
  describeTournament({
    tournament: 'golden-el',
    tables: planted(),
    rulings: RULINGS,
    rankings: [
      {
        league: 2,
        players: 3,
        differences: [
          {
            player: NAME_IDS.player('ben'),
            username: 'ben',
            newCode: { rank: 2, totalCents: 97_850 },
            oldApp: null,
          },
        ],
      },
    ],
    names: NAMES,
  });

describe('the parity report', () => {
  it('names a new-code-wrong row by username and game, with all three values', () => {
    expect(described().wrong).toEqual([
      {
        table: 'point_results',
        row: 'ada, ZAL-OLY 2026-06-15',
        differences: [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '79.49',
          },
        ],
      },
    ]);
  });

  it('counts stale rows per table and per column, not one by one', () => {
    expect(described().stale.point_results).toEqual({ streak_bonus: 1 });
  });

  it('adds up the verdict over every tournament, a tournament not compared included', () => {
    const report = parityReport('1ac955f', 'backup', [
      described(),
      notCompared(
        'other-el',
        'the sportbet recalculation was refused (odds-missing)',
      ),
    ]);
    expect([report.newCodeWrong, report.refused]).toEqual([1, 0]);
  });

  it('prints the counts, each wrong row, the stale columns, the rulings, the rankings, what it cannot check and the verdict', () => {
    const lines = renderParity(
      parityReport('1ac955f', 'backup', [described()]),
    );
    expect(lines.slice(0, 8)).toEqual([
      'parity against sportbet 1ac955f, backup backup',
      '',
      'tournament golden-el',
      '  table                     match          stale new-code-wrong        refused',
      '  point_results                 7              1              1              0',
      '  point_standings               8              0              0              0',
      '  point_survivals               5              0              0              0',
      '  game_odds                     3              0              0              0',
    ]);
    expect(lines).toEqual(
      expect.arrayContaining([
        '  new-code-wrong point_results: ada, ZAL-OLY 2026-06-15',
        '    winner_points: production 79.50, old app 79.50, new code 79.49',
        '  stale point_results.streak_bonus: 1',
        '    ST-4, R-35: no crowd bonus on a table position: rows changed 4, players affected 1, points changed -760.0000',
        '    LR-2, R-13: a moved game reopens only before its tip-off: changes no stored row',
        '    all rulings (ruledRules): rows changed 4, players affected 1, points changed -700.0000',
        '  rankings of league 2: 3 players, 1 differ',
        '    ben: rank 2 (978.50) by the new code, not ranked by sportbet',
        '  broken survival runs (audit Q3)',
      ]),
    );
    expect(lines.at(-1)).toBe('PARITY FAILS: 1 rows new-code-wrong');
  });

  it('holds when no row is new-code-wrong, stale rows or not', () => {
    expect(renderParity(parityReport('1ac955f', 'backup', [])).at(-1)).toBe(
      'PARITY HOLDS',
    );
  });

  it("names the synthetic dump's players, games, teams and rounds from what the map loaded", () => {
    const mapped = mapSportbet(readRows(syntheticDump()));
    const tournament = mapped.tournaments.find(
      (each) => each.tournament.id === EUROLEAGUE,
    );
    if (tournament === undefined) throw new Error('no Euroleague tournament');
    const names = namesOf(
      tournament,
      new Map(mapped.players.map(({ id, username }) => [id, username])),
    );
    expect([
      names.player(DUMP_IDS.player('ada')),
      names.game(DUMP_IDS.game(3)),
      names.team(DUMP_IDS.team('REA')),
      names.round(roundNo(2)),
    ]).toEqual(['ada', 'ZAL-FEN 2026-06-20', 'REA', 'EL E2']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/report.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `Error: Cannot find module './report' imported from .../tools/migrate/src/parity/report.test.ts`, `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the parity report**

Create `tools/migrate/src/parity/report.ts`:

```ts
import type {
  GameId,
  PlayerId,
  Result,
  RoundNumber,
  TeamId,
} from '@sportbet/domain';
import type { MappedTournament } from '../map';
import {
  PARITY_CLASSES,
  PARITY_TABLES,
  type ColumnDifference,
  type ParityClass,
  type ParityTable,
  type RowSubject,
  type TableParity,
} from './compare';
import type { LeagueRanking, Placed } from './rankings';
import type { Effect, RulingsImpact } from './rulings';

/** Spec 1: what the checker cannot check, as its report says. */
export const CANNOT_CHECK: readonly string[] = [
  "generated predictions are taken as stored, not regenerated: sportbet's full recalculation does not regenerate them either, so both oracles score the same rows",
  'broken survival runs (audit Q3)',
  'the odds of a game whose predictions changed after its result was saved',
  "a row fed by a row the reader refused (a crowd count, a serija) may differ; the refusal is in the load report's table counts",
];

/** A `new-code-wrong` row, named for the owner to read. */
export interface WrongRow {
  readonly table: ParityTable;
  /** Username and game (teams and date), team or round. */
  readonly row: string;
  readonly differences: readonly ColumnDifference[];
}

export interface RankingReport {
  readonly league: number;
  readonly players: number;
  readonly differences: readonly {
    readonly username: string;
    readonly newCode: Placed | null;
    readonly oldApp: Placed | null;
  }[];
}

export type RulingsReport =
  | {
      readonly fields: readonly {
        readonly label: string;
        readonly effect: Effect;
      }[];
      readonly ruled: Effect;
    }
  | { readonly refusal: string };

/** One tournament's parity; `notCompared` says why it has no counts. */
export interface TournamentParityReport {
  readonly tournament: string;
  readonly notCompared: string | null;
  readonly counts: Readonly<
    Record<ParityTable, Readonly<Record<ParityClass, number>>>
  >;
  readonly wrong: readonly WrongRow[];
  /** `stale` rows counted per table and per differing column. */
  readonly stale: Readonly<
    Record<ParityTable, Readonly<Record<string, number>>>
  >;
  readonly rulings: RulingsReport | null;
  readonly rankings: readonly RankingReport[];
}

/**
 * The parity report (spec 5). It names a `new-code-wrong` row by its
 * player's username - on the owner's PC only - and holds no name, email or
 * id of a player.
 */
export interface ParityReport {
  readonly tag: string;
  /** The backup's object name, which carries its timestamp. */
  readonly backup: string;
  readonly tournaments: readonly TournamentParityReport[];
  /** Rows new-code-wrong over every tournament: the verdict. */
  readonly newCodeWrong: number;
  /** Rows the checker could not compare, over every tournament. */
  readonly refused: number;
  readonly cannotCheck: readonly string[];
}

/** How the report names what a row is about. */
export interface Names {
  readonly player: (id: PlayerId) => string;
  readonly game: (id: GameId) => string;
  readonly team: (id: TeamId) => string;
  readonly round: (number: RoundNumber) => string;
}

/** The names of one mapped tournament's players, games, teams and rounds. */
export function namesOf(
  tournament: MappedTournament,
  usernames: ReadonlyMap<PlayerId, string>,
): Names {
  const found = <K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V => {
    const value = map.get(key);
    if (value === undefined) throw new Error(`parity: no ${what}`);
    return value;
  };
  const teams = new Map(tournament.teams.map(({ id, name }) => [id, name]));
  const games = new Map(tournament.games.map((game) => [game.id, game]));
  const rounds = new Map(
    tournament.rounds.map(({ name, round }) => [round.number, name]),
  );
  return {
    player: (id) => found(usernames, id, 'username'),
    team: (id) => found(teams, id, 'team'),
    round: (number) => found(rounds, number, 'round'),
    game: (id) => {
      const game = found(games, id, 'game');
      const date = new Date(game.tipOff).toISOString().slice(0, 10);
      return `${found(teams, game.home, 'team')}-${found(teams, game.away, 'team')} ${date}`;
    },
  };
}

function rowName(subject: RowSubject, names: Names): string {
  switch (subject.table) {
    case 'point_results':
      return `${names.player(subject.player)}, ${names.game(subject.game)}`;
    case 'point_standings':
      return `${names.player(subject.player)}, ${names.team(subject.team)}`;
    case 'point_survivals':
      return `${names.player(subject.player)}, ${names.round(subject.round)}`;
    case 'game_odds':
      return names.game(subject.game);
  }
}

/** A value for each table. */
const perTable = <T>(
  of: (table: ParityTable) => T,
): Record<ParityTable, T> => ({
  point_results: of('point_results'),
  point_standings: of('point_standings'),
  point_survivals: of('point_survivals'),
  game_odds: of('game_odds'),
});

/** One tournament's comparison, named for the report. */
export function describeTournament(input: {
  readonly tournament: string;
  readonly tables: readonly TableParity[];
  readonly rulings: Result<RulingsImpact, string>;
  readonly rankings: readonly LeagueRanking[];
  readonly names: Names;
}): TournamentParityReport {
  const tableOf = (table: ParityTable) => {
    const found = input.tables.find((each) => each.table === table);
    if (found === undefined) throw new Error(`parity: no ${table}`);
    return found;
  };
  return {
    tournament: input.tournament,
    notCompared: null,
    counts: perTable((table) => tableOf(table).counts),
    wrong: input.tables.flatMap(({ table, rows }) =>
      rows
        .filter((row) => row.class === 'new-code-wrong')
        .map((row) => ({
          table,
          row: rowName(row.subject, input.names),
          differences: row.differences,
        })),
    ),
    stale: perTable((table) => {
      const columns: Record<string, number> = {};
      for (const row of tableOf(table).rows) {
        if (row.class !== 'stale') continue;
        for (const { column } of row.differences) {
          columns[column] = (columns[column] ?? 0) + 1;
        }
      }
      return columns;
    }),
    rulings: input.rulings.ok
      ? {
          fields: input.rulings.value.fields.map(({ label, effect }) => ({
            label,
            effect,
          })),
          ruled: input.rulings.value.ruled,
        }
      : { refusal: input.rulings.refusal },
    rankings: input.rankings.map(({ league, players, differences }) => ({
      league,
      players,
      differences: differences.map(({ username, newCode, oldApp }) => ({
        username,
        newCode,
        oldApp,
      })),
    })),
  };
}

const NO_COUNTS = perTable(() => ({
  match: 0,
  stale: 0,
  'new-code-wrong': 0,
  refused: 0,
}));

/** A tournament the checker could not compare, and why. */
export const notCompared = (
  tournament: string,
  why: string,
): TournamentParityReport => ({
  tournament,
  notCompared: why,
  counts: NO_COUNTS,
  wrong: [],
  stale: perTable(() => ({})),
  rulings: null,
  rankings: [],
});

/** The parity report over every tournament. */
export function parityReport(
  tag: string,
  backup: string,
  tournaments: readonly TournamentParityReport[],
): ParityReport {
  const total = (kind: ParityClass) =>
    tournaments.reduce(
      (sum, { counts }) =>
        sum +
        PARITY_TABLES.reduce(
          (inTables, table) => inTables + counts[table][kind],
          0,
        ),
      0,
    );
  return {
    tag,
    backup,
    tournaments,
    newCodeWrong: total('new-code-wrong'),
    refused: total('refused'),
    cannotCheck: CANNOT_CHECK,
  };
}

/** Ten-thousandths as signed decimal text, "-760.0000", without a float. */
function tenThousandthsText(units: number): string {
  const sign = units < 0 ? '-' : '';
  const size = Math.abs(units);
  const fraction = String(size % 10_000).padStart(4, '0');
  return `${sign}${String(Math.trunc(size / 10_000))}.${fraction}`;
}

/** Cents as decimal text, "1934.00", without a float. */
function centsText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const size = Math.abs(cents);
  return `${sign}${String(Math.trunc(size / 100))}.${String(size % 100).padStart(2, '0')}`;
}

function effectText(effect: Effect): string {
  switch (effect.kind) {
    case 'no-stored-row':
      return 'changes no stored row';
    case 'refused':
      return `refused (${effect.refusal})`;
    case 'changes':
      return `rows changed ${String(effect.rows)}, players affected ${String(effect.players)}, points changed ${tenThousandthsText(effect.points)}`;
  }
}

const placedText = (side: string, placed: Placed | null) =>
  placed === null
    ? `not ranked by ${side}`
    : `rank ${String(placed.rank)} (${centsText(placed.totalCents)}) by ${side}`;

/** The parity report as the reader prints it, after the load report. */
export function renderParity(report: ParityReport): string[] {
  const lines = [
    `parity against sportbet ${report.tag}, backup ${report.backup}`,
  ];
  for (const each of report.tournaments) {
    lines.push('', `tournament ${each.tournament}`);
    if (each.notCompared !== null) {
      lines.push(`  not compared: ${each.notCompared}`);
      continue;
    }
    lines.push(
      `  ${'table'.padEnd(16)}${PARITY_CLASSES.map((kind) => kind.padStart(15)).join('')}`,
    );
    for (const table of PARITY_TABLES) {
      lines.push(
        `  ${table.padEnd(16)}${PARITY_CLASSES.map((kind) => String(each.counts[table][kind]).padStart(15)).join('')}`,
      );
    }
    for (const { table, row, differences } of each.wrong) {
      lines.push(`  new-code-wrong ${table}: ${row}`);
      for (const { column, production, oldApp, newCode } of differences) {
        lines.push(
          `    ${column}: production ${production}, old app ${oldApp}, new code ${newCode}`,
        );
      }
    }
    for (const table of PARITY_TABLES) {
      for (const [column, count] of Object.entries(each.stale[table])) {
        lines.push(`  stale ${table}.${column}: ${String(count)}`);
      }
    }
    if (each.rulings !== null) {
      lines.push('  rulings, each alone against sportbetRules:');
      if ('refusal' in each.rulings) {
        lines.push(`    not computed: ${each.rulings.refusal}`);
      } else {
        for (const { label, effect } of each.rulings.fields) {
          lines.push(`    ${label}: ${effectText(effect)}`);
        }
        lines.push(
          `    all rulings (ruledRules): ${effectText(each.rulings.ruled)}`,
        );
      }
    }
    for (const { league, players, differences } of each.rankings) {
      lines.push(
        `  rankings of league ${String(league)}: ${String(players)} players, ${String(differences.length)} differ`,
      );
      for (const { username, newCode, oldApp } of differences) {
        lines.push(
          `    ${username}: ${placedText('the new code', newCode)}, ${placedText('sportbet', oldApp)}`,
        );
      }
    }
  }
  lines.push('', 'cannot check:');
  for (const line of report.cannotCheck) lines.push(`  ${line}`);
  lines.push(
    '',
    report.newCodeWrong === 0
      ? 'PARITY HOLDS'
      : `PARITY FAILS: ${String(report.newCodeWrong)} rows new-code-wrong`,
  );
  return lines;
}
```

- [ ] **Step 4: Run it to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/parity/report.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, `Tests  6 passed (6)`.

- [ ] **Step 5: Write the failing tests of the load report**

In `tools/migrate/src/report.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { emptyReport, exitStatusOf, renderReport } from './report';
```

with:

```ts
import { describe, expect, it } from 'vitest';
import { parityReport } from './parity/report';
import { emptyReport, exitStatusOf, renderReport } from './report';
```

Replace:

```ts
  it('is 2 when the run could not complete', () => {
```

with:

```ts
  it('is 1 with --parity when a row is new-code-wrong or could not be compared, 0 when parity holds', () => {
    const parity = parityReport('1ac955f', 'backup', []);
    expect(exitStatusOf({ ...emptyReport(), parity })).toBe(0);
    expect(
      exitStatusOf({
        ...emptyReport(),
        parity: { ...parity, newCodeWrong: 1 },
      }),
    ).toBe(1);
    expect(
      exitStatusOf({ ...emptyReport(), parity: { ...parity, refused: 1 } }),
    ).toBe(1);
  });

  it('is 2 when the run could not complete', () => {
```

Replace:

```ts
describe('the printed report', () => {
```

with:

```ts
describe('the printed report', () => {
  it('prints the parity report after the load report, ending with its verdict', () => {
    const text = renderReport({
      ...emptyReport(),
      parity: parityReport('1ac955f', 'backup', []),
    });
    expect(text).toContain('parity against sportbet 1ac955f, backup backup');
    expect(text).toContain('PARITY HOLDS');
    expect(text.indexOf('PARITY HOLDS')).toBeLessThan(text.indexOf('exit    '));
  });

```

- [ ] **Step 6: Run them to see them fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/report.test.ts 2>&1 | grep -E "×|AssertionError|Test Files|Tests "
```

Expected: the two new tests fail (`AssertionError: expected 0 to be 1`, and `expected '...' to contain 'parity against sportbet 1ac955f, backup backup'`); the other four pass.

- [ ] **Step 7: The load report carries the parity report**

In `tools/migrate/src/report.ts`, replace:

```ts
import type { Recalculation } from './load';
import type { TableCount } from './map';
```

with:

```ts
import type { Recalculation } from './load';
import type { TableCount } from './map';
import { renderParity, type ParityReport } from './parity/report';
```

Replace:

```ts
 * The load report: counts, the sportbet ids of rows no player owns, and the
 * dump's name, size and hash. Never a username, name, email or player id.
```

with:

```ts
 * The load report: counts, the sportbet ids of rows no player owns, and the
 * dump's name, size and hash. Never a name, an email or a player id; a
 * username only in the parity report, which the owner reads on this PC
 * (spec 2.3, usernames on screen).
```

Replace:

```ts
  readonly recalculations: readonly Recalculation[];
  readonly cleanup: readonly string[];
```

with:

```ts
  readonly recalculations: readonly Recalculation[];
  /** The parity report (`--parity`); null without it. */
  readonly parity: ParityReport | null;
  readonly cleanup: readonly string[];
```

Replace:

```ts
  recalculations: [],
  cleanup: [],
```

with:

```ts
  recalculations: [],
  parity: null,
  cleanup: [],
```

Replace:

```ts
/** The exit status a finished run's report earns. */
export function exitStatusOf(report: Report): 0 | 1 | 2 {
  if (report.problem !== null) return 2;
  const refused =
    report.tables.some((table) => table.refusals.length > 0) ||
    report.recalculations.some(({ refusal }) => refusal !== null);
  return refused ? 1 : 0;
}
```

with:

```ts
/**
 * The exit status a finished run's report earns: 1 when a row was refused,
 * a recalculation was refused, or - with `--parity` - a row is
 * new-code-wrong or could not be compared.
 */
export function exitStatusOf(report: Report): 0 | 1 | 2 {
  if (report.problem !== null) return 2;
  const refused =
    report.tables.some((table) => table.refusals.length > 0) ||
    report.recalculations.some(({ refusal }) => refusal !== null);
  const parityFails =
    report.parity !== null &&
    (report.parity.newCodeWrong > 0 || report.parity.refused > 0);
  return refused || parityFails ? 1 : 0;
}
```

Replace:

```ts
  if (report.problem !== null)
    lines.push(`could not complete: ${report.problem}`);
```

with:

```ts
  if (report.parity !== null)
    lines.push('', ...renderParity(report.parity), '');
  if (report.problem !== null)
    lines.push(`could not complete: ${report.problem}`);
```

- [ ] **Step 8: Run them to see them pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run src/report.test.ts src/parity 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  5 passed (5)`, `Tests  42 passed (42)` (report 6, compare 17, rulings 8, rankings 5, parity report 6).

- [ ] **Step 9: Check and commit (lead)**

```bash
pnpm format && pnpm lint && pnpm --filter @sportbet/migrate typecheck
git add tools/migrate/src/parity/report.ts tools/migrate/src/parity/report.test.ts tools/migrate/src/report.ts tools/migrate/src/report.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): the parity report and its verdict (#11)

Counts per class, every new-code-wrong row by username with all three
values, stale rows per column, the rulings, the rankings and what it
cannot check, then PARITY HOLDS or PARITY FAILS. Usernames on the
owner's PC only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8 (qa): The parity stage end to end, on the synthetic dump - failing first

The old app needs one table the reader never reads; the tests pin the sportbet commit whose golden rows the dump holds; and one end-to-end file runs the whole reader with `--parity` twice - on the synthetic dump (`PARITY HOLDS`) and on a copy with one planted stale row (exactly one `stale`) - then checks the cleanup and the privacy. Needs `sportbet-app:1ac955f` on this PC (Task 0, Step 4).

**Files:**
- Modify: `tools/migrate/test/fixtures/create-tables.ts`, `tools/migrate/test/fixtures/sportbet-dump.ts`, `tools/migrate/test/support/reader-containers.ts`
- Create: `tools/migrate/test/reader-parity.test.ts`

- [ ] **Step 1: The table the old app reads**

In `tools/migrate/test/fixtures/create-tables.ts`, replace:

```ts
  point_survivals: [
    'CREATE TABLE `point_survivals` (',
```

with:

```ts
  points_calculations: [
    'CREATE TABLE `points_calculations` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `home_score_difference` smallint NOT NULL,',
    '  `away_score_difference` smallint NOT NULL,',
    '  `points` smallint NOT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  point_survivals: [
    'CREATE TABLE `point_survivals` (',
```

and in its header comment replace:

```ts
// every table the reader reads, and audit_logins - which it never reads, so
// the synthetic dump can prove its IP address never leaves MySQL.
```

with:

```ts
// every table the reader reads; audit_logins, which it never reads, so the
// synthetic dump can prove its IP address never leaves MySQL; and
// points_calculations, which only sportbet's own recalculation reads (the
// parity checker's oracle b): a missing lookup scores 0, so it holds no rows.
```

In `tools/migrate/test/fixtures/sportbet-dump.ts`, in `syntheticDump()`, replace:

```ts
    audit_logins: [
```

with:

```ts
    points_calculations: [],
    audit_logins: [
```

- [ ] **Step 2: The commit the tests pin**

Append to `tools/migrate/test/support/reader-containers.ts`:

```ts

/**
 * The sportbet commit whose image the parity tests run: 1ac955f, where
 * golden-points.json - which the synthetic dump's production rows are -
 * was made. The image must be on this PC (README: building it). CI builds
 * it at the same commit (.github/workflows/ci.yml): change both together.
 */
export const SPORTBET_TEST_TAG = '1ac955f';
```

- [ ] **Step 3: Write the end-to-end test**

Create `tools/migrate/test/reader-parity.test.ts`:

```ts
// The parity stage, end to end, on the synthetic dump - never production
// data - with sportbet's own app from its image at SPORTBET_TEST_TAG, on
// the reader's own MySQL, Postgres and private network.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderReport } from '../src/report';
import { runReader, type ReaderResult } from '../src/run';
import {
  IDS,
  renderDump,
  SENTINELS,
  syntheticDump,
  type Dump,
} from './fixtures/sportbet-dump';
import { SPORTBET_TEST_TAG } from './support/reader-containers';

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true });

/** Runs the reader with --parity on `dump`; its result and everything it printed. */
async function parityRun(
  dump: Dump,
): Promise<{ result: ReaderResult; output: string }> {
  let output = '';
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  try {
    const result = await runReader({
      fetcher: {
        fetch: (directory) => {
          const path = join(directory, 'backup.sql.gz');
          writeFileSync(path, gzipSync(renderDump(dump)));
          return Promise.resolve({ objectName: OBJECT, path });
        },
      },
      keep: false,
      now: () => new Date('2026-09-29T12:00:00Z'),
      parity: { tag: SPORTBET_TEST_TAG },
    });
    process.stdout.write(renderReport(result.report));
    process.stdout.write(JSON.stringify(result.report));
    return { result, output };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

/** The dump with cai's serija on EL h2 lost from production: one stale row. */
function withStaleRow(): Dump {
  const dump = syntheticDump();
  return {
    ...dump,
    point_results: dump.point_results.map((row) =>
      row['user_id'] === IDS.player('cai') && row['game_id'] === IDS.game(2)
        ? { ...row, streak_bonus: '0.00' }
        : row,
    ),
  };
}

describe('the parity stage, end to end on the synthetic dump', () => {
  let golden: { result: ReaderResult; output: string };
  let stale: { result: ReaderResult; output: string };

  beforeAll(async () => {
    golden = await parityRun(syntheticDump());
    stale = await parityRun(withStaleRow());
  });

  it("holds: production's rows are what sportbet's own recalculation writes, and the new code writes the same", () => {
    const { parity, problem } = golden.result.report;
    expect(problem).toBeNull();
    expect(parity?.tag).toBe(SPORTBET_TEST_TAG);
    expect(
      parity?.tournaments.map(({ tournament, counts }) => ({
        tournament,
        counts,
      })),
    ).toEqual([
      {
        tournament: 'golden-el',
        counts: {
          point_results: {
            match: 9,
            stale: 0,
            'new-code-wrong': 0,
            refused: 1,
          },
          point_standings: {
            match: 8,
            stale: 0,
            'new-code-wrong': 0,
            refused: 0,
          },
          point_survivals: {
            match: 5,
            stale: 0,
            'new-code-wrong': 0,
            refused: 0,
          },
          game_odds: { match: 3, stale: 0, 'new-code-wrong': 0, refused: 0 },
        },
      },
    ]);
    expect(golden.output).toContain('PARITY HOLDS');
    expect(golden.result.report.exitStatus).toBe(1);
  });

  it('ranks the golden league as sportbet does', () => {
    expect(golden.result.report.parity?.tournaments[0]?.rankings).toEqual([
      { league: 2, players: 3, differences: [] },
    ]);
  });

  it('finds exactly one stale row where production lost a serija', () => {
    const tournament = stale.result.report.parity?.tournaments[0];
    expect(tournament?.counts.point_results).toEqual({
      match: 8,
      stale: 1,
      'new-code-wrong': 0,
      refused: 1,
    });
    expect(tournament?.stale.point_results).toEqual({ streak_bonus: 1 });
    expect(stale.output).toContain('PARITY HOLDS');
  });

  it("leaves no container and no network behind, the old app's included", () => {
    expect(docker('ps', '-a', '-q', '--filter', 'label=sportbet-migrate')).toBe(
      '',
    );
    expect(
      docker('network', 'ls', '-q', '--filter', 'label=sportbet-migrate'),
    ).toBe('');
  });

  it("refuses to start without the old app's image on this PC, before anything is fetched", async () => {
    const fetch = vi.fn();
    const result = await runReader({
      fetcher: { fetch },
      keep: false,
      now: () => new Date('2026-09-29T12:00:00Z'),
      parity: { tag: 'fffffff' },
    });
    expect(result.report.problem).toBe(
      "preflight: the old app's image sportbet-app:fffffff is not on this PC; build it first (README, parity)",
    );
    expect(result.report.exitStatus).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prints no sentinel name, surname, email or IP address', () => {
    for (const { output } of [golden, stale]) {
      expect(SENTINELS.filter((sentinel) => output.includes(sentinel))).toEqual(
        [],
      );
      expect(output).not.toContain('@');
    }
  });
});
```

- [ ] **Step 4: Run it to see it fail**

```bash
pnpm --filter @sportbet/migrate exec vitest run test/reader-parity.test.ts 2>&1 | grep -E "×|AssertionError|Test Files|Tests "
```

Expected: `Tests  4 failed | 2 passed (6)`: the reader has no parity stage yet (`AssertionError: expected undefined to be '1ac955f'`, `expected undefined to deeply equal [ { league: 2, players: 3, …(1) } ]`, `expected undefined to deeply equal { match: 8, stale: 1, …(2) }`, and the image check is missing); the cleanup and the privacy tests pass. (`pnpm typecheck` fails on `parity` in `ReaderOptions` until Task 9; Vitest strips types and runs.)

- [ ] **Step 5: The other reader tests are unchanged**

```bash
pnpm --filter @sportbet/migrate exec vitest run test/reader.test.ts test/reader-failures.test.ts test/map.test.ts test/load.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: every test passes, with the counts Task 2 left (the new table changes no count the reader reports: it is not a table the reader reads).

- [ ] **Step 6: Hand over.** Do not commit yet: the lead commits this task with Task 9, whose code makes it pass, so `main` never holds a failing test.

---

### Task 9 (backend-dev): The parity stage in the reader, and the command's flags

**Files:**
- Create: `tools/migrate/src/parity/stage.ts`
- Modify: `tools/migrate/src/run.ts`, `tools/migrate/src/problem.ts`, `tools/migrate/src/bin/migrate.ts`

- [ ] **Step 1: The stage**

Create `tools/migrate/src/parity/stage.ts`:

```ts
import {
  loadInputsUnderRuleSet,
  loadTournamentPoints,
  type Db,
} from '@sportbet/db';
import type { Recalculation } from '../load';
import type { Mapped, RefusedPoints } from '../map';
import { ReaderProblem } from '../problem';
import { compareTournament } from './compare';
import { compareRankings, type OldAppRank } from './rankings';
import {
  describeTournament,
  namesOf,
  notCompared,
  parityReport,
  type ParityReport,
} from './report';
import { rulingsImpact } from './rulings';

export interface ParityInput {
  readonly tag: string;
  readonly backup: string;
  /** Production's copy as the reader mapped and loaded it: oracle (a). */
  readonly mapped: Mapped;
  /** The same copy after sportbet's own recalculation, mapped alike: oracle (b). */
  readonly oldApp: Mapped;
  /** sportbet's own rankings of every league (sportbet-app.ts). */
  readonly ranks: readonly OldAppRank[];
  /** The reader's recalculations: a tournament refused under sportbet is not compared. */
  readonly recalculations: readonly Recalculation[];
}

const merged = (a: RefusedPoints, b: RefusedPoints): RefusedPoints => ({
  matches: [...a.matches, ...b.matches],
  standings: [...a.standings, ...b.standings],
  survival: [...a.survival, ...b.survival],
  odds: [...a.odds, ...b.odds],
});

/**
 * The parity stage (spec 1, 3, 4): per loaded tournament, the new code's
 * stored sportbet rows against both oracles, the rulings one at a time, and
 * every league's ranking against sportbet's own. Reads the loaded Postgres
 * only; writes nothing.
 */
export async function checkParity(
  db: Db,
  input: ParityInput,
): Promise<ParityReport> {
  const usernames = new Map(
    input.mapped.players.map(({ id, username }) => [id, username]),
  );
  const tournaments = [];
  for (const each of input.mapped.tournaments) {
    const { tournament } = each;
    const refusal = input.recalculations.find(
      (done) => done.tournament === tournament.id && done.rules === 'sportbet',
    )?.refusal;
    if (refusal !== undefined && refusal !== null) {
      tournaments.push(
        notCompared(
          tournament.slug,
          `the sportbet recalculation was refused (${refusal})`,
        ),
      );
      continue;
    }
    const old = input.oldApp.tournaments.find(
      (other) => other.tournament.id === tournament.id,
    );
    if (old === undefined) {
      throw new ReaderProblem(
        `tournament ${String(tournament.id)} is missing from sportbet's recalculated copy`,
      );
    }
    const scored = new Set(
      each.games.filter(({ result }) => result !== null).map(({ id }) => id),
    );
    const tables = compareTournament({
      production: each.production,
      oldApp: old.production,
      newCode: await loadTournamentPoints(db, tournament, 'sportbet'),
      refused: merged(each.refusedPoints, old.refusedPoints),
      scored,
    });
    const rulings = await rulingsImpact(
      (rules) => loadInputsUnderRuleSet(db, tournament, rules),
      scored,
    );
    tournaments.push(
      describeTournament({
        tournament: tournament.slug,
        tables,
        rulings,
        rankings: rulings.ok
          ? compareRankings({
              leagues: each.leagues,
              totals: rulings.value.base.totals,
              players: each.players,
              usernames,
              oldApp: input.ranks,
            })
          : [],
        names: namesOf(each, usernames),
      }),
    );
  }
  return parityReport(input.tag, input.backup, tournaments);
}
```

- [ ] **Step 2: Its stages**

In `tools/migrate/src/problem.ts`, replace:

```ts
  | 'read'
  | 'map'
```

with:

```ts
  | 'read'
  | 'old-app'
  | 'read-old-app'
  | 'map'
```

Replace:

```ts
  | 'recalculate'
  | 'cleanup';
```

with:

```ts
  | 'recalculate'
  | 'parity'
  | 'cleanup';
```

Replace:

```ts
  read: 'reading the restored MySQL',
```

with:

```ts
  read: 'reading the restored MySQL',
  'old-app': "running sportbet's own recalculation",
  'read-old-app': "reading sportbet's recalculated rows",
```

Replace:

```ts
  recalculate: 'recalculating',
```

with:

```ts
  recalculate: 'recalculating',
  parity: 'checking parity',
```

- [ ] **Step 3: The run**

In `tools/migrate/src/run.ts`, make these replacements in order.

Replace:

```ts
import { getContainerRuntimeClient } from 'testcontainers';
import {
  isAlive,
  isGone,
  labelledContainers,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeAbandonedContainers,
  removeRunContainers,
  restoreDump,
  startMySql,
  startPostgres,
} from './containers';
```

with:

```ts
import {
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
import {
  imageExists,
  isAlive,
  isGone,
  labelledContainers,
  labelledNetworks,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeAbandonedContainers,
  removeAbandonedNetworks,
  removeRunContainers,
  removeRunNetworks,
  restoreDump,
  SPORTBET_APP_IMAGE,
  startMySql,
  startPostgres,
} from './containers';
```

Replace:

```ts
import { mapSportbet } from './map';
```

with:

```ts
import { mapSportbet, type Mapped } from './map';
import type { OldAppRank } from './parity/rankings';
import { checkParity } from './parity/stage';
```

Replace:

```ts
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';
```

with:

```ts
import { runSportbetApp } from './sportbet-app';
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';
```

Replace:

```ts
  readonly keep: boolean;
  readonly now: () => Date;
}
```

with:

```ts
  readonly keep: boolean;
  readonly now: () => Date;
  /**
   * `--parity --sportbet-tag <tag>`: compare the points with sportbet's
   * own recalculation of the copy, by its image at `tag` (spec 2.3).
   */
  readonly parity?: { readonly tag: string };
}
```

Replace:

```ts
  postgres: StartedPostgreSqlContainer | null = null;
  readonly #interrupt = new AbortController();
```

with:

```ts
  postgres: StartedPostgreSqlContainer | null = null;
  /** The old app's container and the private network it shares with the MySQL (--parity). */
  sportbetApp: StartedTestContainer | null = null;
  network: string | null = null;
  readonly #interrupt = new AbortController();
```

Replace:

```ts
      } catch (error) {
        errors.push(`removing the run's containers failed (${codeOf(error)})`);
      }
```

with:

```ts
      } catch (error) {
        errors.push(`removing the run's containers failed (${codeOf(error)})`);
      }
      try {
        await removeRunNetworks(this.id);
      } catch (error) {
        errors.push(`removing the run's network failed (${codeOf(error)})`);
      }
```

Replace:

```ts
    const { dump, workspace, mysql, postgres } = this;
```

with:

```ts
    const { dump, workspace, mysql, postgres, sportbetApp, network } = this;
```

Replace:

```ts
    if (mysql !== null) {
      await step('removing the MySQL container', () =>
        mysql.stop({ remove: true, removeVolumes: true }),
      );
      this.mysql = null;
    }
```

with:

```ts
    if (sportbetApp !== null) {
      await step("removing the old app's container", () =>
        sportbetApp.stop({ remove: true, removeVolumes: true }),
      );
      this.sportbetApp = null;
    }
    if (mysql !== null) {
      await step('removing the MySQL container', () =>
        mysql.stop({ remove: true, removeVolumes: true }),
      );
      this.mysql = null;
    }
    if (network !== null) {
      // Once nothing is on it: Docker refuses to remove a network in use.
      await step('removing the private network', () =>
        removeRunNetworks(this.id),
      );
      this.network = null;
    }
```

Replace:

```ts
  const containers = await removeAbandonedContainers();
  return [
    `preflight removed ${String(directories.length)} leftover temporary directories and ${String(containers)} leftover containers`,
  ];
```

with:

```ts
  const containers = await removeAbandonedContainers();
  const networks = await removeAbandonedNetworks();
  return [
    `preflight removed ${String(directories.length)} leftover temporary directories and ${String(containers)} leftover containers`,
    ...(networks === 0
      ? []
      : [`preflight removed ${String(networks)} leftover networks`]),
  ];
```

Replace:

```ts
    cleanup.push(...(await removeLeftovers()));
    resources.checkpoint();
```

with:

```ts
    cleanup.push(...(await removeLeftovers()));
    if (options.parity !== undefined) {
      const image = `${SPORTBET_APP_IMAGE}:${options.parity.tag}`;
      if (!(await imageExists(image))) {
        throw new ReaderProblem(
          `the old app's image ${image} is not on this PC; build it first (README, parity)`,
        );
      }
    }
    resources.checkpoint();
```

Replace:

```ts
    let read: Awaited<ReturnType<typeof readSportbet>>;
    try {
```

with:

```ts
    let read: Awaited<ReturnType<typeof readSportbet>>;
    let oldApp: {
      readonly rows: Awaited<ReturnType<typeof readSportbet>>['rows'];
      readonly ranks: readonly OldAppRank[];
    } | null = null;
    try {
```

Replace:

```ts
      stage = 'read';
      read = await readSportbet(connection);
    } finally {
      await connection.end();
    }
    await resources.mysql.stop({ remove: true, removeVolumes: true });
    resources.mysql = null;
    resources.checkpoint();
```

with:

```ts
      stage = 'read';
      read = await readSportbet(connection);
      if (options.parity !== undefined) {
        resources.checkpoint();
        stage = 'old-app';
        const ranks = await runSportbetApp(
          resources,
          options.parity.tag,
          resources.mysql,
        );
        resources.checkpoint();
        stage = 'read-old-app';
        oldApp = { rows: (await readSportbet(connection)).rows, ranks };
      }
    } finally {
      await connection.end();
    }
    await resources.mysql.stop({ remove: true, removeVolumes: true });
    resources.mysql = null;
    if (resources.network !== null) {
      await removeRunNetworks(resources.id);
      resources.network = null;
    }
    resources.checkpoint();
```

Replace:

```ts
    const mapped = mapSportbet(read.rows);
```

with:

```ts
    const mapped = mapSportbet(read.rows);
    const oldAppMapped: Mapped | null =
      oldApp === null ? null : mapSportbet(oldApp.rows);
```

Replace:

```ts
      report = {
        ...report,
        recalculations,
        points: await pointsRowCounts(db, tournaments),
      };
```

with:

```ts
      report = {
        ...report,
        recalculations,
        points: await pointsRowCounts(db, tournaments),
      };
      if (
        options.parity !== undefined &&
        oldApp !== null &&
        oldAppMapped !== null
      ) {
        resources.checkpoint();
        stage = 'parity';
        report = {
          ...report,
          parity: await checkParity(db, {
            tag: options.parity.tag,
            backup: fetched.objectName,
            mapped,
            oldApp: oldAppMapped,
            ranks: oldApp.ranks,
            recalculations,
          }),
        };
      }
```

Replace:

```ts
    let left = await leftOf();
    if (left.length > 0) {
```

with:

```ts
    let left = await leftOf();
    const networksLeft = await labelledNetworks(resources.id);
    if (networksLeft.length > 0) {
      await removeRunNetworks(resources.id);
      cleanup.push(
        `${String(networksLeft.length)} labelled network(s) were left after the release and are removed`,
      );
      if ((await labelledNetworks(resources.id)).length > 0) {
        problems.push('a labelled network remains after the run');
      }
    }
    if (left.length > 0) {
```

Replace:

```ts
        : 'the dump, its temporary directory and both containers are deleted',
    );
  } else {
```

with:

```ts
        : 'the dump, its temporary directory and both containers are deleted',
    );
    if (options.parity !== undefined) {
      cleanup.push(
        "the old app's container and the private network are deleted",
      );
    }
  } else {
```

- [ ] **Step 4: The command's flags**

In `tools/migrate/src/bin/migrate.ts`, replace:

```ts
//   node tools/migrate/dist/migrate.mjs [--keep] [--json]
```

with:

```ts
//   node tools/migrate/dist/migrate.mjs [--keep] [--json] [--parity --sportbet-tag <commit>]
```

Replace:

```ts
import { runReader, RunResources } from '../run';
```

with:

```ts
import { runReader, RunResources } from '../run';
import { parityOptionOf } from '../sportbet-app';
```

Replace:

```ts
    json: { type: 'boolean', default: false },
  },
```

with:

```ts
    json: { type: 'boolean', default: false },
    parity: { type: 'boolean', default: false },
    'sportbet-tag': { type: 'string' },
  },
```

Replace:

```ts
const cli = (await findOciCli()) ?? (await noOciCli());
```

with:

```ts
async function usage(message: string): Promise<never> {
  await write(process.stderr, `reader: ${message}\n`);
  return exit(2);
}
const option = parityOptionOf(values.parity, values['sportbet-tag']);
const parity = option.ok ? option.value : await usage(option.refusal);

const cli = (await findOciCli()) ?? (await noOciCli());
```

Replace:

```ts
  { fetcher: ociFetcher(cli), keep: values.keep, now: () => new Date() },
```

with:

```ts
  {
    fetcher: ociFetcher(cli),
    keep: values.keep,
    now: () => new Date(),
    ...(parity === null ? {} : { parity }),
  },
```

- [ ] **Step 5: Run the end-to-end test to see it pass**

```bash
pnpm --filter @sportbet/migrate exec vitest run test/reader-parity.test.ts 2>&1 | grep -E "×|Test Files|Tests "
```

Expected: `Test Files  1 passed (1)`, `Tests  6 passed (6)` (about 35 seconds: two runs of the whole reader, each with the old app).

- [ ] **Step 6: The whole reader suite, and the command**

```bash
pnpm format && pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm test:migrate 2>&1 | grep -E "×|Test Files|Tests "
pnpm --filter @sportbet/migrate build >/dev/null && node tools/migrate/dist/migrate.mjs --parity; echo "exit $?"
node tools/migrate/dist/migrate.mjs --sportbet-tag 1ac955f; echo "exit $?"
docker ps -a -q --filter label=sportbet-migrate | wc -l
docker network ls -q --filter label=sportbet-migrate | wc -l
```

Expected: lint silent, `4` typechecked; the migrate suite passes with 6 test files and 55 tests more than at the gate (map +5, compare 17, rulings 8, rankings 5, sportbet-app 6, parity report 6, report +2, end to end 6); `reader: --parity needs --sportbet-tag <commit>` then `exit 2`; `reader: --sportbet-tag needs --parity` then `exit 2`; `0`; `0`. (Neither command fetches anything: the flags are checked before the OCI CLI is looked for.)

- [ ] **Step 7: Commit Tasks 8 and 9 (lead)**

```bash
git add tools/migrate/src/parity/stage.ts tools/migrate/src/run.ts tools/migrate/src/problem.ts tools/migrate/src/bin/migrate.ts tools/migrate/test/fixtures/create-tables.ts tools/migrate/test/fixtures/sportbet-dump.ts tools/migrate/test/support/reader-containers.ts tools/migrate/test/reader-parity.test.ts
git commit -m "$(cat <<'EOF'
feat(migrate): the parity stage and --parity --sportbet-tag (#11)

The old app recalculates the restored copy before the MySQL is removed,
the copy is read again through READ_COLUMNS and the map, and after the
recalculations every points row is classed against both oracles, the
rulings measured and the rankings compared. End to end on the synthetic
dump with sportbet's image at 1ac955f: PARITY HOLDS, one planted stale
row found, nothing left behind, nothing personal printed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10 (devops): CI builds sportbet's image before the reader's tests

`pnpm test:migrate` now needs `sportbet-app:1ac955f`. No registry holds it (design decision 1), so the `check` job checks sportbet out at that commit with a read-only token and builds it, exactly as Task 0 did on this PC. Needs the secret of Task 11 before the first push that includes it (Task 13).

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: The job builds the image**

In `.github/workflows/ci.yml`, in the `check` job, replace:

```yaml
    runs-on: ubuntu-latest
    timeout-minutes: 30
    concurrency:
      # A superseded push's check only tests stale code, so cancel it.
```

with:

```yaml
    runs-on: ubuntu-latest
    # The build of sportbet's image for the parity tests adds a few minutes.
    timeout-minutes: 45
    concurrency:
      # A superseded push's check only tests stale code, so cancel it.
```

and replace:

```yaml
      # The production-copy reader, on a synthetic dump only: CI has no OCI
      # credentials and never reaches Oracle.
      - run: pnpm test:migrate
```

with:

```yaml
      # The parity tests run sportbet's own app (tools/migrate/README.md,
      # "Parity"): its image at the commit the synthetic dump's golden rows
      # were made at. No registry holds it, so it is built here from
      # sportbet's private repository with a read-only token, and never
      # pushed. Keep the SHA in step with SPORTBET_TEST_TAG
      # (tools/migrate/test/support/reader-containers.ts).
      - name: Check out sportbet at the parity tests' commit
        uses: actions/checkout@v7
        with:
          repository: tomyka/sportbet
          ref: 1ac955f5919323ef5b8e0369274da20ddfb9ea75
          token: ${{ secrets.SPORTBET_READ_TOKEN }}
          path: .sportbet
          persist-credentials: false
      - name: Build sportbet's app image
        run: |
          docker build -q -f .sportbet/docker/staging/Dockerfile --target app \
            -t sportbet-app:1ac955f .sportbet
          rm -rf .sportbet
      # The production-copy reader, on a synthetic dump only: CI has no OCI
      # credentials and never reaches Oracle.
      - run: pnpm test:migrate
```

- [ ] **Step 2: Check the file**

```bash
node -e "require(require('path').resolve('node_modules/.pnpm/yaml@2.9.1/node_modules/yaml')).parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('yaml ok')"
grep -n "SPORTBET_READ_TOKEN\|sportbet-app:1ac955f\|timeout-minutes: 45" .github/workflows/ci.yml
pnpm format:check 2>&1 | tail -1
```

Expected: `yaml ok`; the three lines; `All matched files use Prettier code style!`. (The workflow itself runs in Task 13, once the secret exists.)

- [ ] **Step 3: Commit (lead)**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: build sportbet's app image for the parity tests (#11)

Checked out at 1ac955f with a read-only token and built with sportbet's
own Dockerfile and target; never pulled, never pushed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11 (the owner, one step): a read-only token for sportbet's repository

Outward-facing, so the owner does it; the lead sends it as one instruction and waits for the answer before Task 13's push. Nothing else in this plan needs a cloud or GitHub change.

- [ ] **Step 1: The instruction the lead sends**

> Please create a fine-grained token that can only read sportbet's code, and save it as a secret of sportbet_new: open https://github.com/settings/personal-access-tokens/new, name it `sportbet_new CI reads sportbet`, choose an expiry (a year is fine; CI's parity tests stop working when it expires), set Resource owner `tomyka`, Repository access "Only select repositories" -> `tomyka/sportbet`, and under Repository permissions set Contents to "Read-only" (nothing else). Generate it, copy it, then type `! gh secret set SPORTBET_READ_TOKEN --repo tomyka/sportbet_new` here and paste the token when it asks. Tell me when it says the secret is set.

- [ ] **Step 2: Confirm it exists** (the lead):

```bash
gh secret list --repo tomyka/sportbet_new | grep -c SPORTBET_READ_TOKEN
```

Expected: `1`.

---

### Task 12 (lead): Record the rules

**Files:**
- Modify: `CLAUDE.md`, `docs/decisions.md`, `docs/phase-2-inventory.md`, `tools/migrate/README.md`

- [ ] **Step 1: CLAUDE.md - the one recalculation operation, the source through the rule set, the old app**

In `CLAUDE.md`, replace:

```markdown
  `recalculateTournament` (`packages/domain/src/recalculation/`), one call
  per tournament and rule set; the per-area scorers behind it are internal.
```

with:

```markdown
  `recalculateTournament` (`packages/domain/src/recalculation/`), one call
  per tournament and rule set; the per-area scorers behind it are internal.
  The database saves derived rows only through `recalculateUnderRuleSet`
  (`packages/db/src/recalculation/`): it reads what the rule set reads,
  calls `recalculateTournament` once and saves under the rule set's name.
```

Replace:

```markdown
  or `ruled` - named by the caller of every repository function, never
  defaulted, so a parity run can never overwrite or be read as the live
```

with:

```markdown
  or `ruled` - named by the caller of every repository function (for
  derived rows, through the rule set it passes to `recalculateUnderRuleSet`,
  whose name is the source), never
  defaulted, so a parity run can never overwrite or be read as the live
```

Replace:

```markdown
  URL option - and deletes the dump and both containers after every run. Its
  tests use only the synthetic dump built from the golden scenario; nothing
  of production goes to Vercel, Neon, GitHub, commits or logs.
```

with:

```markdown
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
```

- [ ] **Step 2: docs/decisions.md - what the parity spec settled**

Append to `docs/decisions.md`:

```markdown

## Settled in the parity-checker spec

Recorded in `docs/superpowers/specs/2026-09-30-parity-checker-design.md`
(issue #11), where each choice carries its reason:

- **Two oracles:** production's rows as dumped, and the same copy after
  sportbet's own full recalculation, run by the checker in sportbet's image
  (built on the owner's PC from the commit production runs; no registry
  holds it).
- **The pass bar:** zero rows `new-code-wrong` - the new code under
  `sportbetRules` equals sportbet's own recalculation on every row. Rows
  only production has wrong are `stale`, counted, and cleared by
  recalculating production before switch-over.
- **One recalculation operation:** `recalculateUnderRuleSet` in
  `packages/db`, used by the reader, the golden db test and (slice 7) the
  web's result entry.
```

- [ ] **Step 3: docs/phase-2-inventory.md section 6 - the owner's choices**

In `docs/phase-2-inventory.md`, replace:

```markdown
current PHP code. The checker should therefore support comparing against (a) the production copy as dumped and (b) the same copy after the
old app's two recalculation passes run on it (an owner-run step in the old repo's Docker stack against a scratch database). A row that
differs in (a) but matches in (b) is stale production data, not a new-code bug.
```

with:

```markdown
current PHP code. The checker therefore compares against (a) the production copy as dumped and (b) the same copy after the old app's two
recalculation passes run on it. A row that differs in (a) but matches in (b) is stale production data, not a new-code bug.

**The owner's choices (2026-09-30, `docs/superpowers/specs/2026-09-30-parity-checker-design.md`):** both oracles, and (b) is run by the
checker itself, in sportbet's image at the commit production runs, on the throwaway copy - no manual step. Parity holds when no row is
`new-code-wrong` (the new code under `sportbetRules` against (b)); `stale` rows are counted, and production is recalculated before
switch-over so they go. The report may name players by username on the owner's PC; an issue gets only the verdict and the counts per class.
```

- [ ] **Step 4: tools/migrate/README.md - --parity, the image, production's commit**

In `tools/migrate/README.md`, replace:

```markdown
Loads a copy of sportbet's production data into a throwaway local Postgres,
recalculates it under both rule sets, and prints a load report (spec:
`docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`, 2.2).
```

with:

```markdown
Loads a copy of sportbet's production data into a throwaway local Postgres,
recalculates it under both rule sets, and prints a load report (spec:
`docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`, 2.2).
With `--parity` it also checks the new code's points against sportbet's own
(spec: `docs/superpowers/specs/2026-09-30-parity-checker-design.md`, 2.3; see
"Parity" below).
```

Replace:

```markdown
node tools/migrate/dist/migrate.mjs [--keep] [--json]
```

with:

```markdown
node tools/migrate/dist/migrate.mjs [--keep] [--json] [--parity --sportbet-tag <commit>]
```

Replace:

```markdown
Exit status: 0 nothing refused, 1 something refused, 2 the run could not
```

with:

```markdown
Exit status: 0 nothing refused (and, with `--parity`, no row new-code-wrong
or refused), 1 something refused (or, with `--parity`, a row new-code-wrong
or refused), 2 the run could not
```

Append to the file:

````markdown

## Parity (`--parity`)

```sh
node tools/migrate/dist/migrate.mjs --parity --sportbet-tag <commit>
```

runs the reader as above and adds a parity stage. Right after it has read
production's rows from the restored MySQL (oracle a), it starts sportbet's
own app from `sportbet-app:<commit>` beside that MySQL, runs
sportbet's full recalculation (`Recalculation::all()`), its standings
recalculation (`updateStandingPoints()`) and every league's leaderboard, and
reads the same copy again (oracle b) through the same `READ_COLUMNS` and
map - into memory only. After loading and recalculating as usual, it
classes every `point_results`, `point_standings`, `point_survivals` and
`game_odds` row:

| Class | New code (`sportbet`) against production | New code against sportbet's recalculation |
|---|---|---|
| `match` | equal | equal |
| `stale` | differs | equal |
| `new-code-wrong` | any | differs |
| `refused` | the reader refused the row, what it is scored from, or its game's odds | |

The report, after the load report (and in `--json`), gives the tag and the
backup, the counts per table and class, every `new-code-wrong` row by
username and game, team or round with all three values, `stale` rows
counted per column, each owner ruling's effect measured one `RuleSet` field
at a time, every league's ranking against sportbet's own, what it cannot
check, and the verdict: `PARITY HOLDS` when no row is `new-code-wrong`, else
`PARITY FAILS: <n> rows new-code-wrong`.

**Post only the verdict and the counts per class** on an issue: the rest
names players.

### Building sportbet's image

The reader never pulls the image, and no registry holds it: sportbet's CI
ships it to the web host with `docker save`, for arm64 only. Build it on
this PC from sportbet's repository at the commit, with the Dockerfile and
target sportbet's CI builds production's image with (Git Bash; a few
minutes the first time):

```sh
git -C /d/Projects/sportbet fetch origin
git -C /d/Projects/sportbet archive <commit> | docker build -q -f docker/staging/Dockerfile --target app -t sportbet-app:<commit> -
```

The tests need `1ac955f` (`SPORTBET_TEST_TAG` in
`test/support/reader-containers.ts`); CI builds the same one.

### Finding the commit production runs

```sh
gh api "repos/tomyka/sportbet/deployments?environment=production&per_page=5" --jq '.[] | "\(.id) \(.sha[0:7]) \(.created_at)"'
gh api repos/tomyka/sportbet/deployments/<id>/statuses --jq '.[0].state'
```

The newest deployment whose latest status is `success` is what production
runs; its seven-character sha is the tag (sportbet tags its images with
`git rev-parse --short=7`). A run against another commit proves nothing.

### What the old app may do on this PC

| Guarantee | How it is kept | Tested by |
|---|---|---|
| **Only the throwaway copy.** | Its container joins only an internal Docker network the run makes - no route off this PC, no port published - beside the reader's MySQL; it has a throwaway `APP_KEY`, `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `LOG_CHANNEL=null`, `CACHE_STORE=array`, `SESSION_DRIVER=array`. Container and network carry the reader's labels and are removed on every path, interrupts included; the run fails if either is left. | `test/reader-parity.test.ts` (no container or network left) |
| **Nothing personal printed.** | It prints markers, ids, ranks and totals only; its output is parsed, never shown, and a failure is its exit code and the steps it finished. The parity report names a `new-code-wrong` row by the player's username - the owner's choice, on this PC only - and never a name, an email or an id. | `test/reader-parity.test.ts` (no sentinel or `@`), `src/sportbet-app.test.ts` |
````

- [ ] **Step 5: Check and commit (lead)**

```bash
pnpm format:check 2>&1 | tail -1
git add CLAUDE.md docs/decisions.md docs/phase-2-inventory.md tools/migrate/README.md
git commit -m "$(cat <<'EOF'
docs: the parity checker's records - one recalculation operation, the old app, usernames on screen (#11)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: `All matched files use Prettier code style!` (Prettier skips Markdown here), and the commit.

---

### Task 13 (lead): Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it** (only this migrate run on the PC: Conventions)

```bash
pnpm install --frozen-lockfile 2>&1 | tail -1
pnpm format:check 2>&1 | tail -1
pnpm lint && pnpm typecheck 2>&1 | grep -c "typecheck: Done"
pnpm build 2>&1 | grep -c "build: Done"
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
git status --short | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent, `4` packages typechecked, `3` built; unit, component and feature as at the gate; db 2 tests more than the gate; migrate 6 files and 55 tests more than the gate; `0` changed files.

- [ ] **Step 2: Review.** Run the `mp-code-review` skill against the gate's commit `..HEAD` (Standards and Spec, the spec being `docs/superpowers/specs/2026-09-30-parity-checker-design.md`) and fix what it confirms, each fix its own commit ending with the same trailer and `#11`, re-running Step 1 after the last. This is a new feature, so also run `improve-codebase-architecture` over `tools/migrate/src/parity/`, `tools/migrate/src/sportbet-app.ts`, `tools/migrate/src/run.ts` and `packages/db/src/recalculation/`, present its report to the owner, and act on no candidate unless the owner picks one.

- [ ] **Step 3: Push, and watch the run to the end** (only once Task 11 is confirmed)

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: the run succeeds: `check` (now building `sportbet-app:1ac955f` and running the parity tests on the synthetic dump), `image`, `e2e`, `staging` and `smoke`. If a job fails, read it with `gh run view "$run" --log-failed`, fix the cause, commit and push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #11.** Comment on #11 with: the green run's link; the test counts per suite; that the parity stage holds on the synthetic dump with sportbet's own recalculation at `1ac955f`, finds exactly one planted stale row, and leaves no container or network; and the design decisions at the top of this plan (above all: the image is built, not pulled). Tick each acceptance criterion of #11 that now holds, with its evidence. Leave #11 open: it closes after Task 14.

---

### Task 14 (by hand, the owner): run `--parity` on the latest backup

Not part of this plan's execution and not part of CI: only the owner runs it, on the owner's PC, as the reader's own README says. Nothing it reads leaves the PC.

- [ ] **Step 1: Before the run.** Docker Desktop is running; the OCI CLI answers for the `sportbet-db-backup` bucket (as for #9's run); and production's commit is found and its image built, as the README says ("Finding the commit production runs", "Building sportbet's image").

- [ ] **Step 2: Run it.** From the repository root:

```text
pnpm --filter @sportbet/migrate build
node tools/migrate/dist/migrate.mjs --parity --sportbet-tag <commit>
```

- [ ] **Step 3: Read the report.** The verdict is the last parity line. Exit 0: nothing refused and parity holds; 1: a row refused, or a row `new-code-wrong`; 2: the run could not complete (it says why). Every `new-code-wrong` row is listed with production's, the old app's and the new code's values.

- [ ] **Step 4: Check that nothing is left.**

```text
docker ps -a --filter label=sportbet-migrate
docker network ls --filter label=sportbet-migrate
dir %TEMP%\sportbet-migrate-*
git status
```

Expected: no container, no network, no directory, a clean working tree.

- [ ] **Step 5: Tell #11.** Post only the verdict line and the counts per class per table (no username, no row). Every `new-code-wrong` row, if any, becomes its own issue, described without a username. #11 closes when the owner has read the report.

---

## Open questions for the owner

1. **The token (Task 11)** is the only new outward-facing step: CI cannot build sportbet's image without reading sportbet's private repository. If you would rather not have a token, the alternative is to keep the parity end-to-end test out of CI and run it on your PC only - but then CI would no longer prove the acceptance criterion "`pnpm test:migrate` in CI proves the parity stage".

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| One command: `--parity --sportbet-tag <tag>`; the reader as today without `--parity` | 9 (flags, `parityOptionOf`), 6 |
| Two oracles: (a) production as dumped; (b) the copy after sportbet's full recalculation | 9 (read before, read after), 6 |
| Pass bar: zero `new-code-wrong`; `stale` counted | 3, 7 (verdict) |
| Usernames on the owner's PC only; nothing of the report to GitHub; issue gets verdict and counts | 7, 12 (README, CLAUDE.md), 13 Step 4, 14 Step 5 |
| Classes `match`, `stale`, `new-code-wrong`, `refused` per row key; exact comparison; missing/extra rows; null apart from 0; all three values listed; `game_odds` apart | 3 (keys, cells, classes), 2 (refused keys), 7 |
| What it cannot check, stated in the report | 7 (`CANNOT_CHECK`) |
| Oracle (b): `Recalculation::all()`, `updateStandingPoints()`, every league's ranking as JSON; read back through `READ_COLUMNS` and `sportbetColumns`; never stored | 6 (`OLD_APP_SCRIPT`, parsing), 9 (second `readSportbet` and `mapSportbet`, in memory) |
| The container's limits: private network, no internet, no host ports, `APP_ENV=parity`, throwaway `APP_KEY`, `MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`, `LOG_CHANNEL=null`; output parsed, never printed; the reader's label; removed on every path; the run fails if left | 6 (containers), 9 (cleanup, final check) |
| The tag required, printed; runbook for production's tag | 6 (`parityOptionOf`), 7 (report line), 12 (README) |
| Rulings impact: each field `recalculateTournament` reads, alone, in memory; rows, players, points; entry-only fields listed as such; the full ruled run as the total | 4 |
| League rankings: `rankPlayers` on the new code's totals against sportbet's, rank and total per player; against oracle (b) only | 5, 6 (sportbet's ranking), 2 (leagues) |
| Report contents and `--json`; exit 0 / 1 / 2 | 7, 9 |
| Structure: `sportbet-app.ts` (Docker only through `containers.ts`), `parity/compare.ts` pure, `parity/rulings.ts`, `parity/rankings.ts`, `parity/report.ts`, run.ts's stage | 3-9 (plus `parity/stage.ts`, decision 10) |
| One "recalculate under a rule set" operation in `packages/db`; the load and the golden db test use it; the source named through the rule set; CLAUDE.md amended | 1, 12 |
| Layering unchanged: migrate -> db -> domain | every task (lint) |
| Tests: compare with one planted difference per class and per edge case; one hundredth apart; rulings (R-14 reproduces #9's unscored places) and rankings on the golden scenario; end to end on the synthetic dump with the real image: PARITY HOLDS, one planted stale row, container gone, nothing personal | 3, 4, 5, 8 |
| CI runs them in `pnpm test:migrate`; the image's availability, and the owner step for a token | 10, 11 |
| Records: inventory section 6, the reader's README, CLAUDE.md | 12 |
| Done when: CI proves the stage; the owner has run it once with production's tag; the issue gets the verdict and counts; each `new-code-wrong` row its own issue | 13, 14 |

Where the plan departs from the spec's letter, the reason is in "Design decisions this plan makes": the image is built on the PC, not pulled (1); oracle (b) is taken before the MySQL goes, the comparison after the recalculation (2); a separate `parity/stage.ts` (10); and `refused` also covers rows whose prediction, standings row or game odds the reader refused (6).
