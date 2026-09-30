# Core Schema, Repositories and Production-Copy Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Postgres schema that holds everything `recalculateTournament` reads and writes plus production's own points, repositories that load and save whole domain objects through the domain's `stored` factories, and `tools/migrate`, a reader that restores sportbet's latest nightly backup into throwaway containers, maps every value through `sportbetColumns`, loads a throwaway Postgres, recalculates under both rule sets and prints a load report with no personal data.

**Architecture:** The domain gains whole-number range invariants (`defineRangeInvariant`) beside the text ones, so every single-column CHECK is still built from a domain invariant; the factories that already hold those rules read the same schemas. `packages/db` gains one area per aggregate (`season/`, `team/`, `player/`, `prediction/`, `standings/`, `survival/`, `points/`), each a `schema.ts` and a `repository.ts`; sportbet's ids are kept as primary keys and every points row carries a `points_source` (`production | sportbet | ruled`) in its key. The reader (`tools/migrate`) is a thin pipeline around one pure function, `mapSportbet`, which reconciles every sportbet table (read = loaded + skipped + refused); its only seam is the fetcher, and its end-to-end test runs on a synthetic dump built from sportbet's golden scenario.

**Tech Stack:** TypeScript 6.0 (strict), Zod 4, Drizzle ORM 0.45 on node-postgres, drizzle-kit 0.31, Vitest 5, Testcontainers 12.1 (`@testcontainers/postgresql`, `@testcontainers/mysql`), mysql2 3.24, esbuild 0.28, Docker (`postgres:18.6`, `mysql:26.7.0`).

**Spec:** `docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`. **Rules:** `docs/superpowers/specs/2026-09-29-euroleague-rules-catalogue.md` and `docs/owner-rulings.md`. **Issue:** #9 (part of #1).

---

## Conventions for every task

- Work on `main` (trunk-based, `CLAUDE.md`). Commit after each task; every commit message references `#9` and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push until Task 19.
- Shell snippets are Git Bash on Windows, run from the repository root `D:\Projects\sportbet_new`. The db and migrate suites need Docker running.
- Docker is used only through Testcontainers (the test suites and the reader start and remove their own `postgres:18.6` and `mysql:26.7.0` containers) and `docker exec` into them. Never start, stop or touch a `sportbet-staging-*` container, and never prune anything.
- **No production data, at any step.** No task downloads sportbet's backup. The reader's tests run on a synthetic dump the test builds from sportbet's golden scenario, with sentinel names and emails. Task 20 describes how the owner runs the real reader by hand; it is not part of this plan's execution and not part of CI.
- The domain imports only `zod` and its own files; its tests only `zod`, `vitest` and domain files. `packages/db` never imports web or the reader; `tools/migrate` imports only `@sportbet/db` (and its `migrations` entry), `@sportbet/domain`, `zod`, `mysql2`, the Testcontainers packages and Node built-ins. Lint enforces all of it. No `any`, no unchecked `as`, no `!`.
- Every verify step runs `pnpm format` first, so the code below is already formatted as Prettier leaves it; `pnpm format:check` must then pass.
- Where a rule says "sportbet" it means the code at `0da316f` (`D:\Projects\sportbet`), which is what the catalogue cites. Every sportbet column type below was read from its own migrations, run on `mysql:26.7.0`.
- Test counts are exact: each "Expected" count was produced by running this plan, task by task, on a fresh copy of the repository.

## File map

```
packages/domain/src/
  invariant/range-invariant.ts        defineRangeInvariant: whole-number rules held on both sides (new)
  score/score.ts                      + scoreSideInvariant, rateInvariant; Score.of and Rate.of read them
  shared/ids.ts                       + roundNumberInvariant; roundNumberSchema exported
  shared/instant.ts                   + dayAfter (a date's end, UTC)
  points/fixed-point.ts               + decimalUnits (decimal text to exact units)
  points/odds.ts                      + oddsInvariant
  standings/team-outcomes.ts          + outcomePlaceInvariant
  standings/standings-prediction.ts   + predictedPlaceInvariant, storedFinalPlaceInvariant
  player/player-status.ts             + fillInCountInvariant
  player/player.ts                    usernameInvariant, StoredPlayer (new)
  prediction/match-prediction.ts      + PREDICTION_ORIGINS
  rules/rule-set.ts                   + RULE_SET_NAMES, RuleSetName
  recalculation/recalculation.ts      + StoredMatchRow, PointsRows
  tournament/tournament.ts            Tournament gains endsOn, standingsDeadlineRound, survival, standingsTableFinal
  stored/sportbet-columns.ts          + matchPointsRow, standingsPointsRow, survivalPick, player, tournament
  golden/golden-scenario.ts           GOLDEN, GOLDEN_POINTS, GOLDEN_POINTS_RULED, id-mapped builders (moved from golden.test.ts)
  testing.ts                          re-exports the golden scenario
  index.ts                            every new export
packages/db/
  package.json                        + the `./migrations` runtime entry
  migrations/0001_tournament-season.sql  the tournaments columns, backfilled (hand-edited)
  migrations/0002_core-schema.sql     every new table, enum, key and CHECK
  src/client.ts                       + Tx, Executor
  src/edge.ts                         stored(), id and decimal conversions, upsert and chunk helpers (new)
  src/identity.ts                     advanceIdentitySequences (new)
  src/invariant.ts                    InvariantCheck holds a text or a range invariant
  src/migrations.ts                   + POSTGRES_IMAGE (moved from testing/database.ts)
  src/schema.ts                       every area's tables and INVARIANT_CHECKS
  src/tournament/schema.ts            + ends_on, standings_deadline_round, survival, standings_table_final
  src/tournament/repository.ts        renamed from queries.ts; + saveTournament
  src/season/{schema,repository}.ts   rounds, games; saveRounds, saveGames, loadSeason
  src/team/{schema,repository}.ts     teams, team_outcomes; saveTeams, listTeams, saveTeamOutcomes, loadTeamOutcomes
  src/player/{schema,repository}.ts   players, tournament_players; savePlayers, listPlayers, saveTournamentPlayers, listTournamentPlayers, loadPlayerStatuses
  src/prediction/{schema,repository}.ts  match_predictions
  src/standings/{schema,repository}.ts   standings_predictions
  src/survival/{schema,repository}.ts    survival_picks; saveSurvivalPicks, loadSurvivalRuns, loadStoredSurvivalRows
  src/points/{schema,repository}.ts      points_source; game_odds, match_points, standings_points, survival_points; saveTournamentPoints, loadTournamentPoints, loadGameOdds, countPointsRows
  src/recalculation/repository.ts     loadTournamentInputs
  src/testing/invariant-check.ts      describeInvariantCheck proves range CHECKs too
  test/world.ts, season.test.ts, player.test.ts, predictions.test.ts, points.test.ts, golden.test.ts  (new)
  test/schema.test.ts, invariant-checks.test.ts, tournament.test.ts, seed.test.ts  (extended)
tools/migrate/                        @sportbet/migrate, the production-copy reader (new)
  package.json, tsconfig.json, vitest.config.ts, build.mjs
  src/read-columns.ts                 READ_COLUMNS: the only place the reader names a sportbet column
  src/fetch.ts                        the OCI fetcher, the latest-backup rule, the 26-hour warning
  src/dump.ts                         checkDump: gzip, completion marker, engine
  src/containers.ts                   the MySQL and Postgres containers, the restore, the label
  src/sportbet-read.ts                mysql2 reads and the schema drift check
  src/map.ts                          mapSportbet: every value through sportbetColumns, every table reconciled
  src/load.ts                         loadMapped, recalculateLoaded, pointsRowCounts
  src/report.ts                       the load report and the exit status
  src/run.ts                          runReader: the pipeline, the cleanup, --keep
  src/bin/migrate.ts                  the command
  test/fixtures/create-tables.ts      sportbet's SHOW CREATE TABLE text at 0da316f
  test/fixtures/sportbet-dump.ts      the synthetic dump: the golden scenario, a football tournament, quirks, sentinels
  test/global-setup.ts, map.test.ts, load.test.ts, reader.test.ts
apps/web/src/components/*.test.tsx, apps/web/tests/feature/routes.test.ts   fixtures gain the new Tournament fields
eslint.config.js, package.json, pnpm-workspace.yaml, .github/workflows/ci.yml, Dockerfile, .gitignore
infra/compose/app.yml, infra/host/backup.sh   comments point at POSTGRES_IMAGE's new home
CLAUDE.md, docs/decisions.md          the new code rules and the settled choices
```

## Design decisions this plan makes

None is a scoring rule; each is how the spec is held, and each differs from the spec's letter only where running the code showed it had to:

- **Two migrations, not one.** `0001_tournament-season` adds the four tournament columns and backfills staging's two seeded rows by slug (drizzle-kit would add `ends_on` and `survival` as `NOT NULL` at once, which a table with rows refuses); any other row stops the migration instead of being given a date. `0002_core-schema` adds everything else. Both are generated by drizzle-kit; only 0001 is hand-edited, before it reaches staging.
- **`MIGRATIONS_FOLDER`, `runMigrations` and `POSTGRES_IMAGE` get a runtime entry of their own, `@sportbet/db/migrations`,** not the package's main entry: Next's bundler resolves `new URL('../migrations', import.meta.url)` as a module and the web build fails. The reader imports that entry; lint keeps web off it.
- **No `games_recorded_winner_fk`.** The spec gives `recorded_winner_id` a composite foreign key; with `games_winner_in_game` (winner is the home or the away team) and the two team keys, a winner of another tournament is already refused - by the CHECK, which Postgres evaluates first - so the key could never be the one to refuse a row and no test could name it.
- **`survival_points_production_shape` and `survival_points_rewrites_production` do not overlap:** the first holds "a production row is scored and final", the second "a production row rewrites no row", so each refuses its own row by name.
- **A production survival row is saved under its own id,** carried in `SurvivalPoints.storedId` (the domain type has no other id field); a derived row's `storedId` is the production row it rewrites. The parity checker then joins the two on it.
- **The dump is streamed into the container's `mysql` client** (`docker exec -i`, decompressed on the way) rather than copied into the container's tmpfs first: `docker cp` cannot write into a tmpfs mount. The dump never lands inside the container, and the local file is deleted as soon as the load ends.
- **Ports are published on 127.0.0.1 only** by a small subclass of each Testcontainers container (`beforeContainerCreated` sets `HostIp`); Testcontainers has no option for it.
- **Every refusal the report prints names a sportbet id only for rows no player owns** (`id 12`); a player's row is named by its game, team or event (`game 7`); a user's refusal is a count.
- **The ruled rows the reader derives pay no table positions yet:** sportbet does not record whether its table is final, the reader loads `standings_table_final` false (as the spec says), and under R-14 the ruled set pays no place until the final table is entered. The end-to-end test asserts exactly that; see the owner question at the end.

---
### Task 1: Range invariants

A rule on a whole number (a score is never negative, a rate is at least 1) is held in TypeScript and SQL like a text rule: one definition in the domain with its own examples, from which both sides are built.

**Files:**
- Create: `packages/domain/src/invariant/range-invariant.ts`
- Test: `packages/domain/src/invariant/range-invariant.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/invariant/range-invariant.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineRangeInvariant } from './range-invariant';

const count = {
  name: 'count',
  min: 0,
  accepts: [{ label: 'none', value: 0 }],
  refuses: [{ label: 'minus one', value: -1 }],
};

const place = {
  name: 'place',
  min: 1,
  max: 4,
  accepts: [{ label: 'the champion', value: 1 }],
  refuses: [{ label: 'zero', value: 0 }],
};

describe('defineRangeInvariant', () => {
  it.each([
    ['a fraction', 0.5],
    ['an unsafe integer', 2 ** 53],
  ])('refuses a minimum that is %s', (_, min) => {
    expect(() => defineRangeInvariant({ ...place, min })).toThrow(
      /place.*minimum/,
    );
  });

  it.each([
    ['below the minimum', 0],
    ['a fraction', 3.5],
  ])('refuses a maximum %s', (_, max) => {
    expect(() => defineRangeInvariant({ ...place, max })).toThrow(
      /place.*maximum/,
    );
  });

  it('refuses an accepted example its own schema refuses, naming it', () => {
    expect(() =>
      defineRangeInvariant({
        ...place,
        accepts: [{ label: 'fifth', value: 5 }],
      }),
    ).toThrow(/place.*fifth/);
  });

  it('refuses a refused example its own schema accepts, naming it', () => {
    expect(() =>
      defineRangeInvariant({
        ...place,
        refuses: [{ label: 'second', value: 2 }],
      }),
    ).toThrow(/place.*second/);
  });

  it('keeps the name, bounds and examples it was given', () => {
    expect(defineRangeInvariant(place)).toMatchObject(place);
    expect(defineRangeInvariant(count).max).toBeUndefined();
  });

  it('derives a schema that holds both bounds', () => {
    const { schema } = defineRangeInvariant(place);
    expect(
      [0, 1, 4, 5].map((value) => schema.safeParse(value).success),
    ).toEqual([false, true, true, false]);
  });

  it('derives a schema with no upper bound when there is no maximum', () => {
    const { schema } = defineRangeInvariant(count);
    expect(schema.safeParse(2 ** 40).success).toBe(true);
  });

  it('derives a schema that refuses a fraction, text and an unsafe integer', () => {
    const { schema } = defineRangeInvariant(count);
    expect(schema.safeParse(1.5).success).toBe(false);
    expect(schema.safeParse('2').success).toBe(false);
    expect(schema.safeParse(2 ** 53).success).toBe(false);
  });

  it('refuses a value out of range, naming the invariant', () => {
    const result = defineRangeInvariant(place).schema.safeParse(0);
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'A place is at least 1',
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/invariant/range-invariant.test.ts 2>&1 | grep -E "FAIL|Error|Test Files"
```

Expected: `FAIL  src/invariant/range-invariant.test.ts` with `Error: Cannot find module './range-invariant' imported from .../packages/domain/src/invariant/range-invariant.test.ts`, and `Test Files  1 failed (1)`.

- [ ] **Step 3: Implement the range invariant**

Create `packages/domain/src/invariant/range-invariant.ts`:

```ts
import { z } from 'zod';

/** One whole number a range invariant is expected to accept or refuse. */
export interface RangeExample {
  readonly label: string;
  readonly value: number;
}

export interface RangeInvariantDefinition {
  /** What the rule is about, as error messages and test names show it. */
  readonly name: string;
  /** The smallest whole number allowed. */
  readonly min: number;
  /** The largest whole number allowed, if there is one. */
  readonly max?: number;
  /** Inputs both sides must accept, and inputs both must refuse. */
  readonly accepts: readonly RangeExample[];
  readonly refuses: readonly RangeExample[];
}

/**
 * A rule on a whole number that the domain schema and a database CHECK both
 * hold: at least `min` and, if there is one, at most `max`. The unit is the
 * column's own (a score, a place, a count of hundredths); for a rule that
 * only draws the line at zero, the same invariant holds whatever the unit.
 * `packages/db` renders the CHECK from `min` and `max`, and the tests on both
 * sides run `accepts` and `refuses` against their side.
 */
export interface RangeInvariant extends RangeInvariantDefinition {
  /** The rule as a Zod schema: a safe integer within the range. */
  readonly schema: z.ZodInt;
}

/**
 * Throws if the bounds are not safe integers, if `max` is below `min`, or if
 * the invariant's own schema disagrees with one of its examples.
 */
export function defineRangeInvariant(
  definition: RangeInvariantDefinition,
): RangeInvariant {
  const { name, min, max } = definition;
  if (!Number.isSafeInteger(min)) {
    throw new Error(`invariant ${name}: the minimum must be a safe integer`);
  }
  if (max !== undefined && !(Number.isSafeInteger(max) && max >= min)) {
    throw new Error(
      `invariant ${name}: the maximum must be a safe integer no smaller than the minimum`,
    );
  }
  let schema = z.int({ message: `Not a valid ${name}` }).min(min, {
    message: `A ${name} is at least ${String(min)}`,
  });
  if (max !== undefined) {
    schema = schema.max(max, {
      message: `A ${name} is at most ${String(max)}`,
    });
  }
  const wronglyRefused = definition.accepts.find(
    ({ value }) => !schema.safeParse(value).success,
  );
  if (wronglyRefused !== undefined) {
    throw new Error(
      `invariant ${name}: refuses its accepted example "${wronglyRefused.label}"`,
    );
  }
  const wronglyAccepted = definition.refuses.find(
    ({ value }) => schema.safeParse(value).success,
  );
  if (wronglyAccepted !== undefined) {
    throw new Error(
      `invariant ${name}: accepts its refused example "${wronglyAccepted.label}"`,
    );
  }
  return { ...definition, schema };
}
```

In `packages/domain/src/index.ts`, replace:

```ts
  type InvariantExample,
} from './invariant/invariant';
```

with:

```ts
  type InvariantExample,
} from './invariant/invariant';
export {
  defineRangeInvariant,
  type RangeExample,
  type RangeInvariant,
  type RangeInvariantDefinition,
} from './invariant/range-invariant';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  28 passed (28)` and `Tests  452 passed (452)`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/invariant packages/domain/src/index.ts
git commit -m "$(cat <<'EOF'
feat(domain): whole-number range invariants beside the text ones (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The number rules as invariants, read by their factories

Every whole-number rule a column will hold becomes a range invariant in the module that owns it, and the factory that already enforced it reads the invariant's schema, so the domain and the CHECK read one definition. No factory's behaviour changes and each keeps its refusal names; a test per invariant proves the factory accepts its accepted examples and refuses its refused ones. The username rule is a text invariant, the tournament name's not-blank class with sportbet's 255.

**Files:**
- Modify: `packages/domain/src/score/score.ts`, `packages/domain/src/shared/ids.ts`, `packages/domain/src/standings/team-outcomes.ts`, `packages/domain/src/standings/standings-prediction.ts`, `packages/domain/src/player/player-status.ts`, `packages/domain/src/points/odds.ts`, `packages/domain/src/index.ts`
- Create: `packages/domain/src/player/player.ts`
- Test: `packages/domain/src/score/score.test.ts`, `packages/domain/src/shared/shared.test.ts`, `packages/domain/src/standings/team-outcomes.test.ts`, `packages/domain/src/standings/standings-prediction.test.ts`, `packages/domain/src/player/player-status.test.ts`, `packages/domain/src/points/points.test.ts`, `packages/domain/src/player/player.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/score/score.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { Rate, Score } from './score';

describe('Score', () => {
```

with:

```ts
import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { Rate, rateInvariant, Score, scoreSideInvariant } from './score';

describe('Score', () => {
```

In `packages/domain/src/score/score.test.ts`, replace:

```ts
    expect(Rate.of(value)).toEqual(refuse('not-a-positive-integer'));
  });
});
```

with:

```ts
    expect(Rate.of(value)).toEqual(refuse('not-a-positive-integer'));
  });
});

// The database CHECKs hold the same invariants (packages/db): the factory
// and the column must draw the line in the same place.
describe('the score and rate invariants', () => {
  it('Score.of accepts and refuses each side exactly as scoreSideInvariant does', () => {
    for (const { value } of scoreSideInvariant.accepts) {
      expect(Score.of(value, value).ok).toBe(true);
    }
    for (const { value } of scoreSideInvariant.refuses) {
      expect(Score.of(value, 0)).toEqual(refuse('negative'));
      expect(Score.of(0, value)).toEqual(refuse('negative'));
    }
  });

  it('Rate.of accepts and refuses exactly as rateInvariant does', () => {
    for (const { value } of rateInvariant.accepts) {
      expect(Rate.of(value).ok).toBe(true);
    }
    for (const { value } of rateInvariant.refuses) {
      expect(Rate.of(value)).toEqual(refuse('not-a-positive-integer'));
    }
  });
});
```

In `packages/domain/src/shared/shared.test.ts`, replace:

```ts
  roundNumber,
  teamId,
  tournamentId,
} from './ids';
```

with:

```ts
  roundNumber,
  roundNumberInvariant,
  teamId,
  tournamentId,
} from './ids';
```

Append to `packages/domain/src/shared/shared.test.ts`:

```ts

describe('roundNumber and its invariant', () => {
  it('accepts and refuses exactly as roundNumberInvariant does', () => {
    for (const { value } of roundNumberInvariant.accepts) {
      expect(roundNumber(value).ok).toBe(true);
    }
    for (const { value } of roundNumberInvariant.refuses) {
      expect(roundNumber(value)).toEqual(refuse('not-a-positive-integer'));
    }
  });
});
```

In `packages/domain/src/standings/team-outcomes.test.ts`, replace:

```ts
import { refuse } from '../shared/result';
import { team, teamOutcome, unwrap } from '../testing';
import { TeamOutcomes } from './team-outcomes';

describe('TeamOutcomes.enter', () => {
```

with:

```ts
import { refuse } from '../shared/result';
import { team, teamOutcome, unwrap } from '../testing';
import { outcomePlaceInvariant, TeamOutcomes } from './team-outcomes';

describe('TeamOutcomes.enter', () => {
```

In `packages/domain/src/standings/team-outcomes.test.ts`, replace:

```ts
    expect(TeamOutcomes.stored(teams, true)).toEqual(refuse(refusal));
  });
});
```

with:

```ts
    expect(TeamOutcomes.stored(teams, true)).toEqual(refuse(refusal));
  });
});

describe('TeamOutcomes.stored and outcomePlaceInvariant', () => {
  it('accepts and refuses a place exactly as the invariant does', () => {
    for (const { value } of outcomePlaceInvariant.accepts) {
      expect(
        TeamOutcomes.stored([teamOutcome('ZAL', { place: value })], true).ok,
      ).toBe(true);
    }
    for (const { value } of outcomePlaceInvariant.refuses) {
      expect(
        TeamOutcomes.stored([teamOutcome('ZAL', { place: value })], true),
      ).toEqual(refuse('place-not-positive'));
    }
  });
});
```

In `packages/domain/src/standings/standings-prediction.test.ts`, replace:

```ts
import { player, team, teamPick, unwrap } from '../testing';
import {
  StandingsPrediction,
  type StoredTeamPick,
```

with:

```ts
import { player, team, teamPick, unwrap } from '../testing';
import {
  predictedPlaceInvariant,
  StandingsPrediction,
  type StoredTeamPick,
```

In `packages/domain/src/standings/standings-prediction.test.ts`, replace:

```ts
  predictedPlaceInvariant,
  StandingsPrediction,
  type StoredTeamPick,
} from './standings-prediction';
```

with:

```ts
  predictedPlaceInvariant,
  StandingsPrediction,
  storedFinalPlaceInvariant,
  type StoredTeamPick,
} from './standings-prediction';
```

In `packages/domain/src/standings/standings-prediction.test.ts`, replace:

```ts
    ).toEqual(refuse('final-place-out-of-range'));
  });
});
```

with:

```ts
    ).toEqual(refuse('final-place-out-of-range'));
  });
});

describe('StandingsPrediction.stored and its invariants', () => {
  const stored = (row: Partial<StoredTeamPick>) =>
    StandingsPrediction.stored(player('ada'), [{ ...teamPick('ZAL'), ...row }]);

  it('accepts and refuses a place exactly as predictedPlaceInvariant does', () => {
    for (const { value } of predictedPlaceInvariant.accepts) {
      expect(stored({ place: value }).ok).toBe(true);
    }
    for (const { value } of predictedPlaceInvariant.refuses) {
      expect(stored({ place: value })).toEqual(refuse('bad-place'));
    }
  });

  it('accepts and refuses a final place exactly as storedFinalPlaceInvariant does', () => {
    for (const { value } of storedFinalPlaceInvariant.accepts) {
      expect(stored({ finalPlace: value }).ok).toBe(true);
    }
    for (const { value } of storedFinalPlaceInvariant.refuses) {
      expect(stored({ finalPlace: value })).toEqual(refuse('bad-final-place'));
    }
  });
});
```

In `packages/domain/src/player/player-status.test.ts`, replace:

```ts
  unwrap,
} from '../testing';
import { PlayerStatus, type PredictionWrite } from './player-status';

const EUROLEAGUE = tournamentKey('euroleague-2026-27');
```

with:

```ts
  unwrap,
} from '../testing';
import {
  fillInCountInvariant,
  PlayerStatus,
  type PredictionWrite,
} from './player-status';

const EUROLEAGUE = tournamentKey('euroleague-2026-27');
```

In `packages/domain/src/player/player-status.test.ts`, replace:

```ts
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(3);
  });
});
```

with:

```ts
    expect(status.fillInCount(EUROLEAGUE, ruledRules)).toBe(3);
  });
});

describe('PlayerStatus.stored and fillInCountInvariant', () => {
  it('accepts and refuses a count exactly as the invariant does', () => {
    const stored = (count: number) =>
      PlayerStatus.stored(
        {
          switchedOffIn: new Set(),
          adminHidden: false,
          fillIns: new Map([[EUROLEAGUE, count]]),
        },
        sportbetRules,
      );
    for (const { value } of fillInCountInvariant.accepts) {
      expect(stored(value).ok).toBe(true);
    }
    for (const { value } of fillInCountInvariant.refuses) {
      expect(stored(value)).toEqual(refuse('bad-count'));
    }
  });
});
```

In `packages/domain/src/points/points.test.ts`, replace:

```ts
import { Odds, oddsOfHundredths, StandingsOdds } from './odds';
```

with:

```ts
import { Odds, oddsInvariant, oddsOfHundredths, StandingsOdds } from './odds';
```

Append to `packages/domain/src/points/points.test.ts`:

```ts

describe('Odds and oddsInvariant', () => {
  it('accept and refuse game and standings odds exactly as the invariant does', () => {
    for (const { value } of oddsInvariant.accepts) {
      expect(Odds.ofHundredths(value).ok).toBe(true);
      expect(StandingsOdds.ofTenThousandths(value).ok).toBe(true);
    }
    for (const { value } of oddsInvariant.refuses) {
      expect(Odds.ofHundredths(value)).toEqual(refuse('negative'));
      expect(StandingsOdds.ofTenThousandths(value)).toEqual(refuse('negative'));
    }
  });
});
```

Create `packages/domain/src/player/player.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { usernameInvariant } from './player';

describe('usernameInvariant', () => {
  it('accepts every username sportbet accepts, up to 255 characters', () => {
    expect(usernameInvariant.schema.safeParse('ada').success).toBe(true);
    expect(usernameInvariant.maxLength).toBe(255);
  });

  it('refuses a blank username, naming the invariant', () => {
    const result = usernameInvariant.schema.safeParse('  ');
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'Not a valid username',
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/score src/shared src/standings src/player src/points 2>&1 | grep -E "FAIL|Test Files|Tests "
```

Expected: `Test Files  7 failed | 2 passed (9)` and `Tests  8 failed | 133 passed (141)`: `src/player/player.test.ts` cannot load `./player`, and each of the seven new invariant tests fails, because the invariant it imports does not exist yet.

- [ ] **Step 3: Define the invariants where their rules live**

In `packages/domain/src/score/score.ts`, replace:

```ts
import { ok, refuse, type Result } from '../shared/result';
```

with:

```ts
import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from '../shared/result';
```

In `packages/domain/src/score/score.ts`, replace:

```ts
import { ok, refuse, type Result } from '../shared/result';

export type Outcome = 'home' | 'away' | 'level';
```

with:

```ts
import { ok, refuse, type Result } from '../shared/result';

/**
 * One side of a result, or of a stored prediction: a whole number, never
 * negative (R-41; sportbet's UpdateResultRequest refuses one too, min:0).
 */
export const scoreSideInvariant = defineRangeInvariant({
  name: 'score side',
  min: 0,
  accepts: [
    { label: 'zero', value: 0 },
    { label: 'a basketball score', value: 88 },
  ],
  refuses: [
    { label: "sportbet's old postponed marker, -1", value: -1 },
    { label: 'a large negative score', value: -120 },
  ],
});

/** A round's multiplier: a whole number of at least 1 (LR-4). */
export const rateInvariant = defineRangeInvariant({
  name: 'rate',
  min: 1,
  accepts: [
    { label: 'the regular season', value: 1 },
    { label: 'the Final Four', value: 3 },
  ],
  refuses: [
    { label: 'zero, which sportbet lets an admin save', value: 0 },
    { label: 'a negative rate', value: -1 },
  ],
});

export type Outcome = 'home' | 'away' | 'level';
```

In `packages/domain/src/score/score.ts`, replace:

```ts
      return refuse('not-a-whole-number');
    }
    if (home < 0 || away < 0) {
      return refuse('negative');
    }
```

with:

```ts
      return refuse('not-a-whole-number');
    }
    const side = scoreSideInvariant.schema;
    if (!side.safeParse(home).success || !side.safeParse(away).success) {
      return refuse('negative');
    }
```

In `packages/domain/src/score/score.ts`, replace:

```ts

  static of(value: number): Result<Rate, 'not-a-positive-integer'> {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return refuse('not-a-positive-integer');
    }
```

with:

```ts

  static of(value: number): Result<Rate, 'not-a-positive-integer'> {
    if (!rateInvariant.schema.safeParse(value).success) {
      return refuse('not-a-positive-integer');
    }
```

In `packages/domain/src/shared/ids.ts`, replace:

```ts
import { z } from 'zod';
import { ok, refuse, type Result } from './result';
```

with:

```ts
import { z } from 'zod';
import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from './result';
```

In `packages/domain/src/shared/ids.ts`, replace:

```ts
import { ok, refuse, type Result } from './result';

const teamIdSchema = z.string().min(1).brand<'TeamId'>();
const playerIdSchema = z.string().min(1).brand<'PlayerId'>();
```

with:

```ts
import { ok, refuse, type Result } from './result';

/** A round's number in its tournament: a whole number from 1. */
export const roundNumberInvariant = defineRangeInvariant({
  name: 'round number',
  min: 1,
  accepts: [
    { label: 'the first round', value: 1 },
    { label: 'the last regular-season round', value: 38 },
  ],
  refuses: [
    { label: 'zero', value: 0 },
    { label: 'a negative round', value: -1 },
  ],
});

const teamIdSchema = z.string().min(1).brand<'TeamId'>();
const playerIdSchema = z.string().min(1).brand<'PlayerId'>();
```

In `packages/domain/src/shared/ids.ts`, replace:

```ts
const tournamentIdSchema = z.string().min(1).brand<'TournamentId'>();
const gameIdSchema = z.int().positive().brand<'GameId'>();
const roundNumberSchema = z.int().positive().brand<'RoundNumber'>();

export type TeamId = z.infer<typeof teamIdSchema>;
```

with:

```ts
const tournamentIdSchema = z.string().min(1).brand<'TournamentId'>();
const gameIdSchema = z.int().positive().brand<'GameId'>();
export const roundNumberSchema =
  roundNumberInvariant.schema.brand<'RoundNumber'>();

export type TeamId = z.infer<typeof teamIdSchema>;
```

In `packages/domain/src/standings/team-outcomes.ts`, replace:

```ts
import type { TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
```

with:

```ts
import { defineRangeInvariant } from '../invariant/range-invariant';
import type { TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
```

In `packages/domain/src/standings/team-outcomes.ts`, replace:

```ts
import type { FinalPlace, StandingsStage } from './standings-prediction';

/** What a team actually did, as the admin entered it. */
export interface TeamOutcome {
```

with:

```ts
import type { FinalPlace, StandingsStage } from './standings-prediction';

/**
 * A team's regular-season place as an admin entered it: from 1. sportbet's
 * 0 for an undecided place is mapped to null by `sportbetColumns` first.
 */
export const outcomePlaceInvariant = defineRangeInvariant({
  name: 'team place',
  min: 1,
  accepts: [
    { label: 'first', value: 1 },
    { label: 'twentieth', value: 20 },
  ],
  refuses: [
    { label: "zero, sportbet's undecided", value: 0 },
    { label: 'a negative place', value: -1 },
  ],
});

/** What a team actually did, as the admin entered it. */
export interface TeamOutcome {
```

In `packages/domain/src/standings/team-outcomes.ts`, replace:

```ts
  const badPlace = teams.some(
    ({ place }) =>
      place !== null && (!Number.isSafeInteger(place) || place <= 0),
  );
  return badPlace ? 'place-not-positive' : null;
```

with:

```ts
  const badPlace = teams.some(
    ({ place }) =>
      place !== null && !outcomePlaceInvariant.schema.safeParse(place).success,
  );
  return badPlace ? 'place-not-positive' : null;
```

In `packages/domain/src/standings/standings-prediction.ts`, replace:

```ts
import type { PlayerId, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
```

with:

```ts
import { defineRangeInvariant } from '../invariant/range-invariant';
import type { PlayerId, TeamId } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
```

In `packages/domain/src/standings/standings-prediction.ts`, replace:

```ts
import { ok, refuse, type Result } from '../shared/result';

/**
 * A finishing place in the final: a Euroleague entry names a champion (1)
```

with:

```ts
import { ok, refuse, type Result } from '../shared/result';

/**
 * A predicted place as stored: from 0, since sportbet scores a saved place
 * 0 as a place (StandingScoringService), so a stored row may hold one.
 */
export const predictedPlaceInvariant = defineRangeInvariant({
  name: 'predicted place',
  min: 0,
  accepts: [
    { label: "sportbet's place 0", value: 0 },
    { label: 'first', value: 1 },
    { label: 'twentieth', value: 20 },
  ],
  refuses: [{ label: 'a negative place', value: -1 }],
});

/**
 * A final place as stored, predicted or entered: 1 to 4, as sportbet's
 * final box shares football's four places. A Euroleague entry names only 1
 * and 2; 0, sportbet's no final place, is mapped to null first.
 */
export const storedFinalPlaceInvariant = defineRangeInvariant({
  name: 'final place',
  min: 1,
  max: 4,
  accepts: [
    { label: 'the champion', value: 1 },
    { label: "football's fourth place", value: 4 },
  ],
  refuses: [
    { label: "zero, sportbet's no final place", value: 0 },
    { label: 'a fifth place', value: 5 },
  ],
});

/**
 * A finishing place in the final: a Euroleague entry names a champion (1)
```

In `packages/domain/src/standings/standings-prediction.ts`, replace:

```ts
      if (
        row.place !== null &&
        !(Number.isSafeInteger(row.place) && row.place >= 0)
      ) {
        return refuse('bad-place');
```

with:

```ts
      if (
        row.place !== null &&
        !predictedPlaceInvariant.schema.safeParse(row.place).success
      ) {
        return refuse('bad-place');
```

In `packages/domain/src/standings/standings-prediction.ts`, replace:

```ts
          (place) => place === row.finalPlace,
        );
        if (known === undefined) {
          return refuse('bad-final-place');
        }
```

with:

```ts
          (place) => place === row.finalPlace,
        );
        if (
          known === undefined ||
          !storedFinalPlaceInvariant.schema.safeParse(known).success
        ) {
          return refuse('bad-final-place');
        }
```

In `packages/domain/src/player/player-status.ts`, replace:

```ts
import type { PredictionOrigin } from '../prediction/match-prediction';
import type { RuleSet } from '../rules/rule-set';
```

with:

```ts
import { defineRangeInvariant } from '../invariant/range-invariant';
import type { PredictionOrigin } from '../prediction/match-prediction';
import type { RuleSet } from '../rules/rule-set';
```

In `packages/domain/src/player/player-status.ts`, replace:

```ts
export type StoredStatusRefusal = 'bad-count' | 'admin-hide-is-the-switch';

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): where they
```

with:

```ts
export type StoredStatusRefusal = 'bad-count' | 'admin-hide-is-the-switch';

/** The fill-ins counted toward switching a player off: a whole number from 0. */
export const fillInCountInvariant = defineRangeInvariant({
  name: 'fill-in count',
  min: 0,
  accepts: [
    { label: 'none', value: 0 },
    { label: "sportbet's switch-off count", value: 5 },
  ],
  refuses: [{ label: 'a negative count', value: -1 }],
});

/**
 * Only what scoring needs to know about a player (PL-1, RA-4): where they
```

In `packages/domain/src/player/player-status.ts`, replace:

```ts
  ): Result<PlayerStatus, StoredStatusRefusal> {
    const counts = [...stored.fillIns];
    if (counts.some(([, count]) => !Number.isSafeInteger(count) || count < 0)) {
      return refuse('bad-count');
    }
```

with:

```ts
  ): Result<PlayerStatus, StoredStatusRefusal> {
    const counts = [...stored.fillIns];
    if (
      counts.some(
        ([, count]) => !fillInCountInvariant.schema.safeParse(count).success,
      )
    ) {
      return refuse('bad-count');
    }
```

In `packages/domain/src/points/odds.ts`, replace:

```ts
import { ok, refuse, type Result } from '../shared/result';
import {
```

with:

```ts
import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from '../shared/result';
import {
```

In `packages/domain/src/points/odds.ts`, replace:

```ts
export type OddsRefusal = UnitsRefusal | 'negative';

/** Set once each, by the static blocks: the only ways past the constructors. */
let constructOdds: (hundredths: number) => Odds;
```

with:

```ts
export type OddsRefusal = UnitsRefusal | 'negative';

/**
 * Crowd odds are never negative (CO-1 to CO-4, ST-4). Only the sign is
 * drawn, so the one invariant holds for hundredths (game odds) and
 * ten-thousandths (standings odds) alike.
 */
export const oddsInvariant = defineRangeInvariant({
  name: 'odds',
  min: 0,
  accepts: [
    { label: 'no votes', value: 0 },
    { label: 'a favourite, 0.59', value: 59 },
  ],
  refuses: [{ label: 'a negative value', value: -1 }],
});

/** Set once each, by the static blocks: the only ways past the constructors. */
let constructOdds: (hundredths: number) => Odds;
```

In `packages/domain/src/points/odds.ts`, replace:

```ts
function oddsRefusal(units: number): OddsRefusal | null {
  if (!isWholeUnits(units)) return 'not-whole-units';
  return units < 0 ? 'negative' : null;
}
```

with:

```ts
function oddsRefusal(units: number): OddsRefusal | null {
  if (!isWholeUnits(units)) return 'not-whole-units';
  return oddsInvariant.schema.safeParse(units).success ? null : 'negative';
}
```

Create `packages/domain/src/player/player.ts`:

```ts
import { defineInvariant } from '../invariant/invariant';
import type { PlayerId } from '../shared/ids';
import { tournamentNameInvariant } from '../tournament/tournament';

const USERNAME_MAX_LENGTH = 255;

/**
 * A username holds at least one character that is not whitespace (the
 * tournament name's rule) and at most 255, as sportbet validates it on both
 * registration paths (`required|string|max:255`; Google sign-up takes the
 * email's non-empty local part), so every migrated username is valid.
 */
export const usernameInvariant = defineInvariant({
  name: 'username',
  pattern: tournamentNameInvariant.pattern,
  maxLength: USERNAME_MAX_LENGTH,
  accepts: [
    { label: 'a realistic username', value: 'jonas' },
    { label: 'an email local part', value: 'jonas.k-2' },
    { label: 'a Lithuanian letter', value: 'Jonė' },
    { label: 'the maximum length', value: 'a'.repeat(USERNAME_MAX_LENGTH) },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'only spaces', value: '   ' },
    { label: 'too long', value: 'a'.repeat(USERNAME_MAX_LENGTH + 1) },
  ],
});

/**
 * A player as 2.2 stores one: the id and the username, nothing else - no
 * name, email or sign-in detail (spec 2.2, where production data may go).
 */
export interface StoredPlayer {
  readonly id: PlayerId;
  readonly username: string;
}
```

- [ ] **Step 4: Export them**

In `packages/domain/src/index.ts`, replace:

```ts
  roundNumber,
  teamId,
  tournamentId,
  type GameId,
```

with:

```ts
  roundNumber,
  roundNumberInvariant,
  teamId,
  tournamentId,
  type GameId,
```

In `packages/domain/src/index.ts`, replace:

```ts
export { Odds, StandingsOdds } from './points/odds';
export { Rate, Score, type Outcome, type ScoreRefusal } from './score/score';
```

with:

```ts
export { Odds, oddsInvariant, StandingsOdds } from './points/odds';
export {
  Rate,
  rateInvariant,
  Score,
  scoreSideInvariant,
  type Outcome,
  type ScoreRefusal,
} from './score/score';
```

In `packages/domain/src/index.ts`, replace:

```ts
export {
  STANDINGS_COUNTS,
  StandingsPrediction,
```

with:

```ts
export {
  predictedPlaceInvariant,
  STANDINGS_COUNTS,
  StandingsPrediction,
  storedFinalPlaceInvariant,
```

In `packages/domain/src/index.ts`, replace:

```ts
export {
  TeamOutcomes,
  type TeamOutcome,
```

with:

```ts
export {
  outcomePlaceInvariant,
  TeamOutcomes,
  type TeamOutcome,
```

In `packages/domain/src/index.ts`, replace:

```ts
export {
  PlayerStatus,
  type PredictionWrite,
```

with:

```ts
export { usernameInvariant, type StoredPlayer } from './player/player';
export {
  fillInCountInvariant,
  PlayerStatus,
  type PredictionWrite,
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  29 passed (29)` and `Tests  462 passed (462)`.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src
git commit -m "$(cat <<'EOF'
feat(domain): scores, rates, rounds, places, counts, odds and usernames as invariants (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The vocabulary of stored rows

The schema's enums are built from domain constants, so the prediction origins and the rule set names become lists; the points tables store a `PointsRows` (a `TournamentPoints` without its totals and without `MatchPoints.extendsSerija`); repositories and the reader read decimal text into exact units with one helper, `decimalUnits`, which refuses more places than the column has; and `dayAfter` turns a tournament's last day into the instant its season ends.

**Files:**
- Modify: `packages/domain/src/points/fixed-point.ts`, `packages/domain/src/shared/instant.ts`, `packages/domain/src/rules/rule-set.ts`, `packages/domain/src/prediction/match-prediction.ts`, `packages/domain/src/recalculation/recalculation.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/points/points.test.ts`, `packages/domain/src/shared/shared.test.ts`, `packages/domain/src/rules/rule-set.test.ts`, `packages/domain/src/prediction/match-prediction.test.ts`, `packages/domain/src/recalculation/recalculation.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/points/points.test.ts`, replace:

```ts
import { Odds, oddsInvariant, oddsOfHundredths, StandingsOdds } from './odds';
```

with:

```ts
import { decimalUnits } from './fixed-point';
import { Odds, oddsInvariant, oddsOfHundredths, StandingsOdds } from './odds';
```

Append to `packages/domain/src/points/points.test.ts`:

```ts

describe('decimalUnits', () => {
  it.each([
    ['-45.00', 2, -4500],
    ['0.59', 2, 59],
    ['12', 2, 1200],
    ['631.1610', 4, 6_311_610],
    ['631.161', 4, 6_311_610],
    ['0.0000', 4, 0],
    ['-0.00', 2, 0],
  ])('reads %s with %i places as %i units, exactly', (text, places, units) => {
    expect(decimalUnits(text, places)).toEqual({ ok: true, value: units });
  });

  it('never reads a negative zero', () => {
    const result = decimalUnits('-0.00', 2);
    expect(result.ok && Object.is(result.value, 0)).toBe(true);
  });

  it.each([
    ['more places than the column has', '0.591', 2, 'too-many-places'],
    ['an exponent', '1e-05', 4, 'not-a-decimal'],
    ['an empty text', '', 2, 'not-a-decimal'],
    ['a bare point', '.5', 2, 'not-a-decimal'],
    ['a plus sign', '+1.00', 2, 'not-a-decimal'],
    ['more units than a safe integer', '99999999999999.99', 4, 'not-a-decimal'],
  ] as const)('refuses %s', (_, text, places, refusal) => {
    expect(decimalUnits(text, places)).toEqual(refuse(refusal));
  });
});
```

In `packages/domain/src/shared/shared.test.ts`, replace:

```ts
import { instantFrom, secondsAfter } from './instant';
```

with:

```ts
import { dayAfter, instantFrom, secondsAfter } from './instant';
```

Append to `packages/domain/src/shared/shared.test.ts`:

```ts

describe('dayAfter', () => {
  it('is midnight UTC at the end of the day', () => {
    expect(dayAfter('2027-05-23')).toEqual(ok(Date.UTC(2027, 4, 24, 0, 0, 0)));
    expect(dayAfter('2026-12-31')).toEqual(ok(Date.UTC(2027, 0, 1, 0, 0, 0)));
  });

  it.each([
    ['an empty text', ''],
    ['a timestamp', '2027-05-23T00:00:00Z'],
    ['a February 30th', '2027-02-30'],
  ])('refuses %s', (_, date) => {
    expect(dayAfter(date)).toEqual(refuse('not-a-date'));
  });
});
```

In `packages/domain/src/rules/rule-set.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules, type RuleSet } from './rule-set';

// Each key is one difference between sportbet and the owner's rulings, with
```

with:

```ts
import { describe, expect, it } from 'vitest';
import {
  RULE_SET_NAMES,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from './rule-set';

// Each key is one difference between sportbet and the owner's rulings, with
```

In `packages/domain/src/rules/rule-set.test.ts`, replace:

```ts
    expect(ruledRules.name).toBe('ruled');
  });
});
```

with:

```ts
    expect(ruledRules.name).toBe('ruled');
  });

  it('rules: RULE_SET_NAMES lists every set by name, sportbet first', () => {
    expect(RULE_SET_NAMES).toEqual([sportbetRules.name, ruledRules.name]);
  });
});
```

In `packages/domain/src/prediction/match-prediction.test.ts`, replace:

```ts
import { refuse } from '../shared/result';
import { at, gameNo, player, score, unwrap } from '../testing';
import { MatchPrediction } from './match-prediction';

const entry = (home: number | null, away: number | null) => ({
```

with:

```ts
import { refuse } from '../shared/result';
import { at, gameNo, player, score, unwrap } from '../testing';
import { MatchPrediction, PREDICTION_ORIGINS } from './match-prediction';

const entry = (home: number | null, away: number | null) => ({
```

In `packages/domain/src/prediction/match-prediction.test.ts`, replace:

```ts
});

describe('MatchPrediction.fillIn', () => {
  it('records its origin and when it was made', () => {
```

with:

```ts
});

describe('PREDICTION_ORIGINS', () => {
  it('lists a real prediction, a fill-in and a late fill-in (FI-1, R-9)', () => {
    expect(PREDICTION_ORIGINS).toEqual(['real', 'fill-in', 'late-fill-in']);
  });
});

describe('MatchPrediction.fillIn', () => {
  it('records its origin and when it was made', () => {
```

In `packages/domain/src/recalculation/recalculation.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
```

with:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
```

In `packages/domain/src/recalculation/recalculation.test.ts`, replace:

```ts
import {
  recalculateTournament,
  type StoredSurvivalRow,
  type TournamentInputs,
```

with:

```ts
import {
  recalculateTournament,
  type MatchRow,
  type PointsRows,
  type StoredMatchRow,
  type StoredSurvivalRow,
  type TournamentInputs,
```

In `packages/domain/src/recalculation/recalculation.test.ts`, replace:

```ts
    expect(Object.isFrozen(points)).toBe(true);
  });
});
```

with:

```ts
    expect(Object.isFrozen(points)).toBe(true);
  });
});

describe('stored points rows', () => {
  it('a TournamentPoints is the PointsRows it stores, and a MatchRow its stored row', () => {
    expectTypeOf<TournamentPoints>().toExtend<PointsRows>();
    expectTypeOf<MatchRow>().toExtend<StoredMatchRow>();
    expectTypeOf<StoredMatchRow['points']>().not.toHaveProperty(
      'extendsSerija',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/points src/shared src/rules src/prediction/match-prediction.test.ts src/recalculation 2>&1 | grep -E "FAIL|Test Files|Tests "
```

Expected: `Test Files  4 failed | 2 passed (6)` and `Tests  20 failed | 136 passed (156)`: the 14 `decimalUnits` tests, the four `dayAfter` tests, `PREDICTION_ORIGINS` and `RULE_SET_NAMES`. (The `PointsRows` type test passes at run time; `pnpm typecheck` is what refuses it until Step 3.)

- [ ] **Step 3: Implement them**

In `packages/domain/src/points/fixed-point.ts`, replace:

```ts
/**
 * Fixed-point helpers: a value is a safe integer count of units
```

with:

```ts
import { ok, refuse, type Result } from '../shared/result';

/**
 * Fixed-point helpers: a value is a safe integer count of units
```

In `packages/domain/src/points/fixed-point.ts`, replace:

```ts
  return units < 0 ? -rounded : rounded;
}
```

with:

```ts
  return units < 0 ? -rounded : rounded;
}

/** Why a decimal text was refused as a count of units. */
export type DecimalRefusal = 'not-a-decimal' | 'too-many-places';

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * A decimal as text - a Postgres `numeric`, a MySQL DECIMAL or the shortest
 * text of a MySQL double - as a whole number of units with `places`
 * decimals, exactly: "-45.00" with 2 places is -4500. Text with more places
 * than that is refused, never rounded, and so is anything but plain digits
 * (no exponent, no plus sign). No float is involved.
 */
export function decimalUnits(
  text: string,
  places: number,
): Result<number, DecimalRefusal> {
  const match = DECIMAL.exec(text);
  if (match === null) {
    return refuse('not-a-decimal');
  }
  const [, sign, whole = '', fraction = ''] = match;
  if (fraction.length > places) {
    return refuse('too-many-places');
  }
  const units =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  if (!isWholeUnits(units)) {
    return refuse('not-a-decimal');
  }
  return ok(sign === '-' && units !== 0 ? -units : units);
}
```

In `packages/domain/src/shared/instant.ts`, replace:

```ts
  return instantSchema.parse(instant + seconds * 1000);
}
```

with:

```ts
  return instantSchema.parse(instant + seconds * 1000);
}

/**
 * The first instant after the whole of a UTC calendar day (`YYYY-MM-DD`):
 * a tournament whose end date it is stays on for all of that day, as
 * sportbet reads `end_date < today` in UTC (Tournament::effectiveStatus).
 */
export function dayAfter(isoDate: string): Result<Instant, 'not-a-date'> {
  const start = instantFrom(`${isoDate}T00:00:00Z`);
  return start.ok
    ? ok(secondsAfter(start.value, 86_400))
    : refuse('not-a-date');
}
```

In `packages/domain/src/rules/rule-set.ts`, replace:

```ts
import type { Stage } from '../round/stage';

/**
 * Every point where sportbet's rules and the owner's rulings differ, and
```

with:

```ts
import type { Stage } from '../round/stage';

/**
 * The two rule sets' names. The database's `points_source` enum is built
 * from this list (plus `production`, the rows as production stored them).
 */
export const RULE_SET_NAMES = ['sportbet', 'ruled'] as const;

export type RuleSetName = (typeof RULE_SET_NAMES)[number];

/**
 * Every point where sportbet's rules and the owner's rulings differ, and
```

In `packages/domain/src/rules/rule-set.ts`, replace:

```ts
 */
export interface RuleSet {
  readonly name: 'sportbet' | 'ruled';

  // Rounds and results
```

with:

```ts
 */
export interface RuleSet {
  readonly name: RuleSetName;

  // Rounds and results
```

In `packages/domain/src/prediction/match-prediction.ts`, replace:

```ts
 * Where a prediction came from. A fill-in is the owner's word for
 * sportbet's generated prediction (FI-1); a late fill-in is one made for a
 * late joiner's games already played (R-9).
 */
export type PredictionOrigin = 'real' | 'fill-in' | 'late-fill-in';
```

with:

```ts
 * Where a prediction came from. A fill-in is the owner's word for
 * sportbet's generated prediction (FI-1); a late fill-in is one made for a
 * late joiner's games already played (R-9). The database's
 * `prediction_origin` enum is built from this list.
 */
export type PredictionOrigin = 'real' | 'fill-in' | 'late-fill-in';
```

In `packages/domain/src/prediction/match-prediction.ts`, replace:

```ts
 * `prediction_origin` enum is built from this list.
 */
export type PredictionOrigin = 'real' | 'fill-in' | 'late-fill-in';

export interface PredictionEntry {
```

with:

```ts
 * `prediction_origin` enum is built from this list.
 */
export const PREDICTION_ORIGINS = ['real', 'fill-in', 'late-fill-in'] as const;

export type PredictionOrigin = (typeof PREDICTION_ORIGINS)[number];

export interface PredictionEntry {
```

In `packages/domain/src/recalculation/recalculation.ts`, replace:

```ts
}

export type RecalculationRefusal =
  | 'prediction-for-unknown-game'
```

with:

```ts
}

/**
 * A `point_results` row as stored: a MatchRow without `extendsSerija`,
 * which is derived during the walk and no stored row holds. A MatchRow is
 * one.
 */
export interface StoredMatchRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly points: Omit<MatchPoints, 'extendsSerija'>;
  /** `streak_bonus` (SE-3). */
  readonly serija: Points;
}

/**
 * Every stored points row of one tournament, as the database keeps them:
 * a TournamentPoints without its totals (sums of these rows). A
 * TournamentPoints from recalculateTournament is one, and so are the rows
 * production stored, read back.
 */
export interface PointsRows {
  readonly odds: readonly GameOdds[];
  readonly matches: readonly StoredMatchRow[];
  readonly standings: readonly StandingsRow[];
  readonly survival: readonly SurvivalPoints[];
}

export type RecalculationRefusal =
  | 'prediction-for-unknown-game'
```

In `packages/domain/src/index.ts`, replace:

```ts
export { instantFrom, secondsAfter, type Instant } from './shared/instant';
```

with:

```ts
export {
  dayAfter,
  instantFrom,
  secondsAfter,
  type Instant,
} from './shared/instant';
export { decimalUnits, type DecimalRefusal } from './points/fixed-point';
```

In `packages/domain/src/index.ts`, replace:

```ts
export { ruledRules, sportbetRules, type RuleSet } from './rules/rule-set';
```

with:

```ts
export {
  RULE_SET_NAMES,
  ruledRules,
  sportbetRules,
  type RuleSet,
  type RuleSetName,
} from './rules/rule-set';
```

In `packages/domain/src/index.ts`, replace:

```ts
  PREDICTION_MIN,
  type PredictionEntry,
```

with:

```ts
  PREDICTION_MIN,
  PREDICTION_ORIGINS,
  type PredictionEntry,
```

In `packages/domain/src/index.ts`, replace:

```ts
  type MatchRow,
  type RecalculationRefusal,
  type StoredSurvivalRow,
```

with:

```ts
  type MatchRow,
  type PointsRows,
  type RecalculationRefusal,
  type StoredMatchRow,
  type StoredSurvivalRow,
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean (the `expectTypeOf` assertions are checked by `pnpm typecheck`); `Test Files  29 passed (29)` and `Tests  483 passed (483)`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "$(cat <<'EOF'
feat(domain): prediction origins, rule set names, PointsRows, decimalUnits and dayAfter (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Tournaments gain their season

A tournament carries what its season needs: its last day (`ends_on`, R-21), the admin's standings deadline round (ST-2), whether survival is played, and whether its standings table is final (R-14). The database's CHECK builder learns range invariants (the deadline round is the first column to hold one), and the invariant proof learns to evaluate them on `smallint`, `integer` and `numeric` columns. Staging's two seeded tournaments are backfilled by the migration.

**Files:**
- Modify: `packages/domain/src/tournament/tournament.ts`, `packages/db/src/invariant.ts`, `packages/db/src/testing/invariant-check.ts`, `packages/db/src/tournament/schema.ts`, `packages/db/src/tournament/queries.ts`, `packages/db/src/seed/staging.ts`
- Create: `packages/db/migrations/0001_tournament-season.sql` (generated, then hand-edited), `packages/db/migrations/meta/0001_snapshot.json` (generated)
- Test: `packages/domain/src/tournament/tournament.test.ts`, `packages/db/test/invariant-checks.test.ts`, `packages/db/test/schema.test.ts`, `packages/db/test/tournament.test.ts`, `packages/db/test/seed.test.ts`, `apps/web/src/components/home-view.test.tsx`, `apps/web/src/components/tournament-details.test.tsx`, `apps/web/src/components/tournament-list.test.tsx`, `apps/web/tests/feature/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/tournament/tournament.test.ts`, replace:

```ts
    name: 'Euroleague 2026/27',
    format: 'euroleague',
  };
```

with:

```ts
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  };
```

In `packages/domain/src/tournament/tournament.test.ts`, replace:

```ts
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
```

with:

```ts
  });

  it('accepts an admin standings deadline round', () => {
    const withDeadline = { ...valid, standingsDeadlineRound: 6 };
    expect(tournamentSchema.parse(withDeadline)).toEqual(withDeadline);
  });

  it.each([
    ['an unknown format', { ...valid, format: 'tennis' }],
```

In `packages/domain/src/tournament/tournament.test.ts`, replace:

```ts
    ['a bad slug', { ...valid, slug: 'Euroleague 2026' }],
    ['a blank name', { ...valid, name: '   ' }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
```

with:

```ts
    ['a bad slug', { ...valid, slug: 'Euroleague 2026' }],
    ['a blank name', { ...valid, name: '   ' }],
    [
      'a timestamp for an end date',
      { ...valid, endsOn: '2027-05-23T00:00:00Z' },
    ],
    ['an impossible end date', { ...valid, endsOn: '2027-02-30' }],
    ['a deadline round of 0', { ...valid, standingsDeadlineRound: 0 }],
  ])('rejects %s', (_, input) => {
    expect(tournamentSchema.safeParse(input).success).toBe(false);
```

Replace the contents of `packages/db/test/invariant-checks.test.ts` with:

```ts
import {
  defineInvariant,
  defineRangeInvariant,
  roundNumberInvariant,
  slugInvariant,
} from '@sportbet/domain';
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { InvariantCheck } from '../src/invariant';
import { INVARIANT_CHECKS, tournaments } from '../src/schema';
import { describeInvariantCheck, useTestDatabase } from '../src/testing';
import { invariantDisagreements } from '../src/testing/invariant-check';

const { client } = useTestDatabase();

/**
 * `table.constraint` of each CHECK in the database that holds no domain
 * invariant, each with the reason it cannot be one. Empty today: every CHECK
 * is built from an invariant and listed in INVARIANT_CHECKS.
 */
const NON_INVARIANT_CHECKS: readonly string[] = [];

const qualified = ({ column, constraint }: InvariantCheck) =>
  `${getTableName(column.table)}.${constraint}`;

for (const check of INVARIANT_CHECKS) describeInvariantCheck(client, check);

describe('INVARIANT_CHECKS', () => {
  it('lists every CHECK in the database but the allowed others', async () => {
    const result = await client.query(
      `select conrelid::regclass::text || '.' || conname as name
       from pg_constraint
       where contype = 'c' and conrelid <> 0
         and connamespace = 'public'::regnamespace`,
    );
    const inDatabase = z
      .array(z.object({ name: z.string() }))
      .parse(result.rows)
      .map(({ name }) => name);
    expect(inDatabase.toSorted()).toEqual(
      [...INVARIANT_CHECKS.map(qualified), ...NON_INVARIANT_CHECKS].toSorted(),
    );
  });

  it('are what refuses a row that breaks an invariant, by name', async () => {
    await expect(
      client.query(
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ($1, $2, $3, $4, $5)`,
        [
          'Euroleague 2026/27',
          'Euroleague 2026/27',
          'euroleague',
          '2027-05-23',
          true,
        ],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'tournaments_slug_format',
    });
  });
});

const slugCheck: InvariantCheck = {
  invariant: slugInvariant,
  column: tournaments.slug,
  constraint: 'tournaments_slug_format',
};

const deadlineCheck: InvariantCheck = {
  invariant: roundNumberInvariant,
  column: tournaments.standingsDeadlineRound,
  constraint: 'tournaments_deadline_round_positive',
};

describe('invariantDisagreements', () => {
  it('finds none where the CHECK holds the invariant', async () => {
    const values = [...slugInvariant.accepts, ...slugInvariant.refuses].map(
      ({ value }) => value,
    );
    expect(await invariantDisagreements(client, slugCheck, values)).toEqual([]);
  });

  it('finds the inputs only the CHECK accepts', async () => {
    const stricter = defineInvariant({
      ...slugInvariant,
      maxLength: 50,
      accepts: [],
      refuses: [],
    });
    const long = 'a'.repeat(60);
    expect(
      await invariantDisagreements(
        client,
        { ...slugCheck, invariant: stricter },
        ['euroleague-2026-27', long],
      ),
    ).toEqual([long]);
  });

  it('finds the inputs only the domain accepts', async () => {
    const looser = defineInvariant({
      ...slugInvariant,
      pattern: '^[a-z0-9_-]+$',
      accepts: [],
      refuses: [],
    });
    expect(
      await invariantDisagreements(
        client,
        { ...slugCheck, invariant: looser },
        ['euroleague-2026-27', 'euroleague_2026'],
      ),
    ).toEqual(['euroleague_2026']);
  });

  it('fails when the table has no CHECK of that name', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, constraint: 'tournaments_no_such_check' },
        ['euroleague-2026-27'],
      ),
    ).rejects.toThrow(/tournaments_no_such_check/);
  });

  // The CHECK is evaluated over text values with the default collation, so
  // on any other column type its verdict would not be the table's.
  it('refuses a column that is not text', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.format },
        ['euroleague'],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.format/);
  });

  it('refuses a text invariant on a column that is not text, and a range invariant on text', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.standingsDeadlineRound },
        ['euroleague-2026-27'],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.standings_deadline_round/);
    await expect(
      invariantDisagreements(
        client,
        { ...deadlineCheck, column: tournaments.slug },
        [1],
      ),
    ).rejects.toThrow(/unsupported.*tournaments\.slug/);
  });

  it('finds none where a range CHECK holds its invariant', async () => {
    const values = [
      ...roundNumberInvariant.accepts,
      ...roundNumberInvariant.refuses,
    ].map(({ value }) => value);
    expect(await invariantDisagreements(client, deadlineCheck, values)).toEqual(
      [],
    );
  });

  it('finds the whole numbers only one side of a range accepts', async () => {
    const capped = defineRangeInvariant({
      ...roundNumberInvariant,
      max: 3,
      accepts: [],
      refuses: [],
    });
    expect(
      await invariantDisagreements(
        client,
        { ...deadlineCheck, invariant: capped },
        [0, 1, 4],
      ),
    ).toEqual([4]);
  });

  it('fails when the CHECK is not on that column', async () => {
    await expect(
      invariantDisagreements(
        client,
        { ...slugCheck, column: tournaments.name },
        ['euroleague-2026-27'],
      ),
    ).rejects.toThrow(/slug/);
  });
});
```

Replace the contents of `packages/db/test/schema.test.ts` with:

```ts
import { FORMATS } from '@sportbet/domain';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const run = (text: string, values: readonly unknown[] = []) =>
  client.query(text, [...values]);

const UNIQUE = '23505';

const insertTournament = (id: number, slug: string) =>
  run(
    `insert into tournaments (id, slug, name, format, ends_on, survival)
     overriding system value values ($1, $2, $2, 'euroleague', '2027-05-23', true)`,
    [id, slug],
  );

// The invariant CHECKs are tested in invariant-checks.test.ts.
describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insertTournament(1, 'euroleague-2026-27'),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown format', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ('euroleague-2026-27', 'Euroleague', 'tennis', '2027-05-23', true)`,
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('rejects a duplicate slug', async () => {
    await insertTournament(1, 'euroleague-2026-27');
    await expect(
      insertTournament(2, 'euroleague-2026-27'),
    ).rejects.toMatchObject({
      code: UNIQUE,
      constraint: 'tournaments_slug_unique',
    });
  });

  it('rejects a tournament without an end date', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, survival)
         values ('euroleague-2026-27', 'Euroleague', 'euroleague', true)`,
      ),
    ).rejects.toMatchObject({ code: '23502', column: 'ends_on' });
  });
});

describe('format enum', () => {
  it('holds exactly the domain formats, in order', async () => {
    const result = await client.query(
      'select unnest(enum_range(null::format))::text as value',
    );
    const values = z
      .array(z.object({ value: z.string() }))
      .parse(result.rows)
      .map((row) => row.value);
    expect(values).toEqual([...FORMATS]);
  });
});

describe('migrations', () => {
  it('are idempotent: applying them again changes nothing', async () => {
    await expect(
      runMigrations(url, MIGRATIONS_FOLDER),
    ).resolves.toBeUndefined();
  });

  it("give staging's seeded tournaments the seed's end dates when the season columns arrive", async () => {
    // A second database in the same container, migrated to 0000_init only,
    // holding the two rows staging holds today.
    const name = `backfill_${String(process.pid)}`;
    await run(`drop database if exists ${name}`);
    await run(`create database ${name}`);
    const other = new URL(url);
    other.pathname = `/${name}`;
    const initOnly = mkdtempSync(join(tmpdir(), 'migrations-'));
    mkdirSync(join(initOnly, 'meta'));
    copyFileSync(
      join(MIGRATIONS_FOLDER, '0000_init.sql'),
      join(initOnly, '0000_init.sql'),
    );
    const journal = z
      .object({ entries: z.array(z.object({ tag: z.string() }).loose()) })
      .loose()
      .parse(
        JSON.parse(
          readFileSync(
            join(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
            'utf8',
          ),
        ),
      );
    writeFileSync(
      join(initOnly, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    await runMigrations(other.href, initOnly);
    const staging = new pg.Client({ connectionString: other.href });
    await staging.connect();
    try {
      await staging.query(
        `insert into tournaments (slug, name, format) values
           ('euroleague-2025-26', 'Euroleague 2025/26', 'euroleague'),
           ('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague')`,
      );
      await runMigrations(other.href, MIGRATIONS_FOLDER);
      const result = await staging.query(
        `select slug, ends_on::text as ends_on, survival, standings_table_final
         from tournaments order by slug`,
      );
      expect(result.rows).toEqual([
        {
          slug: 'euroleague-2025-26',
          ends_on: '2026-05-24',
          survival: true,
          standings_table_final: false,
        },
        {
          slug: 'euroleague-2026-27',
          ends_on: '2027-05-23',
          survival: true,
          standings_table_final: false,
        },
      ]);
    } finally {
      await staging.end();
      await run(`drop database ${name}`);
    }
  });
});
```

Replace the contents of `packages/db/test/tournament.test.ts` with:

```ts
import {
  newTournamentSchema,
  roundNumber,
  type Tournament,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  type NewTournament,
} from '../src';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

const euroleagueA: NewTournament = {
  slug: 'euroleague-2025-26',
  name: 'Euroleague 2025/26',
  format: 'euroleague',
  endsOn: '2026-05-24',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
const euroleagueB: NewTournament = {
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: unwrap(roundNumber(6)),
  survival: false,
  standingsTableFinal: true,
};

/** A listed tournament without its generated id. */
const withoutId = (tournament: Tournament): NewTournament =>
  newTournamentSchema.parse(tournament);

describe('listTournaments', () => {
  it('returns nothing from an empty table', async () => {
    expect(await listTournaments(db)).toEqual([]);
  });

  it('returns every tournament with every column, ordered by name', async () => {
    await insertTournaments(db, [euroleagueB, euroleagueA]);
    const listed = await listTournaments(db);
    expect(listed.map(withoutId)).toEqual([euroleagueA, euroleagueB]);
    expect(listed.every((t) => Number.isInteger(t.id) && t.id > 0)).toBe(true);
  });
});

describe('findTournamentBySlug', () => {
  it('finds a stored tournament', async () => {
    await insertTournaments(db, [euroleagueA, euroleagueB]);
    const found = await findTournamentBySlug(db, 'euroleague-2026-27');
    expect(found === undefined ? undefined : withoutId(found)).toEqual(
      euroleagueB,
    );
  });

  it('returns undefined for an unknown slug', async () => {
    await insertTournaments(db, [euroleagueA]);
    expect(await findTournamentBySlug(db, 'nope')).toBeUndefined();
  });
});

describe('insertTournaments', () => {
  it('keeps the existing row when a slug is inserted again', async () => {
    await insertTournaments(db, [euroleagueA]);
    await insertTournaments(db, [{ ...euroleagueA, name: 'Renamed' }]);
    expect((await listTournaments(db)).map(withoutId)).toEqual([euroleagueA]);
  });

  it('does nothing for an empty list', async () => {
    await insertTournaments(db, []);
    expect(await listTournaments(db)).toEqual([]);
  });
});
```

In `packages/db/test/seed.test.ts`, replace:

```ts
import { expect, it } from 'vitest';
import { listTournaments } from '../src';
```

with:

```ts
import { newTournamentSchema } from '@sportbet/domain';
import { expect, it } from 'vitest';
import { listTournaments } from '../src';
```

In `packages/db/test/seed.test.ts`, replace:

```ts
  await seedStaging(db);
  await seedStaging(db);
  const listed = (await listTournaments(db)).map(({ slug, name, format }) => ({
    slug,
    name,
    format,
  }));
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
});
```

with:

```ts
  await seedStaging(db);
  await seedStaging(db);
  // Each listed tournament without its generated id.
  const listed = (await listTournaments(db)).map((tournament) =>
    newTournamentSchema.parse(tournament),
  );
  expect(listed).toEqual([...STAGING_TOURNAMENTS]);
});
```

The web fixtures build `Tournament` and `NewTournament` values, which gain the four fields:

In `apps/web/src/components/home-view.test.tsx`, replace:

```tsx
      name: 'Euroleague 2026/27',
      format: 'euroleague',
    },
  ];
```

with:

```tsx
      name: 'Euroleague 2026/27',
      format: 'euroleague',
      endsOn: '2027-05-23',
      standingsDeadlineRound: null,
      survival: true,
      standingsTableFinal: false,
    },
  ];
```

In `apps/web/src/components/tournament-details.test.tsx`, replace:

```tsx
        name: 'Euroleague 2026/27',
        format: 'euroleague',
      }}
    />,
```

with:

```tsx
        name: 'Euroleague 2026/27',
        format: 'euroleague',
        endsOn: '2027-05-23',
        standingsDeadlineRound: null,
        survival: true,
        standingsTableFinal: false,
      }}
    />,
```

In `apps/web/src/components/tournament-list.test.tsx`, replace:

```tsx
    name: 'Euroleague 2025/26',
    format: 'euroleague',
  },
  {
```

with:

```tsx
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
```

In `apps/web/src/components/tournament-list.test.tsx`, replace:

```tsx
    name: 'Euroleague 2026/27',
    format: 'euroleague',
  },
];
```

with:

```tsx
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
];
```

In `apps/web/tests/feature/routes.test.ts`, replace:

```ts
  name: 'Euroleague 2025/26',
  format: 'euroleague',
};
const euroleagueB: NewTournament = {
```

with:

```ts
  name: 'Euroleague 2025/26',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
const euroleagueB: NewTournament = {
```

In `apps/web/tests/feature/routes.test.ts`, replace:

```ts
  name: 'Euroleague 2026/27',
  format: 'euroleague',
};
```

with:

```ts
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/tournament 2>&1 | grep -E "FAIL|Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: the domain run: `Test Files  1 failed | 1 passed (2)` and `Tests  5 failed | 9 passed (14)` (the schema has no `endsOn` and the rest yet); the db run: `Test Files  3 failed | 2 passed (5)` and `Tests  12 failed | 36 passed (48)` (no `ends_on` column, no `tournaments_deadline_round_positive` CHECK).

- [ ] **Step 3: The domain's tournament**

In `packages/domain/src/tournament/tournament.ts`, replace:

```ts
import { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { FORMATS } from './format';
```

with:

```ts
import { z } from 'zod';
import { defineInvariant } from '../invariant/invariant';
import { roundNumberSchema } from '../shared/ids';
import { FORMATS } from './format';
```

In `packages/domain/src/tournament/tournament.ts`, replace:

```ts
  name: tournamentNameInvariant.schema,
  format: z.enum(FORMATS),
});
```

with:

```ts
  name: tournamentNameInvariant.schema,
  format: z.enum(FORMATS),
  /**
   * The last day of the tournament, `YYYY-MM-DD` in UTC (R-21): it stays
   * on for the whole of that day (`dayAfter` is when its season ends).
   */
  endsOn: z.iso.date(),
  /** The admin's standings deadline round; null is the format's (ST-2). */
  standingsDeadlineRound: roundNumberSchema.nullable(),
  /** Survival is played (sportbet's `survival_game`). */
  survival: z.boolean(),
  /** The standings table entered is the final regular-season table (R-14). */
  standingsTableFinal: z.boolean(),
});
```

- [ ] **Step 4: CHECKs from range invariants, and their proof**

Replace the contents of `packages/db/src/invariant.ts` with:

```ts
import type { Invariant, RangeInvariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Further inputs, too many to list as examples, on which the domain and the
 * CHECK must also agree; the test entry (src/testing) generates them.
 */
export type InvariantSweep = 'every BMP character';

/**
 * A CHECK on one column that holds a domain invariant: a text rule
 * (`defineInvariant`) on a text column, or a whole-number range
 * (`defineRangeInvariant`) on a smallint, integer or numeric column. Each
 * area lists its own beside its table and builds the table's checks from
 * that list, so the constraint name is written once; `INVARIANT_CHECKS`
 * (src/schema.ts) gathers every area's list for the tests that prove them.
 */
export type InvariantCheck =
  | {
      readonly constraint: string;
      readonly column: AnyPgColumn;
      readonly invariant: Invariant;
      readonly sweep?: InvariantSweep;
    }
  | {
      readonly constraint: string;
      readonly column: AnyPgColumn;
      readonly invariant: RangeInvariant;
    };

/**
 * The CHECK constraint that holds `check.invariant` on `check.column`. A
 * text invariant: the column matches the pattern and, if the invariant has
 * one, is at most its maximum length - the only place a pattern is spliced
 * into SQL, and `defineInvariant` has already refused any pattern with a
 * quote, so the literal cannot break out. A range invariant: the column is
 * at least its minimum and, if it has one, at most its maximum - rendered
 * from integers `defineRangeInvariant` has validated, never from text.
 */
export function invariantCheck({
  constraint,
  column,
  invariant,
}: InvariantCheck) {
  if ('min' in invariant) {
    const atLeast = sql`${column} >= ${sql.raw(String(invariant.min))}`;
    return check(
      constraint,
      invariant.max === undefined
        ? atLeast
        : sql`${atLeast} and ${column} <= ${sql.raw(String(invariant.max))}`,
    );
  }
  const matches = sql`${column} ~ ${sql.raw(`'${invariant.pattern}'`)}`;
  return check(
    constraint,
    invariant.maxLength === undefined
      ? matches
      : sql`${matches} and char_length(${column}) <= ${sql.raw(String(invariant.maxLength))}`,
  );
}
```

Replace the contents of `packages/db/src/testing/invariant-check.ts` with:

```ts
import { everyBmpCharacter } from '@sportbet/domain/testing';
import { getTableName } from 'drizzle-orm';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { InvariantCheck, InvariantSweep } from '../invariant';

const SWEEPS: Readonly<Record<InvariantSweep, () => string[]>> = {
  'every BMP character': everyBmpCharacter,
};

/** A value a CHECK is asked about: text for a text invariant, a whole number for a range. */
type Candidate = string | number;

const expressions = z.array(z.object({ expression: z.string() }));
const columnTypes = z.array(
  z.object({ type: z.string(), text: z.boolean(), whole: z.boolean() }),
);
const verdicts = z.array(z.object({ holds: z.boolean() }));

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The column's SQL type, if an invariant CHECK can be evaluated on it: a
 * text invariant on text with the default collation, a range invariant on
 * smallint, integer or numeric. The values stand in for the column as that
 * type; on any other type or collation the verdict could differ from the
 * table's.
 */
async function candidateType(
  client: pg.Pool,
  { column, invariant }: InvariantCheck,
): Promise<string> {
  const table = getTableName(column.table);
  const described = await client.query(
    `select format_type(a.atttypid, a.atttypmod) as type,
            a.atttypid = 'text'::regtype
              and a.attcollation = (select oid from pg_collation where collname = 'default')
              as text,
            a.atttypid in ('smallint'::regtype, 'integer'::regtype, 'numeric'::regtype)
              as whole
     from pg_attribute a
     where a.attrelid = to_regclass(quote_ident($1)) and a.attname = $2
       and a.attnum > 0 and not a.attisdropped`,
    [table, column.name],
  );
  const [attribute] = columnTypes.parse(described.rows);
  if (attribute === undefined) {
    throw new Error(`table ${table} has no column ${column.name}`);
  }
  const range = 'min' in invariant;
  if (range ? !attribute.whole : !attribute.text) {
    throw new Error(
      `unsupported column ${table}.${column.name}: a text invariant CHECK is evaluated only on text with the default collation, a range invariant CHECK only on smallint, integer or numeric`,
    );
  }
  return attribute.type;
}

/**
 * The CHECK's verdict on each value, from the constraint as the migrated
 * database holds it (not as the TypeScript schema would build it). The
 * expression is evaluated over the values in one query, with each value
 * standing in for the column; like a CHECK, a null result counts as holding.
 */
async function checkVerdicts(
  client: pg.Pool,
  check: InvariantCheck,
  values: readonly Candidate[],
): Promise<boolean[]> {
  const { column, constraint } = check;
  const table = getTableName(column.table);
  const type = await candidateType(client, check);
  const found = await client.query(
    `select pg_get_expr(conbin, conrelid) as expression from pg_constraint
     where contype = 'c' and conname = $1 and conrelid = to_regclass(quote_ident($2))`,
    [constraint, table],
  );
  const [only, ...more] = expressions.parse(found.rows);
  if (only === undefined || more.length > 0) {
    throw new Error(`table ${table} has no CHECK named ${constraint}`);
  }
  const result = await client.query(
    `select coalesce((${only.expression}), true) as holds
     from unnest($1::${type}[]) with ordinality
       as candidate(${quoteIdentifier(column.name)}, invariant_check_ordinal)
     order by invariant_check_ordinal`,
    [values.map(String)],
  );
  return verdicts.parse(result.rows).map((row) => row.holds);
}

/** The values on which the domain schema and the database CHECK disagree. */
export async function invariantDisagreements(
  client: pg.Pool,
  check: InvariantCheck,
  values: readonly Candidate[],
): Promise<Candidate[]> {
  const database = await checkVerdicts(client, check, values);
  return values.filter(
    (value, index) =>
      check.invariant.schema.safeParse(value).success !== database[index],
  );
}

/** A value as code points, so an invisible character is readable in a failure. */
const codePoints = (value: Candidate) =>
  Array.from(
    String(value),
    (character) =>
      `U+${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`,
  ).join(' ');

interface Example {
  readonly label: string;
  readonly value: Candidate;
}

/**
 * Registers the tests that prove the domain schema and the database CHECK
 * accept and refuse exactly the same inputs: every example the invariant
 * carries, one test each, and the check's sweep if it has one - further
 * inputs on which the two sides only have to agree.
 */
export function describeInvariantCheck(
  client: pg.Pool,
  check: InvariantCheck,
): void {
  const { invariant, constraint } = check;
  const accepts: readonly Example[] = invariant.accepts;
  const refuses: readonly Example[] = invariant.refuses;
  const sweep = 'sweep' in check ? SWEEPS[check.sweep]() : undefined;
  const verdict = async (value: Candidate) => {
    const [holds] = await checkVerdicts(client, check, [value]);
    return {
      domain: invariant.schema.safeParse(value).success,
      database: holds,
    };
  };

  describe(`the ${invariant.name} invariant and CHECK ${constraint}`, () => {
    it.each(accepts)('both accept $label', async ({ value }) => {
      expect(await verdict(value)).toEqual({ domain: true, database: true });
    });

    it.each(refuses)('both refuse $label', async ({ value }) => {
      expect(await verdict(value)).toEqual({ domain: false, database: false });
    });

    if (sweep !== undefined) {
      it(`agree on ${String(sweep.length)} further inputs`, async () => {
        const disagreements = await invariantDisagreements(
          client,
          check,
          sweep,
        );
        expect(disagreements.map(codePoints)).toEqual([]);
      });
    }
  });
}
```

- [ ] **Step 5: The tournaments table, its query and the seed**

Replace the contents of `packages/db/src/tournament/schema.ts` with:

```ts
import {
  FORMATS,
  roundNumberInvariant,
  slugInvariant,
  tournamentNameInvariant,
} from '@sportbet/domain';
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';

/** Built from the domain's union, so the enum and the type cannot drift. */
export const formatEnum = pgEnum('format', FORMATS);

export const tournaments = pgTable(
  'tournaments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    format: formatEnum('format').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** sportbet's `end_date`: on for the whole of it, UTC (R-21). */
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    /** Null is the format's own deadline round (ST-2). */
    standingsDeadlineRound: smallint('standings_deadline_round'),
    /** sportbet's `survival_game`. */
    survival: boolean('survival').notNull(),
    /** `TeamOutcomes.tableIsFinal` (R-14); sportbet does not record it. */
    standingsTableFinal: boolean('standings_table_final')
      .notNull()
      .default(false),
  },
  // Drizzle calls this only when it reads the table's config, after the
  // list below exists.
  () => tournamentInvariantChecks.map(invariantCheck),
);

/** Every CHECK on `tournaments`: each holds a domain invariant. */
export const tournamentInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'tournaments_slug_format',
    column: tournaments.slug,
    invariant: slugInvariant,
  },
  {
    constraint: 'tournaments_name_not_blank',
    column: tournaments.name,
    invariant: tournamentNameInvariant,
    // The one place the two regex dialects are proven to draw the
    // blank-name line on exactly the same code points.
    sweep: 'every BMP character',
  },
  {
    constraint: 'tournaments_deadline_round_positive',
    column: tournaments.standingsDeadlineRound,
    invariant: roundNumberInvariant,
  },
];
```

In `packages/db/src/tournament/queries.ts`, replace:

```ts
  format: tournaments.format,
};
```

with:

```ts
  format: tournaments.format,
  endsOn: tournaments.endsOn,
  standingsDeadlineRound: tournaments.standingsDeadlineRound,
  survival: tournaments.survival,
  standingsTableFinal: tournaments.standingsTableFinal,
};
```

Replace the contents of `packages/db/src/seed/staging.ts` with:

```ts
import type { Db } from '../client';
import { insertTournaments, type NewTournament } from '../tournament/queries';

/** Staging's fake data. Never real players or real tournaments' results. */
export const STAGING_TOURNAMENTS: readonly NewTournament[] = [
  {
    slug: 'euroleague-2025-26',
    name: 'Euroleague 2025/26',
    format: 'euroleague',
    endsOn: '2026-05-24',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
  {
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    format: 'euroleague',
    endsOn: '2027-05-23',
    standingsDeadlineRound: null,
    survival: true,
    standingsTableFinal: false,
  },
];

export async function seedStaging(db: Db): Promise<void> {
  await insertTournaments(db, STAGING_TOURNAMENTS);
}
```

- [ ] **Step 6: Generate the migration, then backfill it**

```bash
pnpm --filter @sportbet/db db:generate --name tournament-season 2>&1 | tail -1
```

Expected: drizzle-kit reports the new file `migrations\0001_tournament-season.sql`. It adds `ends_on` and `survival` as `NOT NULL` straight away, which a table with rows refuses, so edit it: the two columns are added nullable, backfilled with the seed's own values, then set `NOT NULL`; every other statement is as generated.

Replace the contents of `packages/db/migrations/0001_tournament-season.sql` with:

```sql
ALTER TABLE "tournaments" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "standings_deadline_round" smallint;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "survival" boolean;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "standings_table_final" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-edited (drizzle-kit adds the two columns NOT NULL at once, which a
-- table with rows refuses): staging's seeded tournaments are the only rows
-- a database holds before this migration, so they get the seed's own values
-- (packages/db/src/seed/staging.ts); any other row stops the migration at
-- SET NOT NULL instead of being given a date nobody chose.
UPDATE "tournaments" SET "ends_on" = CASE "slug" WHEN 'euroleague-2025-26' THEN DATE '2026-05-24' WHEN 'euroleague-2026-27' THEN DATE '2027-05-23' END, "survival" = true;--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "ends_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "survival" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_deadline_round_positive" CHECK ("tournaments"."standings_deadline_round" >= 1);
```

- [ ] **Step 7: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm test:component 2>&1 | grep -E "Test Files|Tests "
pnpm build 2>&1 | grep -E "build: Done|rror"
pnpm test:feature 2>&1 | grep -E "Test Files|Tests "
```

(The feature tests run the production build, as CI runs them after `pnpm build`.)

Expected: lint and typecheck clean; `Tests  487 passed (487)` (29 files); db `Tests  52 passed (52)` (5 files); component `Tests  5 passed (5)` (4 files); every package's `build: Done`; feature `Tests  9 passed (9)` (3 files).

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/tournament packages/db apps/web/src/components apps/web/tests/feature/routes.test.ts
git commit -m "$(cat <<'EOF'
feat(db): tournaments carry their end date, deadline round, survival and final-table flag (#9)

Range invariants become CHECKs, proven on smallint, integer and numeric
columns; staging's seeded tournaments are backfilled by the migration.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The sportbet columns the reader still needs

`sportbetColumns` stays the one place sportbet's raw columns are read into the domain's stored rows. It gains `point_results` (DECIMAL text to points, refusing a third place), `point_standings` (the shortest text of a `double` to ten-thousandths, refusing a fifth place and a football column that is set), a survival pick with its event, a user (the id and the username, nothing else) and a tournament (its end date required, a format not yet ported refused). The existing odds column reads through `decimalUnits` too, so decimal text is parsed in one place.

**Files:**
- Modify: `packages/domain/src/stored/sportbet-columns.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/stored/sportbet-columns.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/domain/src/stored/sportbet-columns.test.ts`, replace:

```ts
import { StandingsPrediction } from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { sportbetRules } from '../rules/rule-set';
import {
```

with:

```ts
import { StandingsPrediction } from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';
import { sportbetRules } from '../rules/rule-set';
import {
```

In `packages/domain/src/stored/sportbet-columns.test.ts`, replace:

```ts
      expect(sportbetColumns.round({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});
```

with:

```ts
      expect(sportbetColumns.round({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});

describe('sportbet columns: point_results', () => {
  const row = {
    player: player('ada'),
    game: gameNo(2),
    winner_points: '0.00',
    difference_points: '-45.00',
    bingo_points: '0.00',
    odds: '1.59',
    odds_points: '0.00',
    full_points: '-45.00',
    streak_bonus: '0.00',
  };

  it('stored rows: a point_results row reads back exactly, a negative margin included', () => {
    const stored = unwrap(sportbetColumns.matchPointsRow(row));
    expect(stored.player).toBe(player('ada'));
    expect(stored.game).toBe(gameNo(2));
    expect(stored.points.margin.toString()).toBe('-45.00');
    expect(stored.points.full.toString()).toBe('-45.00');
    expect(stored.points.odds.toString()).toBe('1.59');
    expect(stored.points.oddsPoints.equals(Points.ZERO)).toBe(true);
    expect(stored.serija.equals(Points.ZERO)).toBe(true);
    expect(stored.points).not.toHaveProperty('extendsSerija');
  });

  it.each([
    [
      'a points column with three places',
      { full_points: '1.005' },
      'bad-points',
    ],
    [
      'a points column that is not a number',
      { winner_points: 'x' },
      'bad-points',
    ],
    ['negative odds', { odds: '-0.59' }, 'bad-odds'],
    ['odds with three places', { odds: '0.591' }, 'bad-odds'],
  ] as const)(
    'stored rows: a point_results row with %s is refused',
    (_, changes, refusal) => {
      expect(sportbetColumns.matchPointsRow({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});

describe('sportbet columns: point_standings', () => {
  const row = {
    player: player('ada'),
    team: team('ZAL'),
    group_position_points: '631.161',
    group_position_odds: '1',
    quarterfinal_points: '0',
    quarterfinal_odds: null,
    semifinal_points: null,
    semifinal_odds: null,
    final_points: null,
    final_odds: null,
    last16_points: null,
    last16_odds: null,
    last32_points: null,
    last32_odds: null,
  };

  it("stored rows: a point_standings row reads each double's text as four places, keeping null apart from 0", () => {
    const stored = unwrap(sportbetColumns.standingsPointsRow(row));
    expect(stored.place.points?.toString()).toBe('631.1610');
    expect(stored.place.odds?.toString()).toBe('1.0000');
    expect(stored.playOffs.points?.toString()).toBe('0.0000');
    expect(stored.playOffs.odds).toBeNull();
    expect(stored.finalFour).toEqual({ points: null, odds: null });
    expect(stored.final).toEqual({ points: null, odds: null });
  });

  it.each([
    ['last16_points', { last16_points: '0' }],
    ['last32_odds', { last32_odds: '1' }],
  ] as const)(
    "stored rows: a Euroleague row with football's %s set is refused",
    (_, changes) => {
      expect(
        sportbetColumns.standingsPointsRow({ ...row, ...changes }),
      ).toEqual(refuse('football-column-set'));
    },
  );

  it.each([
    ['a value needing a fifth place', { group_position_points: '0.12345' }],
    ['an exponent', { quarterfinal_points: '1e-05' }],
    ['negative odds', { group_position_odds: '-1' }],
  ] as const)(
    'stored rows: a point_standings row with %s is refused',
    (_, changes) => {
      expect(
        sportbetColumns.standingsPointsRow({ ...row, ...changes }),
      ).toEqual(refuse('bad-standings-points'));
    },
  );
});

describe('sportbet columns: prediction_survivals', () => {
  it("stored rows: a pick reads back as its event's round and its team, through SurvivalRun.stored", () => {
    const pick = unwrap(
      sportbetColumns.survivalPick({ team: team('FEN'), event_day: 1 }),
    );
    expect(pick).toEqual({ round: roundNo(1), team: team('FEN') });
    expect(unwrap(SurvivalRun.stored([pick])).picks).toEqual([pick]);
  });

  it('stored rows: a pick in an event with no positive event_day is refused', () => {
    expect(
      sportbetColumns.survivalPick({ team: team('FEN'), event_day: 0 }),
    ).toEqual(refuse('not-a-positive-integer'));
  });
});

describe('sportbet columns: users', () => {
  it('stored rows: a user reads back as its id, as text, and its username - nothing else', () => {
    expect(unwrap(sportbetColumns.player({ id: 7, username: 'ada' }))).toEqual({
      id: player('7'),
      username: 'ada',
    });
  });

  it.each([
    ['blank', '  '],
    ['longer than 255 characters', 'a'.repeat(256)],
  ])('stored rows: a username that is %s is refused', (_, username) => {
    expect(sportbetColumns.player({ id: 7, username })).toEqual(
      refuse('bad-username'),
    );
  });
});

describe('sportbet columns: tournaments', () => {
  const row = {
    id: 3,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    standings_format: 'euroleague',
    standings_deadline_round: null,
    end_date: '2027-05-23',
    survival_game: 1,
  };

  it('stored rows: a Euroleague tournament reads back with its end date, survival on and its table not final', () => {
    expect(unwrap(sportbetColumns.tournament(row))).toEqual({
      id: 3,
      slug: 'euroleague-2026-27',
      name: 'Euroleague 2026/27',
      format: 'euroleague',
      endsOn: '2027-05-23',
      standingsDeadlineRound: null,
      survival: true,
      standingsTableFinal: false,
    });
  });

  it("stored rows: an admin's deadline round is kept, and survival_game is read with (bool)", () => {
    const tournament = unwrap(
      sportbetColumns.tournament({
        ...row,
        standings_deadline_round: 6,
        survival_game: 0,
      }),
    );
    expect(tournament.standingsDeadlineRound).toBe(roundNo(6));
    expect(tournament.survival).toBe(false);
  });

  it.each([
    [
      'a football tournament',
      { standings_format: 'football' },
      'format-not-ported',
    ],
    ['no end date', { end_date: null }, 'tournament-without-end-date'],
    ['an impossible end date', { end_date: '2027-02-30' }, 'bad-end-date'],
    ['an uppercase slug', { slug: 'Euroleague' }, 'bad-slug'],
    ['a blank name', { name: ' ' }, 'bad-name'],
    [
      'a deadline round of 0',
      { standings_deadline_round: 0 },
      'bad-deadline-round',
    ],
  ] as const)(
    'stored rows: a tournament with %s is refused',
    (_, changes, refusal) => {
      expect(sportbetColumns.tournament({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/stored 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  24 failed | 34 passed (58)`: every new mapping is missing.

- [ ] **Step 3: Map the columns**

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
```

with:

```ts
import { z } from 'zod';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
import { z } from 'zod';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points } from '../points/points';
import type { StoredStatus } from '../player/player-status';
```

with:

```ts
import { z } from 'zod';
import { CrowdOdds } from '../odds/crowd-odds';
import { decimalUnits } from '../points/fixed-point';
import { Odds, StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import type { StoredStatus } from '../player/player-status';
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
import { Odds, StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import type { StoredStatus } from '../player/player-status';
import type { StoredPrediction } from '../prediction/match-prediction';
```

with:

```ts
import { Odds, StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { usernameInvariant, type StoredPlayer } from '../player/player';
import type { StoredStatus } from '../player/player-status';
import type { StoredPrediction } from '../prediction/match-prediction';
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
import type {
  GameOdds,
  StoredSurvivalRow,
} from '../recalculation/recalculation';
```

with:

```ts
import type {
  GameOdds,
  StoredMatchRow,
  StoredSurvivalRow,
} from '../recalculation/recalculation';
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
import { Rate } from '../score/score';
import {
  roundNumber,
  type GameId,
```

with:

```ts
import { Rate } from '../score/score';
import {
  playerId,
  roundNumber,
  type GameId,
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
  StoredTeamPick,
} from '../standings/standings-prediction';
import type { TeamOutcome } from '../standings/team-outcomes';
```

with:

```ts
  StoredTeamPick,
} from '../standings/standings-prediction';
import type {
  StandingsLine,
  StandingsRow,
} from '../standings/standings-scoring';
import type { TeamOutcome } from '../standings/team-outcomes';
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
} from '../standings/standings-scoring';
import type { TeamOutcome } from '../standings/team-outcomes';

/**
```

with:

```ts
} from '../standings/standings-scoring';
import type { TeamOutcome } from '../standings/team-outcomes';
import type { SurvivalPick } from '../survival/survival-fold';
import { FORMATS } from '../tournament/format';
import {
  slugSchema,
  tournamentNameInvariant,
  type Tournament,
} from '../tournament/tournament';

/**
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
 * - the 0/1/NULL ticks: 1 is ticked, 0 unticked, NULL never saved; a team's
 *   tick counts only as 1 (calculateKnockoutPoints).
 */
```

with:

```ts
 * - the 0/1/NULL ticks: 1 is ticked, 0 unticked, NULL never saved; a team's
 *   tick counts only as 1 (calculateKnockoutPoints).
 * - `point_results`: every column is DECIMAL(8,2), read as its exact text;
 *   the match points may be negative (MS-5), the odds never.
 * - `point_standings`: every column is a MySQL `double` (P15), read as
 *   the shortest text that reads back as the stored double. sportbet
 *   stores at most four places (R-31), so a value needing more is refused,
 *   never rounded. NULL is a stage nobody has reached (ST-6), kept apart
 *   from 0. The `last16_*` and `last32_*` columns are football's: always
 *   NULL in a Euroleague row, so a row with one set is refused.
 * - `prediction_survivals`: a row with an event is a pick for that
 *   event's round; a row with none is a "team not used yet" slot sportbet
 *   seeds per player, not a pick, and never reaches this mapping.
 * - `users`: only `id` and `username` are read (the id as the player's
 *   id, its decimal text); names, emails and sign-in columns never are.
 * - `tournaments`: `standings_format` names the format (a format not yet
 *   ported is refused, decision 11), `end_date` is the last day it is on
 *   (optional in sportbet, required here, R-21), `survival_game` is read
 *   with `(bool)`. sportbet does not record whether its table is the final
 *   one (R-14), so it reads back as not final.
 */
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
}

const FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];
```

with:

```ts
}

/** A `point_results` row: DECIMAL(8,2) columns as their exact text. */
export interface SportbetPointResultRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly winner_points: string;
  readonly difference_points: string;
  readonly bingo_points: string;
  readonly odds: string;
  readonly odds_points: string;
  readonly full_points: string;
  readonly streak_bonus: string;
}

/**
 * A `point_standings` row: each `double` column as the shortest text that
 * reads back as it (e.g. "631.161"), or null.
 */
export interface SportbetPointStandingsRow {
  readonly player: PlayerId;
  readonly team: TeamId;
  readonly group_position_points: string | null;
  readonly group_position_odds: string | null;
  readonly quarterfinal_points: string | null;
  readonly quarterfinal_odds: string | null;
  readonly semifinal_points: string | null;
  readonly semifinal_odds: string | null;
  readonly final_points: string | null;
  readonly final_odds: string | null;
  readonly last16_points: string | null;
  readonly last16_odds: string | null;
  readonly last32_points: string | null;
  readonly last32_odds: string | null;
}

/** A `prediction_survivals` row with an event: the pick's team and round. */
export interface SportbetPickRow {
  readonly team: TeamId;
  /** The pick's event's `event_day`. */
  readonly event_day: number;
}

/** The two `users` columns 2.2 reads, and never any other. */
export interface SportbetUserRow {
  readonly id: number;
  readonly username: string;
}

export interface SportbetTournamentRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly standings_format: string;
  readonly standings_deadline_round: number | null;
  /** `end_date` as `YYYY-MM-DD`; null when the admin set none. */
  readonly end_date: string | null;
  readonly survival_game: number;
}

export type SportbetTournamentRefusal =
  | 'format-not-ported'
  | 'tournament-without-end-date'
  | 'bad-end-date'
  | 'bad-slug'
  | 'bad-name'
  | 'bad-deadline-round';

const FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
function oddsColumn(value: string | null): Odds | null {
  if (value === null) return Odds.ZERO;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (match === null) return null;
  const hundredths =
    Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  const odds = Odds.ofHundredths(hundredths);
  return odds.ok ? odds.value : null;
}
```

with:

```ts
function oddsColumn(value: string | null): Odds | null {
  if (value === null) return Odds.ZERO;
  const hundredths = decimalUnits(value, 2);
  if (!hundredths.ok) return null;
  const odds = Odds.ofHundredths(hundredths.value);
  return odds.ok ? odds.value : null;
}
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
}

const tick = (value: number | null): boolean | null =>
  value === null ? null : value === 1;
```

with:

```ts
}

/** DECIMAL(8,2) text as points, exactly. */
function pointsColumn(value: string): Points | null {
  const hundredths = decimalUnits(value, 2);
  if (!hundredths.ok) return null;
  const points = Points.ofHundredths(hundredths.value);
  return points.ok ? points.value : null;
}

/** A `double` points and odds pair, as text, as one stored standings line. */
function standingsLine(
  points: string | null,
  odds: string | null,
): StandingsLine | null {
  let linePoints: StandingsPoints | null = null;
  if (points !== null) {
    const units = decimalUnits(points, 4);
    if (!units.ok) return null;
    const value = StandingsPoints.ofTenThousandths(units.value);
    if (!value.ok) return null;
    linePoints = value.value;
  }
  let lineOdds: StandingsOdds | null = null;
  if (odds !== null) {
    const units = decimalUnits(odds, 4);
    if (!units.ok) return null;
    const value = StandingsOdds.ofTenThousandths(units.value);
    if (!value.ok) return null;
    lineOdds = value.value;
  }
  return { points: linePoints, odds: lineOdds };
}

const isoDateSchema = z.iso.date();

const tick = (value: number | null): boolean | null =>
  value === null ? null : value === 1;
```

In `packages/domain/src/stored/sportbet-columns.ts`, replace:

```ts
  },

  teamOutcome(
    row: SportbetStandingsRow,
```

with:

```ts
  },

  matchPointsRow(
    row: SportbetPointResultRow,
  ): Result<StoredMatchRow, 'bad-points' | 'bad-odds'> {
    const winner = pointsColumn(row.winner_points);
    const margin = pointsColumn(row.difference_points);
    const bingo = pointsColumn(row.bingo_points);
    const oddsPoints = pointsColumn(row.odds_points);
    const full = pointsColumn(row.full_points);
    const serija = pointsColumn(row.streak_bonus);
    if (
      winner === null ||
      margin === null ||
      bingo === null ||
      oddsPoints === null ||
      full === null ||
      serija === null
    ) {
      return refuse('bad-points');
    }
    const hundredths = decimalUnits(row.odds, 2);
    const odds = hundredths.ok
      ? Odds.ofHundredths(hundredths.value)
      : hundredths;
    if (!odds.ok) {
      return refuse('bad-odds');
    }
    return ok({
      player: row.player,
      game: row.game,
      points: { winner, margin, bingo, oddsPoints, full, odds: odds.value },
      serija,
    });
  },

  standingsPointsRow(
    row: SportbetPointStandingsRow,
  ): Result<StandingsRow, 'bad-standings-points' | 'football-column-set'> {
    if (
      row.last16_points !== null ||
      row.last16_odds !== null ||
      row.last32_points !== null ||
      row.last32_odds !== null
    ) {
      return refuse('football-column-set');
    }
    const place = standingsLine(
      row.group_position_points,
      row.group_position_odds,
    );
    const playOffs = standingsLine(
      row.quarterfinal_points,
      row.quarterfinal_odds,
    );
    const finalFour = standingsLine(row.semifinal_points, row.semifinal_odds);
    const final = standingsLine(row.final_points, row.final_odds);
    if (
      place === null ||
      playOffs === null ||
      finalFour === null ||
      final === null
    ) {
      return refuse('bad-standings-points');
    }
    return ok({
      player: row.player,
      team: row.team,
      place,
      playOffs,
      finalFour,
      final,
    });
  },

  survivalPick(
    row: SportbetPickRow,
  ): Result<SurvivalPick, 'not-a-positive-integer'> {
    const round = roundNumber(row.event_day);
    return round.ok ? ok({ round: round.value, team: row.team }) : round;
  },

  player(row: SportbetUserRow): Result<StoredPlayer, 'bad-username'> {
    const id = playerId(String(row.id));
    if (!id.ok || !usernameInvariant.schema.safeParse(row.username).success) {
      return refuse('bad-username');
    }
    return ok({ id: id.value, username: row.username });
  },

  tournament(
    row: SportbetTournamentRow,
  ): Result<Tournament, SportbetTournamentRefusal> {
    const format = FORMATS.find((each) => each === row.standings_format);
    if (format === undefined) {
      return refuse('format-not-ported');
    }
    if (row.end_date === null) {
      return refuse('tournament-without-end-date');
    }
    const endsOn = isoDateSchema.safeParse(row.end_date);
    if (!endsOn.success) {
      return refuse('bad-end-date');
    }
    const slug = slugSchema.safeParse(row.slug);
    if (!slug.success) {
      return refuse('bad-slug');
    }
    if (!tournamentNameInvariant.schema.safeParse(row.name).success) {
      return refuse('bad-name');
    }
    let standingsDeadlineRound: RoundNumber | null = null;
    if (row.standings_deadline_round !== null) {
      const round = roundNumber(row.standings_deadline_round);
      if (!round.ok) {
        return refuse('bad-deadline-round');
      }
      standingsDeadlineRound = round.value;
    }
    return ok({
      id: row.id,
      slug: slug.data,
      name: row.name,
      format,
      endsOn: endsOn.data,
      standingsDeadlineRound,
      survival: row.survival_game !== 0,
      standingsTableFinal: false,
    });
  },

  teamOutcome(
    row: SportbetStandingsRow,
```

In `packages/domain/src/index.ts`, replace:

```ts
  type SportbetGameRow,
  type SportbetPredictionRow,
  type SportbetStandingsRow,
  type SportbetStatusRow,
  type SportbetSurvivalRow,
} from './stored/sportbet-columns';
```

with:

```ts
  type SportbetGameRow,
  type SportbetPickRow,
  type SportbetPointResultRow,
  type SportbetPointStandingsRow,
  type SportbetPredictionRow,
  type SportbetStandingsRow,
  type SportbetStatusRow,
  type SportbetSurvivalRow,
  type SportbetTournamentRefusal,
  type SportbetTournamentRow,
  type SportbetUserRow,
} from './stored/sportbet-columns';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  29 passed (29)` and `Tests  511 passed (511)`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "$(cat <<'EOF'
feat(domain): sportbetColumns reads point_results, point_standings, picks, users and tournaments (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The golden scenario moves into the test entry

The domain's golden test, the db suite and the reader's synthetic dump share one copy of sportbet's golden scenario: its raw rows (`GOLDEN`), the 25 Euroleague entries of `golden-points.json` (`GOLDEN_POINTS`) and the ruled differences (`GOLDEN_POINTS_RULED`), exported from `@sportbet/domain/testing`. The builders take the ids a consumer gives the scenario's names (`GoldenIds`): the domain uses the names themselves, a database uses numbers. The domain's golden assertions do not change.

**Files:**
- Modify: `packages/domain/src/golden/golden-scenario.ts`, `packages/domain/src/testing.ts`
- Test: `packages/domain/src/golden/golden.test.ts`

- [ ] **Step 1: Point the golden test at the shared copy**

Replace the contents of `packages/domain/src/golden/golden.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  goldenSnapshot,
  snapshotEntries,
} from './golden-scenario';

describe('golden master (sportbet)', () => {
  const snapshot = goldenSnapshot(sportbetRules);

  it('golden: holds the 25 Euroleague entries', () => {
    expect(snapshotEntries(GOLDEN_POINTS)).toBe(25);
    expect(snapshotEntries(snapshot)).toBe(25);
  });

  it('golden: reproduces every match points row', () => {
    expect(snapshot.point_results).toEqual(GOLDEN_POINTS.point_results);
  });

  it('golden: reproduces every standings row', () => {
    expect(snapshot.point_standings).toEqual(GOLDEN_POINTS.point_standings);
  });

  it('golden: reproduces every survival row', () => {
    expect(snapshot.point_survivals).toEqual(GOLDEN_POINTS.point_survivals);
  });

  it('golden: reproduces every game odds row', () => {
    expect(snapshot.game_odds).toEqual(GOLDEN_POINTS.game_odds);
  });

  it('golden: the stored odds and survival rows recalculate to themselves (CO-7, SU-10)', () => {
    // What the parity checker does with production: read the stored odds
    // and survival rows back, recalculate, and get every row it read.
    const stored = goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    });
    expect(goldenSnapshot(sportbetRules, stored)).toEqual(GOLDEN_POINTS);
  });
});

describe('golden master (ruled)', () => {
  it('golden (ruled): differs from sportbet exactly where the rulings say', () => {
    expect(goldenSnapshot(ruledRules)).toEqual(GOLDEN_POINTS_RULED);
  });

  it("golden (ruled): only ada's four standings rows change", () => {
    const changed = Object.keys(GOLDEN_POINTS.point_standings).filter(
      (key) =>
        JSON.stringify(GOLDEN_POINTS.point_standings[key]) !==
        JSON.stringify(GOLDEN_POINTS_RULED.point_standings[key]),
    );
    expect(changed).toEqual([
      'ada / ZAL',
      'ada / OLY',
      'ada / REA',
      'ada / FEN',
    ]);
    expect(GOLDEN_POINTS_RULED.point_standings['ada / OLY']).toMatchObject({
      group_position_points: '190.0000',
      group_position_odds: null,
      quarterfinal_points: '120.0000',
      quarterfinal_odds: '1.0000',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/domain exec vitest run src/golden 2>&1 | grep -E "FAIL|Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  8 failed (8)`: `golden-scenario.ts` exports no `GOLDEN_POINTS` yet.

- [ ] **Step 3: Move the scenario and export it**

Replace the contents of `packages/domain/src/golden/golden-scenario.ts` with:

```ts
// sportbet's golden scenario (tests/Support/GoldenScenario.php at 0da316f),
// its Euroleague part as raw rows (GOLDEN), the 25 Euroleague entries of
// sportbet's tests/Fixtures/golden-points.json (GOLDEN_POINTS), the
// differences the rulings make to them (GOLDEN_POINTS_RULED), and the
// domain inputs and snapshot built from them. Test support: the test entry
// (src/testing.ts) exports it, so the domain's golden test, the db suite
// and the reader's synthetic dump share one copy; index.ts does not. It uses
// no test helpers, because lint keeps runtime-looking files off `testing`.
//
// Tournaments are kept apart, so the football part of the scenario only
// proves that independence and is left out (catalogue, golden master
// mapping).

import { CrowdOdds } from '../odds/crowd-odds';
import { Odds, type StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import type { StandingsPoints } from '../points/standings-points';
import { MatchPrediction } from '../prediction/match-prediction';
import {
  recalculateTournament,
  type PointsRows,
  type StoredSurvivalRow,
  type TournamentInputs,
} from '../recalculation/recalculation';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { Season } from '../round/season';
import type { RuleSet } from '../rules/rule-set';
import {
  gameId,
  playerId,
  roundNumber,
  teamId,
  type GameId,
  type PlayerId,
  type TeamId,
} from '../shared/ids';
import { dayAfter, instantFrom } from '../shared/instant';
import type { Result } from '../shared/result';
import { Rate, Score } from '../score/score';
import {
  StandingsPrediction,
  type StoredTeamPick,
} from '../standings/standings-prediction';
import type { StandingsLine } from '../standings/standings-scoring';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';

function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`golden scenario refused: ${result.refusal}`);
  return result.value;
}

type Name = 'ada' | 'ben' | 'cai' | 'dan';
type TeamName = 'ZAL' | 'OLY' | 'REA' | 'FEN';

export interface GoldenGame {
  readonly id: 1 | 2 | 3;
  readonly round: 1 | 2;
  readonly home: TeamName;
  readonly away: TeamName;
  readonly tipOff: string;
  readonly result: readonly [number, number];
}

/** One saved standings row; a column not named was never saved (null). */
export interface GoldenStandingsRow {
  readonly team: TeamName;
  readonly place: number;
  readonly playOffs: boolean | null;
}

/**
 * The Euroleague part of sportbet's golden scenario, as the rows it stores
 * (GoldenScenario::euroleague). Names stand for ids: each consumer gives
 * them its own (GoldenIds).
 */
export const GOLDEN = Object.freeze({
  /** dan has no match predictions and no standings, only survival picks. */
  players: ['ada', 'ben', 'cai', 'dan'] as const satisfies readonly Name[],
  teams: ['ZAL', 'OLY', 'REA', 'FEN'] as const satisfies readonly TeamName[],
  /** Rate 1 and survival on; E2 is flagged knockout (MS-8). */
  rounds: [
    { number: 1, name: 'EL E1', knockout: false },
    { number: 2, name: 'EL E2', knockout: true },
  ] as const,
  /** The day after it is when the season ends. */
  endsOn: '2026-06-29',
  games: [
    {
      id: 1,
      round: 1,
      home: 'ZAL',
      away: 'OLY',
      tipOff: '2026-06-15T18:00:00Z',
      result: [88, 79],
    },
    {
      id: 2,
      round: 1,
      home: 'REA',
      away: 'FEN',
      tipOff: '2026-06-15T20:00:00Z',
      result: [70, 95],
    },
    {
      id: 3,
      round: 2,
      home: 'ZAL',
      away: 'FEN',
      tipOff: '2026-06-20T18:00:00Z',
      result: [90, 85],
    },
  ] as const satisfies readonly GoldenGame[],
  /** All real, none blank, so nobody is filled in. */
  predictions: [
    ['ada', 1, 85, 80],
    ['ada', 2, 120, 50],
    ['ada', 3, 90, 85],
    ['ben', 1, 79, 88],
    ['ben', 2, 80, 90],
    ['ben', 3, 85, 90],
    ['cai', 1, 90, 80],
    ['cai', 2, 75, 90],
    ['cai', 3, 95, 80],
  ] as const satisfies readonly (readonly [Name, 1 | 2 | 3, number, number])[],
  standings: [
    [
      'ada',
      [
        { team: 'ZAL', place: 1, playOffs: true },
        { team: 'OLY', place: 2, playOffs: true },
        { team: 'REA', place: 3, playOffs: null },
        { team: 'FEN', place: 4, playOffs: null },
      ],
    ],
    [
      'ben',
      [
        { team: 'ZAL', place: 2, playOffs: true },
        { team: 'OLY', place: 1, playOffs: null },
        { team: 'REA', place: 4, playOffs: true },
        { team: 'FEN', place: 3, playOffs: null },
      ],
    ],
  ] as const satisfies readonly (readonly [
    Name,
    readonly GoldenStandingsRow[],
  ])[],
  /** The table and play-off ticks as entered; no Final Four, no final. */
  outcomes: [
    { team: 'ZAL', place: 1, playOffs: true },
    { team: 'OLY', place: 2, playOffs: true },
    { team: 'REA', place: 3, playOffs: false },
    { team: 'FEN', place: 4, playOffs: false },
  ] as const,
  /** The table was entered after the last round: it is final. */
  tableIsFinal: true,
  /** Set directly, not through the lock. */
  survival: [
    [
      'ada',
      [
        [1, 'FEN'],
        [2, 'ZAL'],
      ],
    ],
    ['ben', [[1, 'FEN']]],
    [
      'dan',
      [
        [1, 'FEN'],
        [2, 'ZAL'],
      ],
    ],
  ] as const satisfies readonly (readonly [
    Name,
    readonly (readonly [1 | 2, TeamName])[],
  ])[],
});

export interface GoldenSnapshot {
  readonly point_results: Record<string, Record<string, string>>;
  readonly point_standings: Record<string, Record<string, string | null>>;
  readonly point_survivals: Record<string, Record<string, string>>;
  readonly game_odds: Record<string, Record<string, string>>;
}

const results = (
  winner: string,
  margin: string,
  bingo: string,
  full: string,
  odds: string,
  streak: string,
) => ({
  winner_points: winner,
  difference_points: margin,
  bingo_points: bingo,
  odds_points: '0.0000',
  full_points: full,
  odds,
  streak_bonus: streak,
});
const standings = (
  place: [string, string | null],
  playOffs: [string, string | null],
) => ({
  group_position_points: place[0],
  group_position_odds: place[1],
  quarterfinal_points: playOffs[0],
  quarterfinal_odds: playOffs[1],
  semifinal_points: null,
  semifinal_odds: null,
  final_points: null,
  final_odds: null,
  last16_points: null,
  last16_odds: null,
  last32_points: null,
  last32_odds: null,
});

/**
 * The 25 Euroleague entries of sportbet's tests/Fixtures/golden-points.json
 * at 0da316f, copied exactly: 9 point_results, 8 point_standings, 5
 * point_survivals and 3 game_odds.
 */
export const GOLDEN_POINTS: GoldenSnapshot = Object.freeze({
  point_results: {
    'ada / EL h1': results(
      '79.5000',
      '46.0000',
      '0.0000',
      '125.5000',
      '0.5900',
      '0.0000',
    ),
    'ada / EL h2': results(
      '0.0000',
      '-45.0000',
      '0.0000',
      '-45.0000',
      '1.5900',
      '0.0000',
    ),
    'ada / EL h3': results(
      '79.5000',
      '50.0000',
      '20.0000',
      '149.5000',
      '0.5900',
      '0.0000',
    ),
    'ben / EL h1': results(
      '0.0000',
      '32.0000',
      '0.0000',
      '32.0000',
      '1.5900',
      '0.0000',
    ),
    'ben / EL h2': results(
      '79.5000',
      '35.0000',
      '0.0000',
      '114.5000',
      '0.5900',
      '0.0000',
    ),
    'ben / EL h3': results(
      '0.0000',
      '40.0000',
      '0.0000',
      '40.0000',
      '0.0000',
      '0.0000',
    ),
    'cai / EL h1': results(
      '79.5000',
      '49.0000',
      '0.0000',
      '128.5000',
      '0.5900',
      '0.0000',
    ),
    'cai / EL h2': results(
      '79.5000',
      '40.0000',
      '0.0000',
      '119.5000',
      '0.5900',
      '10.0000',
    ),
    'cai / EL h3': results(
      '79.5000',
      '40.0000',
      '0.0000',
      '119.5000',
      '0.5900',
      '20.0000',
    ),
  },
  point_standings: {
    'ada / ZAL': standings(['380.0000', '1.0000'], ['60.0000', '0.0000']),
    'ada / OLY': standings(['380.0000', '1.0000'], ['60.0000', '0.0000']),
    'ada / REA': standings(['380.0000', '1.0000'], ['0.0000', null]),
    'ada / FEN': standings(['380.0000', '1.0000'], ['0.0000', null]),
    'ben / ZAL': standings(['180.0000', null], ['60.0000', '0.0000']),
    'ben / OLY': standings(['180.0000', null], ['0.0000', null]),
    'ben / REA': standings(['180.0000', null], ['0.0000', null]),
    'ben / FEN': standings(['180.0000', null], ['0.0000', null]),
  },
  point_survivals: {
    'ada / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'ada / EL E2': { survival_points: '22.0000', team_id: 'ZAL' },
    'ben / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'dan / EL E1': { survival_points: '12.0000', team_id: 'FEN' },
    'dan / EL E2': { survival_points: '22.0000', team_id: 'ZAL' },
  },
  game_odds: {
    'EL h1': { home_odds: '0.5900', away_odds: '1.5900', draw_odds: '2.5900' },
    'EL h2': { home_odds: '1.5900', away_odds: '0.5900', draw_odds: '2.5900' },
    'EL h3': { home_odds: '0.5900', away_odds: '1.5900', draw_odds: '2.5900' },
  },
});

/**
 * What the ruled set derives instead: five standings entries change, all
 * of ada's (catalogue, golden master). ST-4, R-35: positions get no crowd
 * bonus, so ada's four exact places pay the flat 190 with no odds. ST-5,
 * R-3, R-36: both standings players count, so ada's play-off tick on
 * Olympiacos (ticked by her alone) pays 60 x (1 + log2(2/1)). Survival does
 * not move: the pick-history fold agrees with sportbet's refold of its
 * result-entry rows here (SU-10, R-5).
 */
export const GOLDEN_POINTS_RULED: GoldenSnapshot = Object.freeze({
  ...GOLDEN_POINTS,
  point_standings: Object.fromEntries(
    Object.entries(GOLDEN_POINTS.point_standings).map(([key, row]) => [
      key,
      {
        ...row,
        ...(key.startsWith('ada / ')
          ? { group_position_points: '190.0000', group_position_odds: null }
          : {}),
        ...(key === 'ada / OLY'
          ? { quarterfinal_points: '120.0000', quarterfinal_odds: '1.0000' }
          : {}),
      },
    ]),
  ),
});

/**
 * The ids a consumer gives the scenario's names: the domain's own tests use
 * the names themselves (NAME_IDS); a database needs numbers.
 */
export interface GoldenIds {
  readonly player: (name: Name) => PlayerId;
  readonly team: (name: TeamName) => TeamId;
  readonly game: (id: 1 | 2 | 3) => GameId;
}

/** Each name as its own id, and each game as its golden number. */
export const NAME_IDS: GoldenIds = Object.freeze({
  player: (name: Name) => must(playerId(name)),
  team: (name: TeamName) => must(teamId(name)),
  game: (id: 1 | 2 | 3) => must(gameId(id)),
});

/**
 * Rows a golden snapshot holds, read back as the full recalculation reads
 * production's: the stored odds (CO-7) and the stored survival rows
 * (SU-10), in place of computing them from the votes and the picks.
 */
export interface GoldenStoredRows {
  readonly game_odds?: GoldenSnapshot['game_odds'];
  readonly point_survivals?: GoldenSnapshot['point_survivals'];
}

/** A non-negative "12.0000" or "0.5900" as hundredths, exactly. */
const hundredths = (fourPlaces: string | undefined): number => {
  const match = /^(\d+)\.(\d{2})00$/.exec(fourPlaces ?? '');
  if (match === null)
    throw new Error(`golden: bad column ${String(fourPlaces)}`);
  return Number(match[1]) * 100 + Number(match[2]);
};

/** "EL h2" as the golden game 2. */
const goldenGame = (key: string): 1 | 2 | 3 => {
  const found = GOLDEN.games.find(({ id }) => key === `EL h${String(id)}`);
  if (found === undefined) throw new Error(`golden: bad game key ${key}`);
  return found.id;
};

const nameOf = <N extends string>(names: readonly N[], value: string): N => {
  const found = names.find((name) => name === value);
  if (found === undefined) throw new Error(`golden: unknown name ${value}`);
  return found;
};

/** The stored odds rows of a snapshot, keyed by the consumer's game ids. */
export function goldenOdds(
  rows: GoldenSnapshot['game_odds'],
  ids: GoldenIds = NAME_IDS,
): ReadonlyMap<GameId, CrowdOdds> {
  return new Map(
    Object.entries(rows).map(([key, odds]) => [
      ids.game(goldenGame(key)),
      CrowdOdds.stored(
        must(Odds.ofHundredths(hundredths(odds['home_odds']))),
        must(Odds.ofHundredths(hundredths(odds['away_odds']))),
        must(Odds.ofHundredths(hundredths(odds['draw_odds']))),
      ),
    ]),
  );
}

/**
 * The stored survival rows of a snapshot, numbered from 1 in key order, as
 * the consumer's ids.
 */
export function goldenSurvivalRows(
  rows: GoldenSnapshot['point_survivals'],
  ids: GoldenIds = NAME_IDS,
): StoredSurvivalRow[] {
  return Object.entries(rows).map(([key, stored], index) => {
    const [name, round] = key.split(' / EL E');
    if (name === undefined || round === undefined) {
      throw new Error(`golden: bad survival key ${key}`);
    }
    return {
      id: index + 1,
      player: ids.player(nameOf(GOLDEN.players, name)),
      round: must(roundNumber(Number(round))),
      team: ids.team(nameOf(GOLDEN.teams, stored['team_id'] ?? '')),
      storedPoints: must(
        Points.ofHundredths(hundredths(stored['survival_points'])),
      ),
    };
  });
}

/**
 * The golden tournament's inputs, built from its stored rows. The odds come
 * from the votes and survival from the pick history, as result entry makes
 * them, unless `stored` gives the rows a full recalculation reads instead.
 */
export function goldenInputs(
  stored: GoldenStoredRows = {},
  ids: GoldenIds = NAME_IDS,
): TournamentInputs {
  const rounds = GOLDEN.rounds.map((round) =>
    Round.stored({
      number: must(roundNumber(round.number)),
      stage: 'regular',
      rate: Rate.ONE,
      survival: true,
      knockout: round.knockout,
    }),
  );
  const games = GOLDEN.games.map((spec) =>
    must(
      Game.stored({
        id: ids.game(spec.id),
        round: must(roundNumber(spec.round)),
        home: ids.team(spec.home),
        away: ids.team(spec.away),
        tipOff: must(instantFrom(spec.tipOff)),
        result: must(Score.of(spec.result[0], spec.result[1])),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  );
  const season = must(
    Season.create({ rounds, games, endsAt: must(dayAfter(GOLDEN.endsOn)) }),
  );
  const pick = (row: GoldenStandingsRow): StoredTeamPick => ({
    team: ids.team(row.team),
    place: row.place,
    playOffs: row.playOffs,
    finalFour: null,
    finalPlace: null,
  });

  return {
    season,
    players: GOLDEN.players.map((name) => ids.player(name)),
    predictions: GOLDEN.predictions.map(([name, game, home, away]) =>
      must(
        MatchPrediction.stored({
          player: ids.player(name),
          game: ids.game(game),
          home,
          away,
          origin: 'real',
          filledInAt: null,
        }),
      ),
    ),
    odds:
      stored.game_odds === undefined
        ? 'from-votes'
        : goldenOdds(stored.game_odds, ids),
    survival:
      stored.point_survivals === undefined
        ? {
            from: 'picks',
            runs: new Map(
              GOLDEN.survival.map(([name, picks]): [PlayerId, SurvivalRun] => [
                ids.player(name),
                must(
                  SurvivalRun.stored(
                    picks.map(([round, team]) => ({
                      round: must(roundNumber(round)),
                      team: ids.team(team),
                    })),
                  ),
                ),
              ]),
            ),
          }
        : {
            from: 'stored-rows',
            rows: goldenSurvivalRows(stored.point_survivals, ids),
          },
    standings: GOLDEN.standings.map(([name, rows]) =>
      must(StandingsPrediction.stored(ids.player(name), rows.map(pick))),
    ),
    outcomes: must(
      TeamOutcomes.stored(
        GOLDEN.outcomes.map((outcome) => ({
          team: ids.team(outcome.team),
          place: outcome.place,
          playOffs: outcome.playOffs,
          finalFour: false,
          finalPlace: null,
        })),
        GOLDEN.tableIsFinal,
      ),
    ),
  };
}

const four = (twoPlaces: { toString(): string }) => `${twoPlaces.toString()}00`;
const line = (value: StandingsPoints | StandingsOdds | null) =>
  value === null ? null : value.toString();
const columns = (name: string, standings: StandingsLine) => ({
  [`${name}_points`]: line(standings.points),
  [`${name}_odds`]: line(standings.odds),
});

/**
 * Stored points rows in golden-points.json's shape, each key and team named
 * back from the consumer's ids.
 */
export function snapshotOf(
  points: PointsRows,
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  const playerName = new Map(
    GOLDEN.players.map((name) => [ids.player(name), name]),
  );
  const teamName = new Map(GOLDEN.teams.map((name) => [ids.team(name), name]));
  const gameName = new Map(
    GOLDEN.games.map(({ id }) => [ids.game(id), `EL h${String(id)}`]),
  );
  const named = <K, V>(names: ReadonlyMap<K, V>, key: K): V => {
    const name = names.get(key);
    if (name === undefined)
      throw new Error(`golden: no name for ${String(key)}`);
    return name;
  };
  const snapshot: GoldenSnapshot = {
    point_results: {},
    point_standings: {},
    point_survivals: {},
    game_odds: {},
  };
  for (const { game, odds } of points.odds) {
    snapshot.game_odds[named(gameName, game)] = {
      home_odds: four(odds.home),
      away_odds: four(odds.away),
      draw_odds: four(odds.draw),
    };
  }
  for (const { player, game, points: match, serija } of points.matches) {
    snapshot.point_results[
      `${named(playerName, player)} / ${named(gameName, game)}`
    ] = {
      winner_points: four(match.winner),
      difference_points: four(match.margin),
      bingo_points: four(match.bingo),
      odds_points: four(match.oddsPoints),
      full_points: four(match.full),
      odds: four(match.odds),
      streak_bonus: four(serija),
    };
  }
  // Euroleague plays no last 16 or last 32: always null.
  for (const team of points.standings) {
    snapshot.point_standings[
      `${named(playerName, team.player)} / ${named(teamName, team.team)}`
    ] = {
      ...columns('group_position', team.place),
      ...columns('quarterfinal', team.playOffs),
      ...columns('semifinal', team.finalFour),
      ...columns('final', team.final),
      last16_points: null,
      last16_odds: null,
      last32_points: null,
      last32_odds: null,
    };
  }
  for (const survival of points.survival) {
    snapshot.point_survivals[
      `${named(playerName, survival.player)} / EL E${String(survival.round)}`
    ] = {
      survival_points:
        survival.points === null ? 'pending' : four(survival.points),
      team_id: named(teamName, survival.team),
    };
  }
  return snapshot;
}

/** The golden tournament recalculated under `rules`, as golden-points.json. */
export function goldenSnapshot(
  rules: RuleSet,
  inputs: TournamentInputs = goldenInputs(),
  ids: GoldenIds = NAME_IDS,
): GoldenSnapshot {
  return snapshotOf(must(recalculateTournament(inputs, rules)), ids);
}

/** How many entries a snapshot holds, over its four tables. */
export function snapshotEntries(snapshot: GoldenSnapshot): number {
  return (
    Object.keys(snapshot.point_results).length +
    Object.keys(snapshot.point_standings).length +
    Object.keys(snapshot.point_survivals).length +
    Object.keys(snapshot.game_odds).length
  );
}
```

In `packages/domain/src/testing.ts`, replace:

```ts
// enforces that (eslint.config.js). The invariants carry their own examples;
// this holds inputs too many to list, for sweeps on both sides, and the
// builders domain tests share.

import type { FillInDice } from './fill-in/fill-in';
```

with:

```ts
// enforces that (eslint.config.js). The invariants carry their own examples;
// this holds inputs too many to list, for sweeps on both sides, and the
// builders domain tests share, and sportbet's golden scenario.

import type { FillInDice } from './fill-in/fill-in';
```

In `packages/domain/src/testing.ts`, replace:

```ts
    finalFour: columns.finalFour ?? false,
    finalPlace: columns.finalPlace ?? null,
  };
}
```

with:

```ts
    finalFour: columns.finalFour ?? false,
    finalPlace: columns.finalPlace ?? null,
  };
}

// sportbet's golden scenario, shared by the domain's golden test, the db
// suite and the reader's synthetic dump (spec 2.2, tests).
export {
  GOLDEN,
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  goldenOdds,
  goldenSnapshot,
  goldenSurvivalRows,
  NAME_IDS,
  snapshotEntries,
  snapshotOf,
  type GoldenGame,
  type GoldenIds,
  type GoldenSnapshot,
  type GoldenStandingsRow,
  type GoldenStoredRows,
} from './golden/golden-scenario';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test:unit 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  29 passed (29)` and `Tests  512 passed (512)`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src
git commit -m "$(cat <<'EOF'
test(domain): the golden scenario and golden-points.json move into the test entry (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The core schema

Every table the Euroleague domain stores, each in its area's `schema.ts` with its keys, foreign keys (all `on delete restrict`) and CHECKs. Identity columns stay `generated always`, so saving a sportbet id is an explicit act. Composite foreign keys keep a game's round and teams, a survival pick's round and team, and a survival row's round and team in one tournament. Every single-column rule is an invariant CHECK listed in its area's `...InvariantChecks`; each rule that spans columns is a CHECK named in `NON_INVARIANT_CHECKS` with the stored factory that refuses the same row. The derived tables carry `source` (`points_source`) in their keys.

**Files:**
- Create: `packages/db/src/season/schema.ts`, `packages/db/src/team/schema.ts`, `packages/db/src/player/schema.ts`, `packages/db/src/prediction/schema.ts`, `packages/db/src/standings/schema.ts`, `packages/db/src/survival/schema.ts`, `packages/db/src/points/schema.ts`, `packages/db/migrations/0002_core-schema.sql` and `packages/db/migrations/meta/0002_snapshot.json` (generated)
- Modify: `packages/db/src/schema.ts`
- Test: `packages/db/test/schema.test.ts`, `packages/db/test/invariant-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

The schema test now covers every table's keys and cross-column CHECKs by constraint name, the stored shapes the tables must accept, and every enum against its domain constant.

Replace the contents of `packages/db/test/schema.test.ts` with:

```ts
import {
  FORMATS,
  PREDICTION_ORIGINS,
  RULE_SET_NAMES,
  STAGES,
} from '@sportbet/domain';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const run = (text: string, values: readonly unknown[] = []) =>
  client.query(text, [...values]);

const refusal = z.object({
  code: z.string(),
  constraint: z.string().optional(),
});

/**
 * What the database says to a statement: accepted, or the error code and
 * the constraint it was refused by.
 */
async function verdict(
  text: string,
  values: readonly unknown[] = [],
): Promise<'accepted' | z.infer<typeof refusal>> {
  try {
    await run(text, values);
    return 'accepted';
  } catch (error) {
    const { code, constraint } = refusal.parse(error);
    return { code, constraint };
  }
}

const refusedBy = (code: string, constraint: string) => ({ code, constraint });

const FOREIGN_KEY = '23503';
const UNIQUE = '23505';
const CHECK = '23514';

const insertTournament = (id: number, slug: string) =>
  run(
    `insert into tournaments (id, slug, name, format, ends_on, survival)
     overriding system value values ($1, $2, $2, 'euroleague', '2027-05-23', true)`,
    [id, slug],
  );

/**
 * Two tournaments: 1 has round 1 (id 10), teams 1, 2 and 3 and game 100
 * (1 v 2, unscored); 2 has round 1 (id 20) and team 4. Players 1 and 2.
 */
async function world(): Promise<void> {
  await insertTournament(1, 'euroleague-2026-27');
  await insertTournament(2, 'euroleague-2027-28');
  await run(
    `insert into rounds (id, tournament_id, number, name, stage, rate, survival, knockout)
     overriding system value values
       (10, 1, 1, '1 turas', 'regular', 1, true, false),
       (20, 2, 1, '1 turas', 'regular', 1, true, false)`,
  );
  await run(
    `insert into teams (id, tournament_id, name) overriding system value values
       (1, 1, 'Zalgiris'), (2, 1, 'Olympiacos'), (3, 1, 'Real'), (4, 2, 'Fenerbahce')`,
  );
  await run(
    `insert into games (id, tournament_id, round_id, home_team_id, away_team_id, tip_off)
     overriding system value values (100, 1, 10, 1, 2, '2026-10-02T18:00:00Z')`,
  );
  await run(
    `insert into players (id, username) overriding system value values (1, 'ada'), (2, 'ben')`,
  );
}

const GAME = `insert into games (id, tournament_id, round_id, home_team_id, away_team_id,
  tip_off, home_score, away_score, recorded_winner_id, postponed)
  overriding system value values ($1, $2, $3, $4, $5, '2026-10-02T18:00:00Z', $6, $7, $8, $9)`;
/** Game 101 of tournament 1's round 10: 1 v 3 unless told otherwise. */
const game = (changes: {
  id?: number;
  tournament?: number;
  round?: number;
  home?: number;
  away?: number;
  score?: readonly [number | null, number | null];
  winner?: number | null;
  postponed?: boolean;
}) => [
  changes.id ?? 101,
  changes.tournament ?? 1,
  changes.round ?? 10,
  changes.home ?? 1,
  changes.away ?? 3,
  changes.score?.[0] ?? null,
  changes.score?.[1] ?? null,
  changes.winner ?? null,
  changes.postponed ?? false,
];

// The invariant CHECKs are tested in invariant-checks.test.ts.
describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insertTournament(1, 'euroleague-2026-27'),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown format', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ('euroleague-2026-27', 'Euroleague', 'tennis', '2027-05-23', true)`,
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('rejects a duplicate slug', async () => {
    await insertTournament(1, 'euroleague-2026-27');
    await expect(
      insertTournament(2, 'euroleague-2026-27'),
    ).rejects.toMatchObject({
      code: UNIQUE,
      constraint: 'tournaments_slug_unique',
    });
  });

  it('rejects a tournament without an end date', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, survival)
         values ('euroleague-2026-27', 'Euroleague', 'euroleague', true)`,
      ),
    ).rejects.toMatchObject({ code: '23502', column: 'ends_on' });
  });
});

describe('rounds and teams constraints', () => {
  beforeEach(world);

  it('refuse a round of an unknown tournament', async () => {
    expect(
      await verdict(
        `insert into rounds (tournament_id, number, name, stage, rate, survival, knockout)
       values (9, 2, '2 turas', 'regular', 1, true, false)`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'rounds_tournament_fk'));
  });

  it('refuse a second round with the same number in one tournament', async () => {
    expect(
      await verdict(
        `insert into rounds (tournament_id, number, name, stage, rate, survival, knockout)
       values (1, 1, 'again', 'regular', 1, true, false)`,
        [],
      ),
    ).toEqual(refusedBy(UNIQUE, 'rounds_tournament_number_unique'));
  });

  it('refuse a team of an unknown tournament', async () => {
    expect(
      await verdict(
        `insert into teams (id, tournament_id, name) overriding system value values (9, 9, 'Nobody')`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'teams_tournament_fk'));
  });

  it("accept a stored team outcome's shared place and final place 3", async () => {
    expect(
      await verdict(`insert into team_outcomes (team_id, place, play_offs, final_four, final_place)
       values (1, 2, true, true, 3), (2, 2, true, false, null)`),
    ).toBe('accepted');
  });

  it('refuse an outcome of an unknown team', async () => {
    expect(
      await verdict(
        `insert into team_outcomes (team_id, place, play_offs, final_four) values (9, 1, true, true)`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'team_outcomes_team_fk'));
  });
});

describe('games constraints', () => {
  beforeEach(world);

  it('accept a valid game, and a level result (stored shape)', async () => {
    expect(await verdict(GAME, game({ score: [80, 80] }))).toBe('accepted');
  });

  it('refuse a round of another tournament', async () => {
    expect(await verdict(GAME, game({ round: 20 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_round_fk'),
    );
  });

  it('refuse a home team of another tournament', async () => {
    expect(await verdict(GAME, game({ home: 4 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_home_team_fk'),
    );
  });

  it('refuse an away team of another tournament', async () => {
    expect(await verdict(GAME, game({ away: 4 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_away_team_fk'),
    );
  });

  // A winner must be the home or the away team, and both are the game's
  // tournament's (the two composite foreign keys above), so a winner of
  // another tournament is refused by the CHECK; no foreign key is needed.
  it('refuse a recorded winner of another tournament', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 4 }))).toEqual(
      refusedBy(CHECK, 'games_winner_in_game'),
    );
  });

  it('refuse a second game of one round between the same teams', async () => {
    expect(await verdict(GAME, game({ home: 1, away: 2 }))).toEqual(
      refusedBy(UNIQUE, 'games_round_teams_unique'),
    );
  });

  it('games_teams_differ accepts two teams and refuses one team twice', async () => {
    expect(await verdict(GAME, game({ home: 3, away: 1 }))).toBe('accepted');
    expect(await verdict(GAME, game({ id: 102, home: 3, away: 3 }))).toEqual(
      refusedBy(CHECK, 'games_teams_differ'),
    );
  });

  it('games_result_both_or_neither accepts both scores and refuses one', async () => {
    expect(await verdict(GAME, game({ score: [88, 79] }))).toBe('accepted');
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [88, null] }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_result_both_or_neither'));
  });

  it('games_winner_needs_result accepts a winner with a result and refuses one without', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 1 }))).toBe(
      'accepted',
    );
    expect(
      await verdict(GAME, game({ id: 102, home: 2, away: 3, winner: 2 })),
    ).toEqual(refusedBy(CHECK, 'games_winner_needs_result'));
  });

  it('games_winner_in_game accepts a winner who played and refuses one who did not', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 3 }))).toBe(
      'accepted',
    );
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [80, 80], winner: 1 }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_winner_in_game'));
  });

  it('games_postponed_without_result accepts a postponed game without a result and refuses one with', async () => {
    expect(await verdict(GAME, game({ postponed: true }))).toBe('accepted');
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [88, 79], postponed: true }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_postponed_without_result'));
  });
});

describe('players constraints', () => {
  beforeEach(world);

  it('refuse a second player with the same username', async () => {
    expect(
      await verdict(
        `insert into players (id, username) overriding system value values (3, 'ada')`,
        [],
      ),
    ).toEqual(refusedBy(UNIQUE, 'players_username_unique'));
  });

  it('accept a tournament player, and refuse one twice or of an unknown player or tournament', async () => {
    const insert = `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins) values ($1, $2, false, 0)`;
    expect(await verdict(insert, [1, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1])).toEqual(
      refusedBy(UNIQUE, 'tournament_players_pk'),
    );
    expect(await verdict(insert, [1, 9])).toEqual(
      refusedBy(FOREIGN_KEY, 'tournament_players_player_fk'),
    );
    expect(await verdict(insert, [9, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'tournament_players_tournament_fk'),
    );
  });
});

const PREDICTION = `insert into match_predictions (player_id, game_id, home, away, origin, filled_in_at)
  values ($1, $2, $3, $4, $5, $6)`;

describe('match_predictions constraints', () => {
  beforeEach(world);

  it('accept a half-typed and a blank row (stored shape)', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, null, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [2, 100, null, null, 'real', null])).toBe(
      'accepted',
    );
  });

  it('refuse a second row for one player and game', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [1, 100, 80, 85, 'real', null])).toEqual(
      refusedBy(UNIQUE, 'match_predictions_pk'),
    );
  });

  it('refuse an unknown player or game', async () => {
    expect(await verdict(PREDICTION, [9, 100, 85, 80, 'real', null])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_predictions_player_fk'),
    );
    expect(await verdict(PREDICTION, [1, 999, 85, 80, 'real', null])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_predictions_game_fk'),
    );
  });

  it('match_predictions_not_level accepts two scores that differ and refuses a level pair', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [2, 100, 80, 80, 'real', null])).toEqual(
      refusedBy(CHECK, 'match_predictions_not_level'),
    );
  });

  it('match_predictions_fill_in_scored accepts a scored fill-in and refuses a half-typed one', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'fill-in', null])).toBe(
      'accepted',
    );
    expect(
      await verdict(PREDICTION, [2, 100, 85, null, 'fill-in', null]),
    ).toEqual(refusedBy(CHECK, 'match_predictions_fill_in_scored'));
  });

  it('match_predictions_fill_in_time accepts a fill-in time on a fill-in and refuses one on a real row', async () => {
    expect(
      await verdict(PREDICTION, [
        1,
        100,
        85,
        80,
        'late-fill-in',
        '2026-10-01T09:00:00Z',
      ]),
    ).toBe('accepted');
    expect(
      await verdict(PREDICTION, [
        2,
        100,
        85,
        80,
        'real',
        '2026-10-01T09:00:00Z',
      ]),
    ).toEqual(refusedBy(CHECK, 'match_predictions_fill_in_time'));
  });
});

describe('standings_predictions constraints', () => {
  beforeEach(world);

  const insert = `insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place)
    values ($1, $2, $3, $4, $5, $6)`;

  it("accept sportbet's place 0 and final place 3 (stored shape), and a saved unticked box", async () => {
    expect(await verdict(insert, [1, 1, 0, false, null, 3])).toBe('accepted');
  });

  it('refuse a second row for one player and team, and an unknown player or team', async () => {
    expect(await verdict(insert, [1, 1, 1, true, true, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1, 2, null, null, null])).toEqual(
      refusedBy(UNIQUE, 'standings_predictions_pk'),
    );
    expect(await verdict(insert, [9, 1, 1, null, null, null])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_predictions_player_fk'),
    );
    expect(await verdict(insert, [1, 9, 1, null, null, null])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_predictions_team_fk'),
    );
  });
});

describe('survival_picks constraints', () => {
  beforeEach(world);

  const insert = `insert into survival_picks (player_id, tournament_id, round_id, team_id) values ($1, $2, $3, $4)`;

  it('accept a pick, and refuse a second pick in one round', async () => {
    expect(await verdict(insert, [1, 1, 10, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1, 10, 2])).toEqual(
      refusedBy(UNIQUE, 'survival_picks_pk'),
    );
  });

  it('refuse a team or a round of another tournament, and an unknown player', async () => {
    expect(await verdict(insert, [1, 1, 10, 4])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_team_fk'),
    );
    expect(await verdict(insert, [1, 1, 20, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_round_fk'),
    );
    expect(await verdict(insert, [9, 1, 10, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_player_fk'),
    );
  });
});

describe('points tables constraints', () => {
  beforeEach(world);

  it('game_odds: accept one row per source and game, and refuse a second or an unknown game', async () => {
    const insert = `insert into game_odds (source, game_id, home, away, draw) values ($1, $2, 0.59, 1.59, 2.59)`;
    expect(await verdict(insert, ['production', 100])).toBe('accepted');
    expect(await verdict(insert, ['sportbet', 100])).toBe('accepted');
    expect(await verdict(insert, ['production', 100])).toEqual(
      refusedBy(UNIQUE, 'game_odds_pk'),
    );
    expect(await verdict(insert, ['ruled', 999])).toEqual(
      refusedBy(FOREIGN_KEY, 'game_odds_game_fk'),
    );
  });

  it('match_points: accept a negative margin, and refuse a second row or an unknown player or game', async () => {
    const insert = `insert into match_points (source, player_id, game_id, winner, margin, bingo, odds_points, "full", odds, serija)
      values ($1, $2, $3, 0, -45, 0, 0, -45, 1.59, 0)`;
    expect(await verdict(insert, ['production', 1, 100])).toBe('accepted');
    expect(await verdict(insert, ['production', 1, 100])).toEqual(
      refusedBy(UNIQUE, 'match_points_pk'),
    );
    expect(await verdict(insert, ['production', 9, 100])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_points_player_fk'),
    );
    expect(await verdict(insert, ['production', 1, 999])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_points_game_fk'),
    );
  });

  it('standings_points: accept null apart from 0, and refuse a second row or an unknown team', async () => {
    const insert = `insert into standings_points (source, player_id, team_id, place_points, place_odds, play_offs_points)
      values ($1, $2, $3, 631.161, 1, 0)`;
    expect(await verdict(insert, ['production', 1, 1])).toBe('accepted');
    expect(await verdict(insert, ['production', 1, 1])).toEqual(
      refusedBy(UNIQUE, 'standings_points_pk'),
    );
    expect(await verdict(insert, ['production', 9, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_points_player_fk'),
    );
    expect(await verdict(insert, ['production', 1, 9])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_points_team_fk'),
    );
  });
});

const SURVIVAL = `insert into survival_points (id, source, player_id, tournament_id, round_id, team_id, points, provisional, stored_row_id)
  overriding system value values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

describe('survival_points constraints', () => {
  beforeEach(world);

  it('accept two production rows for one player and round (the refold allows them)', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'production', 1, 1, 10, 1, 12, false, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [2, 'production', 1, 1, 10, 2, 0, false, null]),
    ).toBe('accepted');
  });

  it('survival_points_production_shape accepts a scored final production row and refuses a pending or provisional one', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'production', 1, 1, 10, 1, 12, false, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [
        2,
        'production',
        1,
        1,
        10,
        2,
        null,
        false,
        null,
      ]),
    ).toEqual(refusedBy(CHECK, 'survival_points_production_shape'));
    expect(
      await verdict(SURVIVAL, [3, 'production', 1, 1, 10, 2, 12, true, null]),
    ).toEqual(refusedBy(CHECK, 'survival_points_production_shape'));
  });

  it('survival_points_rewrites_production accepts a derived row that rewrites a production row and refuses a production row that does', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'production', 1, 1, 10, 1, 12, false, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [2, 'sportbet', 1, 1, 10, 1, 12, false, 1]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [3, 'production', 2, 1, 10, 1, 12, false, 1]),
    ).toEqual(refusedBy(CHECK, 'survival_points_rewrites_production'));
  });

  it('refuse a rewrite of a row that does not exist', async () => {
    expect(
      await verdict(SURVIVAL, [2, 'sportbet', 1, 1, 10, 1, 12, false, 99]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_stored_row_fk'));
  });

  it('refuse two rewrites of one stored row under one source', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'production', 1, 1, 10, 1, 12, false, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [2, 'sportbet', 1, 1, 10, 1, 12, false, 1]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [3, 'sportbet', 1, 1, 10, 1, 12, false, 1]),
    ).toEqual(refusedBy(UNIQUE, 'survival_points_stored_row_unique'));
  });

  it('refuse two rows scored from the picks for one player and round under one source', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'ruled', 1, 1, 10, 1, null, false, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [2, 'ruled', 1, 1, 10, 2, 10, false, null]),
    ).toEqual(refusedBy(UNIQUE, 'survival_points_pick_unique'));
  });

  it('refuse a team or a round of another tournament, and an unknown player', async () => {
    expect(
      await verdict(SURVIVAL, [1, 'ruled', 1, 1, 10, 4, 10, false, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_team_fk'));
    expect(
      await verdict(SURVIVAL, [1, 'ruled', 1, 1, 20, 1, 10, false, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_round_fk'));
    expect(
      await verdict(SURVIVAL, [1, 'ruled', 9, 1, 10, 1, 10, false, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_player_fk'));
  });
});

const enumValues = async (name: string) => {
  const result = await run(
    `select unnest(enum_range(null::${name}))::text as value`,
  );
  return z
    .array(z.object({ value: z.string() }))
    .parse(result.rows)
    .map((row) => row.value);
};

describe('enums', () => {
  it('format holds exactly the domain formats, in order', async () => {
    expect(await enumValues('format')).toEqual([...FORMATS]);
  });

  it('stage holds exactly the domain stages, in order', async () => {
    expect(await enumValues('stage')).toEqual([...STAGES]);
  });

  it('prediction_origin holds exactly the domain origins, in order', async () => {
    expect(await enumValues('prediction_origin')).toEqual([
      ...PREDICTION_ORIGINS,
    ]);
  });

  it('points_source holds production and the rule sets, in order', async () => {
    expect(await enumValues('points_source')).toEqual([
      'production',
      ...RULE_SET_NAMES,
    ]);
  });
});

describe('migrations', () => {
  it('are idempotent: applying them again changes nothing', async () => {
    await expect(
      runMigrations(url, MIGRATIONS_FOLDER),
    ).resolves.toBeUndefined();
  });

  it("give staging's seeded tournaments the seed's end dates when the season columns arrive", async () => {
    // A second database in the same container, migrated to 0000_init only,
    // holding the two rows staging holds today.
    const name = `backfill_${String(process.pid)}`;
    await run(`drop database if exists ${name}`);
    await run(`create database ${name}`);
    const other = new URL(url);
    other.pathname = `/${name}`;
    const initOnly = mkdtempSync(join(tmpdir(), 'migrations-'));
    mkdirSync(join(initOnly, 'meta'));
    copyFileSync(
      join(MIGRATIONS_FOLDER, '0000_init.sql'),
      join(initOnly, '0000_init.sql'),
    );
    const journal = z
      .object({ entries: z.array(z.object({ tag: z.string() }).loose()) })
      .loose()
      .parse(
        JSON.parse(
          readFileSync(
            join(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
            'utf8',
          ),
        ),
      );
    writeFileSync(
      join(initOnly, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    await runMigrations(other.href, initOnly);
    const staging = new pg.Client({ connectionString: other.href });
    await staging.connect();
    try {
      await staging.query(
        `insert into tournaments (slug, name, format) values
           ('euroleague-2025-26', 'Euroleague 2025/26', 'euroleague'),
           ('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague')`,
      );
      await runMigrations(other.href, MIGRATIONS_FOLDER);
      const result = await staging.query(
        `select slug, ends_on::text as ends_on, survival, standings_table_final
         from tournaments order by slug`,
      );
      expect(result.rows).toEqual([
        {
          slug: 'euroleague-2025-26',
          ends_on: '2026-05-24',
          survival: true,
          standings_table_final: false,
        },
        {
          slug: 'euroleague-2026-27',
          ends_on: '2027-05-23',
          survival: true,
          standings_table_final: false,
        },
      ]);
    } finally {
      await staging.end();
      await run(`drop database ${name}`);
    }
  });
});
```

In `packages/db/test/invariant-checks.test.ts`, replace:

```ts
/**
 * `table.constraint` of each CHECK in the database that holds no domain
 * invariant, each with the reason it cannot be one. Empty today: every CHECK
 * is built from an invariant and listed in INVARIANT_CHECKS.
 */
const NON_INVARIANT_CHECKS: readonly string[] = [];
```

with:

```ts
/**
 * `table.constraint` of each CHECK in the database that holds no domain
 * invariant, each with the reason it cannot be one: every one spans two or
 * more columns, so it is no one column's invariant. Each names the stored
 * factory that refuses the same row, and schema.test.ts proves it accepts
 * and refuses one row by name.
 */
const NON_INVARIANT_CHECKS: readonly string[] = [
  // Game.stored: same-team-twice.
  'games.games_teams_differ',
  // sportbetColumns.game: half-scored.
  'games.games_result_both_or_neither',
  // Game.stored: winner-without-result.
  'games.games_winner_needs_result',
  // Game.stored: winner-not-in-game.
  'games.games_winner_in_game',
  // Game.stored: postponed-with-result.
  'games.games_postponed_without_result',
  // MatchPrediction.stored: level.
  'match_predictions.match_predictions_not_level',
  // MatchPrediction.stored: fill-in-without-score.
  'match_predictions.match_predictions_fill_in_scored',
  // MatchPrediction.stored: real-with-fill-in-time.
  'match_predictions.match_predictions_fill_in_time',
  // A production row is a stored total: scored and final.
  'survival_points.survival_points_production_shape',
  // Only a derived row rewrites a production row (SurvivalPoints.storedId).
  'survival_points.survival_points_rewrites_production',
];
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Test Files  2 failed | 3 passed (5)` and `Tests  42 failed | 51 passed (93)`: the new tables and CHECKs do not exist.

- [ ] **Step 3: The tables**

Create `packages/db/src/team/schema.ts`:

```ts
import {
  outcomePlaceInvariant,
  storedFinalPlaceInvariant,
} from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  smallint,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

export const teams = pgTable(
  'teams',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    /** sportbet's `teams.team`, also the logo's file name. */
    name: text('name').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'teams_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    // The target of the composite foreign keys that keep a game's teams,
    // and a survival pick's team, in their round's tournament.
    unique('teams_tournament_id_id_unique').on(table.tournamentId, table.id),
  ],
);

/** A team's outcome (TeamOutcomes), one row per team. */
export const teamOutcomes = pgTable(
  'team_outcomes',
  {
    teamId: integer('team_id').primaryKey(),
    /** Null until the table is entered; sportbet's 0 maps to null. */
    place: smallint('place'),
    playOffs: boolean('play_offs').notNull(),
    finalFour: boolean('final_four').notNull(),
    finalPlace: smallint('final_place'),
  },
  (table) => [
    foreignKey({
      name: 'team_outcomes_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    ...teamInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `team_outcomes`: each holds a domain invariant. */
export const teamInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'team_outcomes_place_positive',
    column: teamOutcomes.place,
    invariant: outcomePlaceInvariant,
  },
  {
    constraint: 'team_outcomes_final_place_range',
    column: teamOutcomes.finalPlace,
    invariant: storedFinalPlaceInvariant,
  },
];
```

Create `packages/db/src/season/schema.ts`:

```ts
import {
  rateInvariant,
  roundNumberInvariant,
  scoreSideInvariant,
  STAGES,
} from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { teams } from '../team/schema';
import { tournaments } from '../tournament/schema';

/** Built from the domain's list, so the enum and the type cannot drift. */
export const stageEnum = pgEnum('stage', STAGES);

/** A tournament's rounds: sportbet's `events`. */
export const rounds = pgTable(
  'rounds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    /** sportbet's `event_day`: the domain's RoundNumber. */
    number: smallint('number').notNull(),
    /** sportbet's `events.event`, e.g. "1 turas"; display only. */
    name: text('name').notNull(),
    stage: stageEnum('stage').notNull(),
    rate: smallint('rate').notNull(),
    survival: boolean('survival').notNull(),
    knockout: boolean('knockout').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'rounds_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    // Season.create refuses a duplicate round.
    unique('rounds_tournament_number_unique').on(
      table.tournamentId,
      table.number,
    ),
    // The target of the composite foreign keys that keep a game, and a
    // survival pick, in its round's tournament.
    unique('rounds_tournament_id_id_unique').on(table.tournamentId, table.id),
    ...roundInvariantChecks.map(invariantCheck),
  ],
);

export const games = pgTable(
  'games',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    homeTeamId: integer('home_team_id').notNull(),
    awayTeamId: integer('away_team_id').notNull(),
    tipOff: timestamp('tip_off', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    homeScore: smallint('home_score'),
    awayScore: smallint('away_score'),
    /** sportbet's `game_winner_id` (MS-10). */
    recordedWinnerId: integer('recorded_winner_id'),
    /** R-41; false for every sportbet row. */
    postponed: boolean('postponed').notNull().default(false),
    /** R-13; null for every sportbet row. */
    lockedSince: timestamp('locked_since', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    // A game's round and both its teams are in one tournament (P17).
    foreignKey({
      name: 'games_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'games_home_team_fk',
      columns: [table.tournamentId, table.homeTeamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'games_away_team_fk',
      columns: [table.tournamentId, table.awayTeamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    // D16(c): one game per round and pair of teams.
    unique('games_round_teams_unique').on(
      table.roundId,
      table.homeTeamId,
      table.awayTeamId,
    ),
    // Game.stored: same-team-twice.
    check(
      'games_teams_differ',
      sql`${table.homeTeamId} <> ${table.awayTeamId}`,
    ),
    // sportbetColumns.game: half-scored.
    check(
      'games_result_both_or_neither',
      sql`(${table.homeScore} is null) = (${table.awayScore} is null)`,
    ),
    // Game.stored: winner-without-result.
    check(
      'games_winner_needs_result',
      sql`${table.recordedWinnerId} is null or ${table.homeScore} is not null`,
    ),
    // Game.stored: winner-not-in-game. With the two team keys above, it
    // also keeps the winner in the game's tournament.
    check(
      'games_winner_in_game',
      sql`${table.recordedWinnerId} is null or ${table.recordedWinnerId} in (${table.homeTeamId}, ${table.awayTeamId})`,
    ),
    // Game.stored: postponed-with-result.
    check(
      'games_postponed_without_result',
      sql`not ${table.postponed} or ${table.homeScore} is null`,
    ),
    ...gameInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `rounds`. */
export const roundInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'rounds_number_positive',
    column: rounds.number,
    invariant: roundNumberInvariant,
  },
  {
    constraint: 'rounds_rate_positive',
    column: rounds.rate,
    invariant: rateInvariant,
  },
];

/** Every invariant CHECK on `games`; its cross-column CHECKs are above. */
export const gameInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'games_home_score_not_negative',
    column: games.homeScore,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'games_away_score_not_negative',
    column: games.awayScore,
    invariant: scoreSideInvariant,
  },
];
```

Create `packages/db/src/player/schema.ts`:

```ts
import { fillInCountInvariant, usernameInvariant } from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { tournaments } from '../tournament/schema';

/**
 * A player: the id and the username, and nothing else in 2.2 - no name,
 * surname, email, Google id, locale, reminder setting or admin level.
 */
export const players = pgTable(
  'players',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Unique by exact text (P12: none duplicated in production); the case-
    // and accent-insensitive rule sign-in needs is the auth slice's.
    username: text('username').notNull().unique('players_username_unique'),
  },
  () => playerInvariantChecks.map(invariantCheck),
);

/** Who plays a tournament, and the status scoring needs there (R-7, R-19). */
export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    tournamentId: integer('tournament_id').notNull(),
    playerId: integer('player_id').notNull(),
    /** R-7's per-tournament switch; sportbet's one `user_settings.active`. */
    switchedOff: boolean('switched_off').notNull(),
    /** R-19; always false from sportbet, which cannot store a separate hide. */
    adminHidden: boolean('admin_hidden').notNull().default(false),
    /** The fill-ins counted toward switching off, in this tournament. */
    fillIns: integer('fill_ins').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'tournament_players_pk',
      columns: [table.tournamentId, table.playerId],
    }),
    foreignKey({
      name: 'tournament_players_tournament_fk',
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'tournament_players_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    ...tournamentPlayerInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `players`: each holds a domain invariant. */
export const playerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'players_username_format',
    column: players.username,
    invariant: usernameInvariant,
  },
];

/** Every CHECK on `tournament_players`: each holds a domain invariant. */
export const tournamentPlayerInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'tournament_players_fill_ins_not_negative',
    column: tournamentPlayers.fillIns,
    invariant: fillInCountInvariant,
  },
];
```

Create `packages/db/src/prediction/schema.ts`:

```ts
import { PREDICTION_ORIGINS, scoreSideInvariant } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { games } from '../season/schema';

/** Built from the domain's list, so the enum and the type cannot drift. */
export const predictionOriginEnum = pgEnum(
  'prediction_origin',
  PREDICTION_ORIGINS,
);

/**
 * One row per player and game (audit issue 15, built in). The stored shape
 * of MatchPrediction.stored: a half-typed row and a blank one are kept.
 */
export const matchPredictions = pgTable(
  'match_predictions',
  {
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    home: smallint('home'),
    away: smallint('away'),
    origin: predictionOriginEnum('origin').notNull(),
    /** Null for every sportbet row: it keeps no fill-in time (FI-4). */
    filledInAt: timestamp('filled_in_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({
      name: 'match_predictions_pk',
      columns: [table.playerId, table.gameId],
    }),
    foreignKey({
      name: 'match_predictions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_predictions_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    // MatchPrediction.stored: level.
    check(
      'match_predictions_not_level',
      sql`${table.home} is null or ${table.away} is null or ${table.home} <> ${table.away}`,
    ),
    // MatchPrediction.stored: fill-in-without-score.
    check(
      'match_predictions_fill_in_scored',
      sql`${table.origin} = 'real' or (${table.home} is not null and ${table.away} is not null)`,
    ),
    // MatchPrediction.stored: real-with-fill-in-time.
    check(
      'match_predictions_fill_in_time',
      sql`${table.origin} <> 'real' or ${table.filledInAt} is null`,
    ),
    ...predictionInvariantChecks.map(invariantCheck),
  ],
);

/** Every invariant CHECK on `match_predictions`. */
export const predictionInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'match_predictions_home_not_negative',
    column: matchPredictions.home,
    invariant: scoreSideInvariant,
  },
  {
    constraint: 'match_predictions_away_not_negative',
    column: matchPredictions.away,
    invariant: scoreSideInvariant,
  },
];
```

Create `packages/db/src/standings/schema.ts`:

```ts
import {
  predictedPlaceInvariant,
  storedFinalPlaceInvariant,
} from '@sportbet/domain';
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  smallint,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { teams } from '../team/schema';

/**
 * One player's standings row for one team. Null is a column never saved,
 * false a tick saved unticked (sportbet's 0/1/NULL).
 */
export const standingsPredictions = pgTable(
  'standings_predictions',
  {
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
    /** StandingsPrediction.stored keeps sportbet's place 0. */
    place: smallint('place'),
    playOffs: boolean('play_offs'),
    finalFour: boolean('final_four'),
    /** sportbet's 0 maps to null. */
    finalPlace: smallint('final_place'),
  },
  (table) => [
    primaryKey({
      name: 'standings_predictions_pk',
      columns: [table.playerId, table.teamId],
    }),
    foreignKey({
      name: 'standings_predictions_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'standings_predictions_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    ...standingsInvariantChecks.map(invariantCheck),
  ],
);

/** Every CHECK on `standings_predictions`: each holds a domain invariant. */
export const standingsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'standings_predictions_place_not_negative',
    column: standingsPredictions.place,
    invariant: predictedPlaceInvariant,
  },
  {
    constraint: 'standings_predictions_final_place_range',
    column: standingsPredictions.finalPlace,
    invariant: storedFinalPlaceInvariant,
  },
];
```

Create `packages/db/src/survival/schema.ts`:

```ts
import { foreignKey, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { players } from '../player/schema';
import { rounds } from '../season/schema';
import { teams } from '../team/schema';

/**
 * The survival pick history, one pick per player and round (R-5: never
 * deleted to record a loss). The team and the round are in one tournament.
 */
export const survivalPicks = pgTable(
  'survival_picks',
  {
    playerId: integer('player_id').notNull(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    teamId: integer('team_id').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'survival_picks_pk',
      columns: [table.playerId, table.roundId],
    }),
    foreignKey({
      name: 'survival_picks_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_picks_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_picks_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
  ],
);
```

Create `packages/db/src/points/schema.ts`:

```ts
import { oddsInvariant, RULE_SET_NAMES } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { invariantCheck, type InvariantCheck } from '../invariant';
import { players } from '../player/schema';
import { games, rounds } from '../season/schema';
import { teams } from '../team/schema';

/**
 * Whose points a row holds: production's own, as the reader read them (the
 * parity oracle, and an input: sportbet's full recalculation reads its
 * stored odds and refolds its stored survival rows), or what
 * recalculateTournament derives under one rule set. Built from the domain's
 * rule set names, so the enum and the type cannot drift.
 */
export const POINTS_SOURCES = ['production', ...RULE_SET_NAMES] as const;

export type PointsSource = (typeof POINTS_SOURCES)[number];

export const pointsSourceEnum = pgEnum('points_source', POINTS_SOURCES);

/** Hundredths, as Points, Odds and sportbet's DECIMAL(8,2). */
const hundredths = (name: string) => numeric(name, { precision: 8, scale: 2 });
/** Ten-thousandths, as StandingsPoints, StandingsOdds and R-31. */
const tenThousandths = (name: string) =>
  numeric(name, { precision: 10, scale: 4 });

/** `game_odds`: the odds each scored game was scored with. */
export const gameOdds = pgTable(
  'game_odds',
  {
    source: pointsSourceEnum('source').notNull(),
    gameId: integer('game_id').notNull(),
    home: hundredths('home').notNull(),
    away: hundredths('away').notNull(),
    draw: hundredths('draw').notNull(),
  },
  (table) => [
    primaryKey({ name: 'game_odds_pk', columns: [table.source, table.gameId] }),
    foreignKey({
      name: 'game_odds_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    ...gameOddsInvariantChecks.map(invariantCheck),
  ],
);

/** `point_results`: one prediction's points and its serija bonus. */
export const matchPoints = pgTable(
  'match_points',
  {
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    gameId: integer('game_id').notNull(),
    winner: hundredths('winner').notNull(),
    margin: hundredths('margin').notNull(),
    bingo: hundredths('bingo').notNull(),
    /** Always 0 (MS-7, #215); kept so the checker can compare it. */
    oddsPoints: hundredths('odds_points').notNull(),
    full: hundredths('full').notNull(),
    /** The odds the row was scored with. */
    odds: hundredths('odds').notNull(),
    /** `streak_bonus` (SE-3). */
    serija: hundredths('serija').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'match_points_pk',
      columns: [table.source, table.playerId, table.gameId],
    }),
    foreignKey({
      name: 'match_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_points_game_fk',
      columns: [table.gameId],
      foreignColumns: [games.id],
    }).onDelete('restrict'),
    ...matchPointsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * `point_standings`: one player's standings points for one team, a line
 * (points and odds) per stage; null is kept apart from 0 (ST-6).
 * sportbet's `last16_*` and `last32_*` are football's and not carried.
 */
export const standingsPoints = pgTable(
  'standings_points',
  {
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
    placePoints: tenThousandths('place_points'),
    placeOdds: tenThousandths('place_odds'),
    playOffsPoints: tenThousandths('play_offs_points'),
    playOffsOdds: tenThousandths('play_offs_odds'),
    finalFourPoints: tenThousandths('final_four_points'),
    finalFourOdds: tenThousandths('final_four_odds'),
    finalPoints: tenThousandths('final_points'),
    finalOdds: tenThousandths('final_odds'),
  },
  (table) => [
    primaryKey({
      name: 'standings_points_pk',
      columns: [table.source, table.playerId, table.teamId],
    }),
    foreignKey({
      name: 'standings_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'standings_points_team_fk',
      columns: [table.teamId],
      foreignColumns: [teams.id],
    }).onDelete('restrict'),
    ...standingsPointsInvariantChecks.map(invariantCheck),
  ],
);

/**
 * `point_survivals`, and the domain's SurvivalPoints. A production row
 * keeps sportbet's `point_survivals.id` as its id; a row a sportbet refold
 * derives names the production row it rewrites (`stored_row_id`).
 */
export const survivalPoints = pgTable(
  'survival_points',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    source: pointsSourceEnum('source').notNull(),
    playerId: integer('player_id').notNull(),
    tournamentId: integer('tournament_id').notNull(),
    roundId: integer('round_id').notNull(),
    teamId: integer('team_id').notNull(),
    /** Null only while a pick waits for its game (SU-8). */
    points: hundredths('points'),
    /** R-34. */
    provisional: boolean('provisional').notNull(),
    storedRowId: integer('stored_row_id'),
  },
  (table) => [
    foreignKey({
      name: 'survival_points_player_fk',
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_points_round_fk',
      columns: [table.tournamentId, table.roundId],
      foreignColumns: [rounds.tournamentId, rounds.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_points_team_fk',
      columns: [table.tournamentId, table.teamId],
      foreignColumns: [teams.tournamentId, teams.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'survival_points_stored_row_fk',
      columns: [table.storedRowId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    // The domain's refold may give two rows one player and round, so
    // production rows are unique by id alone; a rewrite of a stored row is
    // unique per source and stored row, and a row scored from the picks per
    // source, player and round.
    uniqueIndex('survival_points_stored_row_unique')
      .on(table.source, table.storedRowId)
      .where(sql`${table.storedRowId} is not null`),
    uniqueIndex('survival_points_pick_unique')
      .on(table.source, table.playerId, table.roundId)
      .where(
        sql`${table.storedRowId} is null and ${table.source} <> 'production'`,
      ),
    // A production row is a stored total: scored and final.
    check(
      'survival_points_production_shape',
      sql`${table.source} <> 'production' or (${table.points} is not null and not ${table.provisional})`,
    ),
    // Only a derived row rewrites a production row; one never rewrites.
    check(
      'survival_points_rewrites_production',
      sql`${table.storedRowId} is null or ${table.source} <> 'production'`,
    ),
  ],
);

/** Every CHECK on `game_odds`: each holds a domain invariant. */
export const gameOddsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'game_odds_home_not_negative',
    column: gameOdds.home,
    invariant: oddsInvariant,
  },
  {
    constraint: 'game_odds_away_not_negative',
    column: gameOdds.away,
    invariant: oddsInvariant,
  },
  {
    constraint: 'game_odds_draw_not_negative',
    column: gameOdds.draw,
    invariant: oddsInvariant,
  },
];

/** Every invariant CHECK on `match_points`: the points may be negative (MS-5). */
export const matchPointsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'match_points_odds_not_negative',
    column: matchPoints.odds,
    invariant: oddsInvariant,
  },
];

/** Every CHECK on `standings_points`: each holds a domain invariant. */
export const standingsPointsInvariantChecks: readonly InvariantCheck[] = [
  {
    constraint: 'standings_points_place_odds_not_negative',
    column: standingsPoints.placeOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_play_offs_odds_not_negative',
    column: standingsPoints.playOffsOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_final_four_odds_not_negative',
    column: standingsPoints.finalFourOdds,
    invariant: oddsInvariant,
  },
  {
    constraint: 'standings_points_final_odds_not_negative',
    column: standingsPoints.finalOdds,
    invariant: oddsInvariant,
  },
];
```

Replace the contents of `packages/db/src/schema.ts` with:

```ts
import type { InvariantCheck } from './invariant';
import {
  playerInvariantChecks,
  tournamentPlayerInvariantChecks,
} from './player/schema';
import {
  gameOddsInvariantChecks,
  matchPointsInvariantChecks,
  standingsPointsInvariantChecks,
} from './points/schema';
import { predictionInvariantChecks } from './prediction/schema';
import { gameInvariantChecks, roundInvariantChecks } from './season/schema';
import { standingsInvariantChecks } from './standings/schema';
import { teamInvariantChecks } from './team/schema';
import { tournamentInvariantChecks } from './tournament/schema';

// Every table, for the Drizzle client and for drizzle-kit.
export * from './player/schema';
export * from './points/schema';
export * from './prediction/schema';
export * from './season/schema';
export * from './standings/schema';
export * from './survival/schema';
export * from './team/schema';
export * from './tournament/schema';

/**
 * Every area's invariant CHECKs. The db tests prove each one against its
 * domain invariant, and fail on any CHECK in the database missing here.
 */
export const INVARIANT_CHECKS: readonly InvariantCheck[] = [
  ...tournamentInvariantChecks,
  ...roundInvariantChecks,
  ...gameInvariantChecks,
  ...teamInvariantChecks,
  ...playerInvariantChecks,
  ...tournamentPlayerInvariantChecks,
  ...predictionInvariantChecks,
  ...standingsInvariantChecks,
  ...gameOddsInvariantChecks,
  ...matchPointsInvariantChecks,
  ...standingsPointsInvariantChecks,
];
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm --filter @sportbet/db db:generate --name core-schema 2>&1 | tail -1
```

Expected: drizzle-kit reports the new file `migrations\0002_core-schema.sql`. It needs no hand edit (every table is new). So that it ends in a newline like every other file, write exactly what was generated:

Replace the contents of `packages/db/migrations/0002_core-schema.sql` with:

```sql
CREATE TYPE "public"."points_source" AS ENUM('production', 'sportbet', 'ruled');--> statement-breakpoint
CREATE TYPE "public"."prediction_origin" AS ENUM('real', 'fill-in', 'late-fill-in');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('regular', 'play-in', 'play-offs', 'final-four', 'final');--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" text NOT NULL,
	CONSTRAINT "players_username_unique" UNIQUE("username"),
	CONSTRAINT "players_username_format" CHECK ("players"."username" ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]' and char_length("players"."username") <= 255)
);
--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"switched_off" boolean NOT NULL,
	"admin_hidden" boolean DEFAULT false NOT NULL,
	"fill_ins" integer NOT NULL,
	CONSTRAINT "tournament_players_pk" PRIMARY KEY("tournament_id","player_id"),
	CONSTRAINT "tournament_players_fill_ins_not_negative" CHECK ("tournament_players"."fill_ins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "game_odds" (
	"source" "points_source" NOT NULL,
	"game_id" integer NOT NULL,
	"home" numeric(8, 2) NOT NULL,
	"away" numeric(8, 2) NOT NULL,
	"draw" numeric(8, 2) NOT NULL,
	CONSTRAINT "game_odds_pk" PRIMARY KEY("source","game_id"),
	CONSTRAINT "game_odds_home_not_negative" CHECK ("game_odds"."home" >= 0),
	CONSTRAINT "game_odds_away_not_negative" CHECK ("game_odds"."away" >= 0),
	CONSTRAINT "game_odds_draw_not_negative" CHECK ("game_odds"."draw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_points" (
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"winner" numeric(8, 2) NOT NULL,
	"margin" numeric(8, 2) NOT NULL,
	"bingo" numeric(8, 2) NOT NULL,
	"odds_points" numeric(8, 2) NOT NULL,
	"full" numeric(8, 2) NOT NULL,
	"odds" numeric(8, 2) NOT NULL,
	"serija" numeric(8, 2) NOT NULL,
	CONSTRAINT "match_points_pk" PRIMARY KEY("source","player_id","game_id"),
	CONSTRAINT "match_points_odds_not_negative" CHECK ("match_points"."odds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "standings_points" (
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place_points" numeric(10, 4),
	"place_odds" numeric(10, 4),
	"play_offs_points" numeric(10, 4),
	"play_offs_odds" numeric(10, 4),
	"final_four_points" numeric(10, 4),
	"final_four_odds" numeric(10, 4),
	"final_points" numeric(10, 4),
	"final_odds" numeric(10, 4),
	CONSTRAINT "standings_points_pk" PRIMARY KEY("source","player_id","team_id"),
	CONSTRAINT "standings_points_place_odds_not_negative" CHECK ("standings_points"."place_odds" >= 0),
	CONSTRAINT "standings_points_play_offs_odds_not_negative" CHECK ("standings_points"."play_offs_odds" >= 0),
	CONSTRAINT "standings_points_final_four_odds_not_negative" CHECK ("standings_points"."final_four_odds" >= 0),
	CONSTRAINT "standings_points_final_odds_not_negative" CHECK ("standings_points"."final_odds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "survival_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "survival_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "points_source" NOT NULL,
	"player_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"points" numeric(8, 2),
	"provisional" boolean NOT NULL,
	"stored_row_id" integer,
	CONSTRAINT "survival_points_production_shape" CHECK ("survival_points"."source" <> 'production' or ("survival_points"."points" is not null and not "survival_points"."provisional")),
	CONSTRAINT "survival_points_rewrites_production" CHECK ("survival_points"."stored_row_id" is null or "survival_points"."source" <> 'production')
);
--> statement-breakpoint
CREATE TABLE "match_predictions" (
	"player_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"home" smallint,
	"away" smallint,
	"origin" "prediction_origin" NOT NULL,
	"filled_in_at" timestamp with time zone,
	CONSTRAINT "match_predictions_pk" PRIMARY KEY("player_id","game_id"),
	CONSTRAINT "match_predictions_not_level" CHECK ("match_predictions"."home" is null or "match_predictions"."away" is null or "match_predictions"."home" <> "match_predictions"."away"),
	CONSTRAINT "match_predictions_fill_in_scored" CHECK ("match_predictions"."origin" = 'real' or ("match_predictions"."home" is not null and "match_predictions"."away" is not null)),
	CONSTRAINT "match_predictions_fill_in_time" CHECK ("match_predictions"."origin" <> 'real' or "match_predictions"."filled_in_at" is null),
	CONSTRAINT "match_predictions_home_not_negative" CHECK ("match_predictions"."home" >= 0),
	CONSTRAINT "match_predictions_away_not_negative" CHECK ("match_predictions"."away" >= 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"tip_off" timestamp with time zone NOT NULL,
	"home_score" smallint,
	"away_score" smallint,
	"recorded_winner_id" integer,
	"postponed" boolean DEFAULT false NOT NULL,
	"locked_since" timestamp with time zone,
	CONSTRAINT "games_round_teams_unique" UNIQUE("round_id","home_team_id","away_team_id"),
	CONSTRAINT "games_teams_differ" CHECK ("games"."home_team_id" <> "games"."away_team_id"),
	CONSTRAINT "games_result_both_or_neither" CHECK (("games"."home_score" is null) = ("games"."away_score" is null)),
	CONSTRAINT "games_winner_needs_result" CHECK ("games"."recorded_winner_id" is null or "games"."home_score" is not null),
	CONSTRAINT "games_winner_in_game" CHECK ("games"."recorded_winner_id" is null or "games"."recorded_winner_id" in ("games"."home_team_id", "games"."away_team_id")),
	CONSTRAINT "games_postponed_without_result" CHECK (not "games"."postponed" or "games"."home_score" is null),
	CONSTRAINT "games_home_score_not_negative" CHECK ("games"."home_score" >= 0),
	CONSTRAINT "games_away_score_not_negative" CHECK ("games"."away_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"number" smallint NOT NULL,
	"name" text NOT NULL,
	"stage" "stage" NOT NULL,
	"rate" smallint NOT NULL,
	"survival" boolean NOT NULL,
	"knockout" boolean NOT NULL,
	CONSTRAINT "rounds_tournament_number_unique" UNIQUE("tournament_id","number"),
	CONSTRAINT "rounds_tournament_id_id_unique" UNIQUE("tournament_id","id"),
	CONSTRAINT "rounds_number_positive" CHECK ("rounds"."number" >= 1),
	CONSTRAINT "rounds_rate_positive" CHECK ("rounds"."rate" >= 1)
);
--> statement-breakpoint
CREATE TABLE "standings_predictions" (
	"player_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"place" smallint,
	"play_offs" boolean,
	"final_four" boolean,
	"final_place" smallint,
	CONSTRAINT "standings_predictions_pk" PRIMARY KEY("player_id","team_id"),
	CONSTRAINT "standings_predictions_place_not_negative" CHECK ("standings_predictions"."place" >= 0),
	CONSTRAINT "standings_predictions_final_place_range" CHECK ("standings_predictions"."final_place" >= 1 and "standings_predictions"."final_place" <= 4)
);
--> statement-breakpoint
CREATE TABLE "survival_picks" (
	"player_id" integer NOT NULL,
	"tournament_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	CONSTRAINT "survival_picks_pk" PRIMARY KEY("player_id","round_id")
);
--> statement-breakpoint
CREATE TABLE "team_outcomes" (
	"team_id" integer PRIMARY KEY NOT NULL,
	"place" smallint,
	"play_offs" boolean NOT NULL,
	"final_four" boolean NOT NULL,
	"final_place" smallint,
	CONSTRAINT "team_outcomes_place_positive" CHECK ("team_outcomes"."place" >= 1),
	CONSTRAINT "team_outcomes_final_place_range" CHECK ("team_outcomes"."final_place" >= 1 and "team_outcomes"."final_place" <= 4)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "teams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "teams_tournament_id_id_unique" UNIQUE("tournament_id","id")
);
--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_odds" ADD CONSTRAINT "game_odds_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_points" ADD CONSTRAINT "match_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_points" ADD CONSTRAINT "match_points_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_points" ADD CONSTRAINT "standings_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_points" ADD CONSTRAINT "standings_points_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_team_fk" FOREIGN KEY ("tournament_id","team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_points" ADD CONSTRAINT "survival_points_stored_row_fk" FOREIGN KEY ("stored_row_id") REFERENCES "public"."survival_points"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_game_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_fk" FOREIGN KEY ("tournament_id","home_team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_fk" FOREIGN KEY ("tournament_id","away_team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_predictions" ADD CONSTRAINT "standings_predictions_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_predictions" ADD CONSTRAINT "standings_predictions_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_round_fk" FOREIGN KEY ("tournament_id","round_id") REFERENCES "public"."rounds"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survival_picks" ADD CONSTRAINT "survival_picks_team_fk" FOREIGN KEY ("tournament_id","team_id") REFERENCES "public"."teams"("tournament_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_outcomes" ADD CONSTRAINT "team_outcomes_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survival_points_stored_row_unique" ON "survival_points" USING btree ("source","stored_row_id") WHERE "survival_points"."stored_row_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "survival_points_pick_unique" ON "survival_points" USING btree ("source","player_id","round_id") WHERE "survival_points"."stored_row_id" is null and "survival_points"."source" <> 'production';
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  5 passed (5)` and `Tests  167 passed (167)`.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): the core schema - rounds, games, teams, players, predictions, picks and points (#9)

Every single-column rule is a CHECK built from a domain invariant; every
rule that spans columns is a named CHECK mirroring its stored factory.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The repositories' edge, and saving a tournament under its own id

Every repository function takes the database or a transaction first (`Executor`). The helpers every area shares live in one module, `edge.ts`: a stored row the domain refuses is a thrown error naming the table, the key and the refusal (a bad row is a bug to see); integer keys become the domain's text ids and back; `numeric` text becomes exact units through `decimalUnits`; upserts use `excluded`; writes go in chunks under Postgres's parameter limit. `saveTournament` inserts under the tournament's own id (`overriding system value`) or updates it, and `advanceIdentitySequences` moves every identity sequence past the saved ids. The tournament area's `queries.ts` becomes `repository.ts`, as every other area's is.

**Files:**
- Create: `packages/db/src/edge.ts`, `packages/db/src/identity.ts`
- Rename: `packages/db/src/tournament/queries.ts` to `packages/db/src/tournament/repository.ts`
- Modify: `packages/db/src/client.ts`, `packages/db/src/seed/staging.ts`, `packages/db/src/index.ts`
- Test: `packages/db/test/tournament.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the contents of `packages/db/test/tournament.test.ts` with:

```ts
import {
  newTournamentSchema,
  roundNumber,
  type Tournament,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  advanceIdentitySequences,
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from '../src';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

const euroleagueA: NewTournament = {
  slug: 'euroleague-2025-26',
  name: 'Euroleague 2025/26',
  format: 'euroleague',
  endsOn: '2026-05-24',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};
const euroleagueB: NewTournament = {
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: unwrap(roundNumber(6)),
  survival: false,
  standingsTableFinal: true,
};

/** A listed tournament without its generated id. */
const withoutId = (tournament: Tournament): NewTournament =>
  newTournamentSchema.parse(tournament);

describe('listTournaments', () => {
  it('returns nothing from an empty table', async () => {
    expect(await listTournaments(db)).toEqual([]);
  });

  it('returns every tournament with every column, ordered by name', async () => {
    await insertTournaments(db, [euroleagueB, euroleagueA]);
    const listed = await listTournaments(db);
    expect(listed.map(withoutId)).toEqual([euroleagueA, euroleagueB]);
    expect(listed.every((t) => Number.isInteger(t.id) && t.id > 0)).toBe(true);
  });
});

describe('findTournamentBySlug', () => {
  it('finds a stored tournament', async () => {
    await insertTournaments(db, [euroleagueA, euroleagueB]);
    const found = await findTournamentBySlug(db, 'euroleague-2026-27');
    expect(found === undefined ? undefined : withoutId(found)).toEqual(
      euroleagueB,
    );
  });

  it('returns undefined for an unknown slug', async () => {
    await insertTournaments(db, [euroleagueA]);
    expect(await findTournamentBySlug(db, 'nope')).toBeUndefined();
  });
});

describe('insertTournaments', () => {
  it('keeps the existing row when a slug is inserted again', async () => {
    await insertTournaments(db, [euroleagueA]);
    await insertTournaments(db, [{ ...euroleagueA, name: 'Renamed' }]);
    expect((await listTournaments(db)).map(withoutId)).toEqual([euroleagueA]);
  });

  it('does nothing for an empty list', async () => {
    await insertTournaments(db, []);
    expect(await listTournaments(db)).toEqual([]);
  });
});

describe('saveTournament', () => {
  const saved: Tournament = { id: 7, ...euroleagueB };

  it('saves a tournament under its own id and reads it back unchanged', async () => {
    await saveTournament(db, saved);
    expect(await findTournamentBySlug(db, saved.slug)).toEqual(saved);
  });

  it('updates the row with that id when saved again', async () => {
    await saveTournament(db, saved);
    await saveTournament(db, { ...saved, name: 'Euroleague 2026-27' });
    expect(await listTournaments(db)).toEqual([
      { ...saved, name: 'Euroleague 2026-27' },
    ]);
  });

  it('moves the id sequence past a saved id, so a generated id never collides', async () => {
    await saveTournament(db, saved);
    await advanceIdentitySequences(db);
    await insertTournaments(db, [euroleagueA]);
    const generated = await findTournamentBySlug(db, euroleagueA.slug);
    expect(generated?.id).toBe(8);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/tournament.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  3 failed | 6 passed (9)`, each failure `TypeError: saveTournament is not a function`.

- [ ] **Step 3: The executor type, the edge helpers and the identity sequences**

In `packages/db/src/client.ts`, replace:

```ts
export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Db;
```

with:

```ts
export type Db = NodePgDatabase<typeof schema>;

/** A transaction on a Db, as `db.transaction` hands it to its callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What every repository function runs on: the database, or a transaction. */
export type Executor = Db | Tx;

export interface DbHandle {
  readonly db: Db;
```

Create `packages/db/src/edge.ts`:

```ts
import {
  decimalUnits,
  gameId,
  instantFrom,
  playerId,
  teamId,
  type GameId,
  type Instant,
  type PlayerId,
  type Result,
  type TeamId,
} from '@sportbet/domain';
import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/**
 * What a repository does with a stored row the domain refuses: throws,
 * naming the table, the row's key and the refusal. The CHECKs make such a
 * row unreachable in practice, so one is a bug to see, not to hide.
 */
export function stored<T, R extends string>(
  result: Result<T, R>,
  table: string,
  key: string | number,
): T {
  if (!result.ok) {
    throw new Error(
      `${table} ${String(key)}: the domain refuses the stored row (${result.refusal})`,
    );
  }
  return result.value;
}

/** A database id as the domain's text id: its decimal text. */
const databaseId = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .transform(Number)
  .pipe(z.int().max(2_147_483_647));

/**
 * The integer key a domain id stands for. A team or player id that is not
 * a database id (a test's 'ZAL') cannot be saved: a programmer error.
 */
export function keyOf(id: string, what: string): number {
  const parsed = databaseId.safeParse(id);
  if (!parsed.success) {
    throw new Error(`${what} ${id} is not a database id`);
  }
  return parsed.data;
}

export const teamOf = (id: number): TeamId =>
  stored(teamId(String(id)), 'teams', id);
export const playerOf = (id: number): PlayerId =>
  stored(playerId(String(id)), 'players', id);
export const gameOf = (id: number): GameId => stored(gameId(id), 'games', id);

/** A `timestamptz` read back as the domain's instant, to the second. */
export function instantOf(date: Date, table: string, key: string): Instant {
  return stored(
    instantFrom(date.toISOString().replace(/\.000Z$/, 'Z')),
    table,
    key,
  );
}

/**
 * A `numeric` column's text as whole units with `places` decimals: exact,
 * and a value with more places than the column is refused (decimalUnits).
 */
export function unitsOf(
  text: string,
  places: number,
  table: string,
  key: string,
): number {
  return stored(decimalUnits(text, places), table, key);
}

/** `excluded.<column>`: the proposed value, in an upsert's update. */
export const excluded = (column: AnyPgColumn): SQL =>
  sql`excluded.${sql.identifier(column.name)}`;

/**
 * Rows written a chunk at a time: one statement may bind at most 65,535
 * parameters, and a season's predictions or points are more than that.
 */
export async function inChunks<T>(
  rows: readonly T[],
  write: (chunk: T[]) => Promise<unknown>,
  size = 1_000,
): Promise<void> {
  for (let start = 0; start < rows.length; start += size) {
    await write(rows.slice(start, start + size));
  }
}
```

Create `packages/db/src/identity.ts`:

```ts
import { getTableName, sql } from 'drizzle-orm';
import type { Executor } from './client';
import { players } from './player/schema';
import { survivalPoints } from './points/schema';
import { games, rounds } from './season/schema';
import { teams } from './team/schema';
import { tournaments } from './tournament/schema';

/** Every table whose id is an identity column that keeps sportbet's ids. */
export const IDENTITY_TABLES = [
  tournaments,
  rounds,
  teams,
  games,
  players,
  survivalPoints,
] as const;

/**
 * Moves each identity sequence past the highest id its table holds, so an
 * id the database generates later never collides with one saved under its
 * own id (`overridingSystemValue`, spec 2.2: sportbet's ids are kept).
 */
export async function advanceIdentitySequences(
  db: Executor,
  tables: readonly (typeof IDENTITY_TABLES)[number][] = IDENTITY_TABLES,
): Promise<void> {
  for (const table of tables) {
    await db.execute(
      sql`select setval(pg_get_serial_sequence(${getTableName(table)}, 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`,
    );
  }
}
```

- [ ] **Step 4: The tournament repository**

```bash
git mv packages/db/src/tournament/queries.ts packages/db/src/tournament/repository.ts
```

Replace the contents of `packages/db/src/tournament/repository.ts` with:

```ts
import {
  newTournamentSchema,
  tournamentSchema,
  type NewTournament,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { excluded } from '../edge';
import { tournaments } from './schema';

export type { NewTournament };

const columns = {
  id: tournaments.id,
  slug: tournaments.slug,
  name: tournaments.name,
  format: tournaments.format,
  endsOn: tournaments.endsOn,
  standingsDeadlineRound: tournaments.standingsDeadlineRound,
  survival: tournaments.survival,
  standingsTableFinal: tournaments.standingsTableFinal,
};

// Decision 5: rows are parsed at the edge, like any other input.
const tournamentRows = tournamentSchema.array();
const newTournamentRows = newTournamentSchema.array();

export async function listTournaments(db: Executor): Promise<Tournament[]> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .orderBy(asc(tournaments.name));
  return tournamentRows.parse(rows);
}

export async function findTournamentBySlug(
  db: Executor,
  slug: string,
): Promise<Tournament | undefined> {
  const rows = await db
    .select(columns)
    .from(tournaments)
    .where(eq(tournaments.slug, slug))
    .limit(1);
  return tournamentRows.parse(rows)[0];
}

/** Inserts the rows; a slug that already exists is left as it is. */
export async function insertTournaments(
  db: Executor,
  rows: readonly NewTournament[],
): Promise<void> {
  if (rows.length === 0) return;
  // Decision 5: parsed at the edge, like every other boundary.
  const parsed = newTournamentRows.parse(rows);
  await db
    .insert(tournaments)
    .values(parsed)
    .onConflictDoNothing({ target: tournaments.slug });
}

/**
 * Inserts the tournament under its own id, or updates the row with that id
 * (spec 2.2: sportbet's ids are kept, so a saved id is an explicit act).
 */
export async function saveTournament(
  db: Executor,
  tournament: Tournament,
): Promise<void> {
  const row = tournamentSchema.parse(tournament);
  await db
    .insert(tournaments)
    .overridingSystemValue()
    .values(row)
    .onConflictDoUpdate({
      target: tournaments.id,
      set: {
        slug: excluded(tournaments.slug),
        name: excluded(tournaments.name),
        format: excluded(tournaments.format),
        endsOn: excluded(tournaments.endsOn),
        standingsDeadlineRound: excluded(tournaments.standingsDeadlineRound),
        survival: excluded(tournaments.survival),
        standingsTableFinal: excluded(tournaments.standingsTableFinal),
      },
    });
}
```

In `packages/db/src/seed/staging.ts`, replace:

```ts
import { insertTournaments, type NewTournament } from '../tournament/queries';
```

with:

```ts
import {
  insertTournaments,
  type NewTournament,
} from '../tournament/repository';
```

Replace the contents of `packages/db/src/index.ts` with:

```ts
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from './client';
export { databaseEnvSchema, databaseUrlSchema } from './config';
export { advanceIdentitySequences } from './identity';
export {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from './tournament/repository';
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  5 passed (5)` and `Tests  170 passed (170)`.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): the repositories' edge helpers, saveTournament under its own id, identity sequences (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Seasons, teams and players

`loadSeason` reads a tournament's rounds through `Round.stored` and its games through `Game.stored` and makes the `Season` with `endsAt` (the day after `ends_on`) and the admin's deadline round; `saveRounds` and `saveGames` upsert by sportbet's ids (a round's database id and name travel beside the domain's `Round`, which knows only its number). `loadTeamOutcomes` reads `TeamOutcomes.stored` with the tournament's final-table flag. Players are the id and the username only; `loadPlayerStatuses` builds each player's `StoredStatus` from all of their tournaments' rows and calls `PlayerStatus.stored`, which adds the counts up under `sportbetRules`.

**Files:**
- Create: `packages/db/src/season/repository.ts`, `packages/db/src/team/repository.ts`, `packages/db/src/player/repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/world.ts` (shared fixture), `packages/db/test/season.test.ts`, `packages/db/test/player.test.ts`

- [ ] **Step 1: Write the failing tests**

The shared fixture is a small tournament with chosen ids, as the reader chooses sportbet's.

Create `packages/db/test/world.ts`:

```ts
// A small tournament saved through the repositories, shared by the db
// repository tests. Ids are chosen, not generated, as the reader chooses
// sportbet's.

import { Game, Round, type Tournament } from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  rate,
  roundNo,
  score,
  team,
  unwrap,
} from '@sportbet/domain/testing';
import {
  savePlayers,
  saveRounds,
  saveTeams,
  saveTournament,
  type Db,
  type TeamRow,
} from '../src';

export const TOURNAMENT: Tournament = {
  id: 3,
  slug: 'euroleague-2026-27',
  name: 'Euroleague 2026/27',
  format: 'euroleague',
  endsOn: '2027-05-23',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
};

/** Another tournament, for rows that must not leak across. */
export const OTHER: Tournament = {
  ...TOURNAMENT,
  id: 4,
  slug: 'euroleague-2027-28',
  name: 'Euroleague 2027/28',
  endsOn: '2028-05-21',
};

export const ZAL = team('11');
export const OLY = team('12');
export const REA = team('13');
export const FEN = team('14');
export const TEAMS: readonly TeamRow[] = [
  { id: ZAL, name: 'Zalgiris' },
  { id: OLY, name: 'Olympiacos' },
  { id: REA, name: 'Real' },
  { id: FEN, name: 'Fenerbahce' },
];

export const ADA = player('1');
export const BEN = player('2');
export const CAI = player('3');

/** Round 1 (id 21) and a knockout-flagged round 2 at rate 2 (id 22). */
export const ROUNDS = [
  {
    id: 21,
    name: '1 turas',
    round: Round.stored({
      number: roundNo(1),
      stage: 'regular',
      rate: rate(1),
      survival: true,
      knockout: false,
    }),
  },
  {
    id: 22,
    name: '2 turas',
    round: Round.stored({
      number: roundNo(2),
      stage: 'regular',
      rate: rate(2),
      survival: false,
      knockout: true,
    }),
  },
] as const;

/** Game 7 is scored; 8 level with a recorded winner; 9 postponed; 10 locked after a move. */
export const G7 = unwrap(
  Game.stored({
    id: gameNo(7),
    round: roundNo(1),
    home: ZAL,
    away: OLY,
    tipOff: at('2026-10-02T18:00:00Z'),
    result: score(88, 79),
    recordedWinner: null,
    lockedSince: null,
    postponed: false,
  }),
);
export const G8 = unwrap(
  Game.stored({
    id: gameNo(8),
    round: roundNo(2),
    home: REA,
    away: FEN,
    tipOff: at('2026-10-09T18:45:00Z'),
    result: score(80, 80),
    recordedWinner: FEN,
    lockedSince: null,
    postponed: false,
  }),
);
export const G9 = unwrap(
  Game.stored({
    id: gameNo(9),
    round: roundNo(2),
    home: ZAL,
    away: FEN,
    tipOff: at('2026-10-10T17:30:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: null,
    postponed: true,
  }),
);
export const G10 = unwrap(
  Game.stored({
    id: gameNo(10),
    round: roundNo(1),
    home: REA,
    away: OLY,
    tipOff: at('2026-10-20T18:00:00Z'),
    result: null,
    recordedWinner: null,
    lockedSince: at('2026-10-03T18:00:00Z'),
    postponed: false,
  }),
);
export const GAMES = [G7, G8, G9, G10];

/** Saves the tournament, its teams and rounds, and three players. */
export async function saveWorld(db: Db): Promise<void> {
  await saveTournament(db, TOURNAMENT);
  await saveTeams(db, TOURNAMENT, TEAMS);
  await saveRounds(db, TOURNAMENT, ROUNDS);
  await savePlayers(db, [
    { id: ADA, username: 'ada' },
    { id: BEN, username: 'ben' },
    { id: CAI, username: 'cai' },
  ]);
}
```

Create `packages/db/test/season.test.ts`:

```ts
import { sportbetRules, TeamOutcomes } from '@sportbet/domain';
import {
  at,
  roundNo,
  score,
  teamOutcome,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listTeams,
  loadSeason,
  loadTeamOutcomes,
  saveGames,
  saveTeamOutcomes,
  saveTournament,
} from '../src';
import { useTestDatabase } from '../src/testing';
import {
  G10,
  G7,
  G8,
  G9,
  GAMES,
  OTHER,
  ROUNDS,
  saveWorld,
  TEAMS,
  TOURNAMENT,
} from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('season repository', () => {
  it('reads back the rounds and games it saved, through Round.stored and Game.stored', async () => {
    await saveGames(db, TOURNAMENT, GAMES);
    const season = await loadSeason(db, TOURNAMENT);
    expect(season.rounds).toEqual(ROUNDS.map(({ round }) => round));
    expect(season.games).toEqual(GAMES);
    // R-21: on for the whole of its end date, UTC.
    expect(season.endsAt).toBe(at('2027-05-24T00:00:00Z'));
    expect(season.standingsDeadlineRound).toBe(5);
  });

  it("reads an admin's standings deadline round from the tournament", async () => {
    const withDeadline = { ...TOURNAMENT, standingsDeadlineRound: roundNo(6) };
    await saveTournament(db, withDeadline);
    expect((await loadSeason(db, withDeadline)).standingsDeadlineRound).toBe(6);
  });

  it('updates a game saved again, by id', async () => {
    await saveGames(db, TOURNAMENT, GAMES);
    const scored = unwrap(G9.withResult(score(81, 77), sportbetRules));
    await saveGames(db, TOURNAMENT, [scored]);
    expect((await loadSeason(db, TOURNAMENT)).games).toEqual([
      G7,
      G8,
      scored,
      G10,
    ]);
  });

  it("reads another tournament's rounds and games as its own only", async () => {
    await saveTournament(db, OTHER);
    await saveGames(db, TOURNAMENT, GAMES);
    const other = await loadSeason(db, OTHER);
    expect([other.rounds, other.games]).toEqual([[], []]);
  });
});

describe('team repository', () => {
  it('lists the teams it saved, by id', async () => {
    expect(await listTeams(db, TOURNAMENT)).toEqual(TEAMS);
  });

  it("reads back stored outcomes - a shared place, football's final place 3 - with the tournament's final-table flag", async () => {
    const outcomes = unwrap(
      TeamOutcomes.stored(
        [
          teamOutcome('11', {
            place: 1,
            playOffs: true,
            finalFour: true,
            finalPlace: 1,
          }),
          teamOutcome('12', { place: 1, playOffs: true, finalPlace: 3 }),
          teamOutcome('13'),
          teamOutcome('14', { place: 4 }),
        ],
        true,
      ),
    );
    await saveTournament(db, { ...TOURNAMENT, standingsTableFinal: true });
    await saveTeamOutcomes(db, outcomes);
    expect(
      await loadTeamOutcomes(db, { ...TOURNAMENT, standingsTableFinal: true }),
    ).toEqual(outcomes);
  });
});
```

Create `packages/db/test/player.test.ts`:

```ts
import { ruledRules, sportbetRules } from '@sportbet/domain';
import { tournamentKey } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournament,
  saveTournamentPlayers,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, OTHER, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('player repository', () => {
  it('keeps only the id and the username of a player', async () => {
    expect(await listPlayers(db)).toEqual([
      { id: ADA, username: 'ada' },
      { id: BEN, username: 'ben' },
      { id: CAI, username: 'cai' },
    ]);
    await savePlayers(db, [{ id: ADA, username: 'ada-2' }]);
    expect((await listPlayers(db))[0]).toEqual({ id: ADA, username: 'ada-2' });
  });

  it("lists a tournament's players, by id", async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: CAI, switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
    await saveTournamentPlayers(db, OTHER, [
      { player: BEN, switchedOff: false, adminHidden: false, fillIns: 0 },
    ]);
    expect(await listTournamentPlayers(db, TOURNAMENT)).toEqual([ADA, CAI]);
  });

  it("builds each player's status from every tournament's row: sportbet adds the counts up, the ruled set keeps them apart", async () => {
    await saveTournament(db, OTHER);
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: false, fillIns: 3 },
      { player: BEN, switchedOff: true, adminHidden: false, fillIns: 5 },
    ]);
    await saveTournamentPlayers(db, OTHER, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 2 },
    ]);
    const here = tournamentKey(String(TOURNAMENT.id));
    const sportbet = await loadPlayerStatuses(db, TOURNAMENT, sportbetRules);
    expect([...sportbet.keys()]).toEqual([ADA, BEN]);
    expect(sportbet.get(ADA)?.fillInCount(here, sportbetRules)).toBe(5);
    expect(sportbet.get(ADA)?.isSwitchedOffIn(here, sportbetRules)).toBe(true);
    const ruled = await loadPlayerStatuses(db, TOURNAMENT, ruledRules);
    expect(ruled.get(ADA)?.fillInCount(here, ruledRules)).toBe(3);
    expect(ruled.get(ADA)?.isSwitchedOffIn(here, ruledRules)).toBe(false);
    expect(ruled.get(BEN)?.isSwitchedOffIn(here, ruledRules)).toBe(true);
  });

  it('refuses a separate admin hide under the sportbet set, naming the table', async () => {
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: false, adminHidden: true, fillIns: 0 },
    ]);
    await expect(
      loadPlayerStatuses(db, TOURNAMENT, sportbetRules),
    ).rejects.toThrow(/tournament_players 1.*admin-hide-is-the-switch/);
    const ruled = await loadPlayerStatuses(db, TOURNAMENT, ruledRules);
    expect(ruled.get(ADA)?.adminHidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/season.test.ts test/player.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `Test Files  2 failed (2)` and `Tests  10 failed (10)`: `TypeError: saveTeams is not a function` in the fixture.

- [ ] **Step 3: The repositories**

Create `packages/db/src/season/repository.ts`:

```ts
import {
  dayAfter,
  Game,
  Rate,
  Round,
  roundNumber,
  Score,
  Season,
  STAGES,
  type RoundNumber,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  gameOf,
  inChunks,
  instantOf,
  keyOf,
  stored,
  teamOf,
} from '../edge';
import { games, rounds } from './schema';

/** A round to save: its database id and display name, and the round itself. */
export interface SavedRound {
  readonly id: number;
  readonly name: string;
  readonly round: Round;
}

const roundRows = z.array(
  z.object({
    id: z.int(),
    number: z.int(),
    stage: z.enum(STAGES),
    rate: z.int(),
    survival: z.boolean(),
    knockout: z.boolean(),
  }),
);

const gameRows = z.array(
  z.object({
    id: z.int(),
    round: z.int(),
    home: z.int(),
    away: z.int(),
    tipOff: z.date(),
    homeScore: z.int().nullable(),
    awayScore: z.int().nullable(),
    recordedWinner: z.int().nullable(),
    postponed: z.boolean(),
    lockedSince: z.date().nullable(),
  }),
);

/** Upserts the tournament's rounds by id. */
export async function saveRounds(
  db: Executor,
  tournament: Tournament,
  saved: readonly SavedRound[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(rounds)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, name, round }) => ({
          id,
          tournamentId: tournament.id,
          number: round.number,
          name,
          stage: round.stage,
          rate: round.rate.value,
          survival: round.survival,
          knockout: round.knockout,
        })),
      )
      .onConflictDoUpdate({
        target: rounds.id,
        set: {
          tournamentId: excluded(rounds.tournamentId),
          number: excluded(rounds.number),
          name: excluded(rounds.name),
          stage: excluded(rounds.stage),
          rate: excluded(rounds.rate),
          survival: excluded(rounds.survival),
          knockout: excluded(rounds.knockout),
        },
      }),
  );
}

/** Each round's database id by its number, in one tournament. */
export async function roundIdsOf(
  db: Executor,
  tournament: Tournament,
): Promise<ReadonlyMap<RoundNumber, number>> {
  const rows = await db
    .select({ id: rounds.id, number: rounds.number })
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id));
  return new Map(
    z
      .array(z.object({ id: z.int(), number: z.int() }))
      .parse(rows)
      .map(({ id, number }) => [stored(roundNumber(number), 'rounds', id), id]),
  );
}

/** The round id a round number stands for, or a thrown programmer error. */
export function roundIdIn(
  ids: ReadonlyMap<RoundNumber, number>,
  round: RoundNumber,
  tournament: Tournament,
): number {
  const id = ids.get(round);
  if (id === undefined) {
    throw new Error(
      `tournament ${String(tournament.id)} has no round ${String(round)}`,
    );
  }
  return id;
}

/** Upserts the tournament's games by id; each game's round must be saved. */
export async function saveGames(
  db: Executor,
  tournament: Tournament,
  saved: readonly Game[],
): Promise<void> {
  const roundIds = await roundIdsOf(db, tournament);
  await inChunks(saved, (chunk) =>
    db
      .insert(games)
      .overridingSystemValue()
      .values(
        chunk.map((game) => ({
          id: game.id,
          tournamentId: tournament.id,
          roundId: roundIdIn(roundIds, game.round, tournament),
          homeTeamId: keyOf(game.home, 'team'),
          awayTeamId: keyOf(game.away, 'team'),
          tipOff: new Date(game.tipOff),
          homeScore: game.result?.home ?? null,
          awayScore: game.result?.away ?? null,
          recordedWinnerId:
            game.recordedWinner === null
              ? null
              : keyOf(game.recordedWinner, 'team'),
          postponed: game.postponed,
          lockedSince:
            game.lockedSince === null ? null : new Date(game.lockedSince),
        })),
      )
      .onConflictDoUpdate({
        target: games.id,
        set: {
          tournamentId: excluded(games.tournamentId),
          roundId: excluded(games.roundId),
          homeTeamId: excluded(games.homeTeamId),
          awayTeamId: excluded(games.awayTeamId),
          tipOff: excluded(games.tipOff),
          homeScore: excluded(games.homeScore),
          awayScore: excluded(games.awayScore),
          recordedWinnerId: excluded(games.recordedWinnerId),
          postponed: excluded(games.postponed),
          lockedSince: excluded(games.lockedSince),
        },
      }),
  );
}

/**
 * The tournament's season: its rounds through Round.stored and its games
 * through Game.stored, ending the day after its end date (R-21).
 */
export async function loadSeason(
  db: Executor,
  tournament: Tournament,
): Promise<Season> {
  const roundResult = await db
    .select({
      id: rounds.id,
      number: rounds.number,
      stage: rounds.stage,
      rate: rounds.rate,
      survival: rounds.survival,
      knockout: rounds.knockout,
    })
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id))
    .orderBy(asc(rounds.number));
  const seasonRounds = roundRows.parse(roundResult).map((row) =>
    Round.stored({
      number: stored(roundNumber(row.number), 'rounds', row.id),
      stage: row.stage,
      rate: stored(Rate.of(row.rate), 'rounds', row.id),
      survival: row.survival,
      knockout: row.knockout,
    }),
  );
  const gameResult = await db
    .select({
      id: games.id,
      round: rounds.number,
      home: games.homeTeamId,
      away: games.awayTeamId,
      tipOff: games.tipOff,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      recordedWinner: games.recordedWinnerId,
      postponed: games.postponed,
      lockedSince: games.lockedSince,
    })
    .from(games)
    .innerJoin(rounds, eq(rounds.id, games.roundId))
    .where(eq(games.tournamentId, tournament.id))
    .orderBy(asc(games.id));
  const seasonGames = gameRows.parse(gameResult).map((row) => {
    const key = String(row.id);
    const result =
      row.homeScore === null || row.awayScore === null
        ? null
        : stored(Score.of(row.homeScore, row.awayScore), 'games', key);
    return stored(
      Game.stored({
        id: gameOf(row.id),
        round: stored(roundNumber(row.round), 'games', key),
        home: teamOf(row.home),
        away: teamOf(row.away),
        tipOff: instantOf(row.tipOff, 'games', key),
        result,
        recordedWinner:
          row.recordedWinner === null ? null : teamOf(row.recordedWinner),
        lockedSince:
          row.lockedSince === null
            ? null
            : instantOf(row.lockedSince, 'games', key),
        postponed: row.postponed,
      }),
      'games',
      key,
    );
  });
  return stored(
    Season.create({
      rounds: seasonRounds,
      games: seasonGames,
      endsAt: stored(dayAfter(tournament.endsOn), 'tournaments', tournament.id),
      ...(tournament.standingsDeadlineRound === null
        ? {}
        : { standingsDeadlineRound: tournament.standingsDeadlineRound }),
    }),
    'tournaments',
    tournament.id,
  );
}
```

Create `packages/db/src/team/repository.ts`:

```ts
import { TeamOutcomes, type TeamId, type Tournament } from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, stored, teamOf } from '../edge';
import { teamOutcomes, teams } from './schema';

/** A team of a tournament: its id and its name. */
export interface TeamRow {
  readonly id: TeamId;
  readonly name: string;
}

const teamRows = z.array(z.object({ id: z.int(), name: z.string() }));

const outcomeRows = z.array(
  z.object({
    team: z.int(),
    place: z.int().nullable(),
    playOffs: z.boolean(),
    finalFour: z.boolean(),
    // StandingsPrediction's stored final places, as the CHECK allows.
    finalPlace: z.literal([1, 2, 3, 4]).nullable(),
  }),
);

/** Upserts the tournament's teams by id. */
export async function saveTeams(
  db: Executor,
  tournament: Tournament,
  saved: readonly TeamRow[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(teams)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, name }) => ({
          id: keyOf(id, 'team'),
          tournamentId: tournament.id,
          name,
        })),
      )
      .onConflictDoUpdate({
        target: teams.id,
        set: {
          tournamentId: excluded(teams.tournamentId),
          name: excluded(teams.name),
        },
      }),
  );
}

/** The tournament's teams, by id. */
export async function listTeams(
  db: Executor,
  tournament: Tournament,
): Promise<TeamRow[]> {
  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(asc(teams.id));
  return teamRows.parse(rows).map(({ id, name }) => ({ id: teamOf(id), name }));
}

/**
 * Upserts each team's outcome. Whether the table is final is the
 * tournament's (`standingsTableFinal`), saved with it.
 */
export async function saveTeamOutcomes(
  db: Executor,
  outcomes: TeamOutcomes,
): Promise<void> {
  await inChunks(outcomes.teams, (chunk) =>
    db
      .insert(teamOutcomes)
      .values(
        chunk.map((outcome) => ({
          teamId: keyOf(outcome.team, 'team'),
          place: outcome.place,
          playOffs: outcome.playOffs,
          finalFour: outcome.finalFour,
          finalPlace: outcome.finalPlace,
        })),
      )
      .onConflictDoUpdate({
        target: teamOutcomes.teamId,
        set: {
          place: excluded(teamOutcomes.place),
          playOffs: excluded(teamOutcomes.playOffs),
          finalFour: excluded(teamOutcomes.finalFour),
          finalPlace: excluded(teamOutcomes.finalPlace),
        },
      }),
  );
}

/**
 * The tournament's team outcomes through TeamOutcomes.stored, the table
 * final or not as the tournament records it (R-14).
 */
export async function loadTeamOutcomes(
  db: Executor,
  tournament: Tournament,
): Promise<TeamOutcomes> {
  const rows = await db
    .select({
      team: teamOutcomes.teamId,
      place: teamOutcomes.place,
      playOffs: teamOutcomes.playOffs,
      finalFour: teamOutcomes.finalFour,
      finalPlace: teamOutcomes.finalPlace,
    })
    .from(teamOutcomes)
    .innerJoin(teams, eq(teams.id, teamOutcomes.teamId))
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(asc(teamOutcomes.teamId));
  return stored(
    TeamOutcomes.stored(
      outcomeRows.parse(rows).map((row) => ({
        team: teamOf(row.team),
        place: row.place,
        playOffs: row.playOffs,
        finalFour: row.finalFour,
        finalPlace: row.finalPlace,
      })),
      tournament.standingsTableFinal,
    ),
    'team_outcomes',
    tournament.id,
  );
}
```

Create `packages/db/src/player/repository.ts`:

```ts
import {
  PlayerStatus,
  tournamentId,
  usernameInvariant,
  type PlayerId,
  type RuleSet,
  type StoredPlayer,
  type Tournament,
  type TournamentId,
} from '@sportbet/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored } from '../edge';
import { players, tournamentPlayers } from './schema';

/** A player of one tournament, and the status scoring needs there. */
export interface TournamentPlayer {
  readonly player: PlayerId;
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: number;
}

const playerRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

const statusRows = z.array(
  z.object({
    player: z.int(),
    tournament: z.int(),
    switchedOff: z.boolean(),
    adminHidden: z.boolean(),
    fillIns: z.int(),
  }),
);

/** Upserts players by id: the id and the username, nothing else. */
export async function savePlayers(
  db: Executor,
  saved: readonly StoredPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(players)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, username }) => ({
          id: keyOf(id, 'player'),
          username,
        })),
      )
      .onConflictDoUpdate({
        target: players.id,
        set: { username: excluded(players.username) },
      }),
  );
}

/** Every player, by id. */
export async function listPlayers(db: Executor): Promise<StoredPlayer[]> {
  const rows = await db
    .select({ id: players.id, username: players.username })
    .from(players)
    .orderBy(asc(players.id));
  return playerRows
    .parse(rows)
    .map(({ id, username }) => ({ id: playerOf(id), username }));
}

/** Upserts the tournament's players by player. */
export async function saveTournamentPlayers(
  db: Executor,
  tournament: Tournament,
  saved: readonly TournamentPlayer[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(tournamentPlayers)
      .values(
        chunk.map((row) => ({
          tournamentId: tournament.id,
          playerId: keyOf(row.player, 'player'),
          switchedOff: row.switchedOff,
          adminHidden: row.adminHidden,
          fillIns: row.fillIns,
        })),
      )
      .onConflictDoUpdate({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
        set: {
          switchedOff: excluded(tournamentPlayers.switchedOff),
          adminHidden: excluded(tournamentPlayers.adminHidden),
          fillIns: excluded(tournamentPlayers.fillIns),
        },
      }),
  );
}

/** The tournament's players, by id: everyone who gets a total. */
export async function listTournamentPlayers(
  db: Executor,
  tournament: Tournament,
): Promise<PlayerId[]> {
  const rows = await db
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id))
    .orderBy(asc(tournamentPlayers.playerId));
  return z
    .array(z.object({ player: z.int() }))
    .parse(rows)
    .map(({ player }) => playerOf(player));
}

/**
 * Each of the tournament's players' status through PlayerStatus.stored,
 * built from all of their tournaments' rows: switched off where
 * `switched_off`, the fill-ins counted per tournament (which the sportbet
 * set adds up into its one lifetime count), hidden as this tournament's row
 * says.
 */
export async function loadPlayerStatuses(
  db: Executor,
  tournament: Tournament,
  rules: RuleSet,
): Promise<Map<PlayerId, PlayerStatus>> {
  const ofTournament = db
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id));
  const rows = await db
    .select({
      player: tournamentPlayers.playerId,
      tournament: tournamentPlayers.tournamentId,
      switchedOff: tournamentPlayers.switchedOff,
      adminHidden: tournamentPlayers.adminHidden,
      fillIns: tournamentPlayers.fillIns,
    })
    .from(tournamentPlayers)
    .where(inArray(tournamentPlayers.playerId, ofTournament))
    .orderBy(
      asc(tournamentPlayers.playerId),
      asc(tournamentPlayers.tournamentId),
    );
  const byPlayer = new Map<number, z.infer<typeof statusRows>>();
  for (const row of statusRows.parse(rows)) {
    byPlayer.set(row.player, [...(byPlayer.get(row.player) ?? []), row]);
  }
  const keyOfTournament = (id: number): TournamentId =>
    stored(tournamentId(String(id)), 'tournament_players', id);
  const statuses = new Map<PlayerId, PlayerStatus>();
  for (const [player, own] of byPlayer) {
    statuses.set(
      playerOf(player),
      stored(
        PlayerStatus.stored(
          {
            switchedOffIn: new Set(
              own
                .filter((row) => row.switchedOff)
                .map((row) => keyOfTournament(row.tournament)),
            ),
            adminHidden:
              own.find((row) => row.tournament === tournament.id)
                ?.adminHidden ?? false,
            fillIns: new Map(
              own.map((row) => [keyOfTournament(row.tournament), row.fillIns]),
            ),
          },
          rules,
        ),
        'tournament_players',
        player,
      ),
    );
  }
  return statuses;
}
```

Replace the contents of `packages/db/src/index.ts` with:

```ts
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from './client';
export { databaseEnvSchema, databaseUrlSchema } from './config';
export { advanceIdentitySequences } from './identity';
export {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournamentPlayers,
  type TournamentPlayer,
} from './player/repository';
export {
  loadSeason,
  saveGames,
  saveRounds,
  type SavedRound,
} from './season/repository';
export {
  listTeams,
  loadTeamOutcomes,
  saveTeamOutcomes,
  saveTeams,
  type TeamRow,
} from './team/repository';
export {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from './tournament/repository';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  7 passed (7)` and `Tests  180 passed (180)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): season, team and player repositories through the stored factories (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Predictions, standings predictions and survival picks

`loadMatchPredictions` reads every row of a tournament's games - real, filled in, half-typed and blank - through `MatchPrediction.stored`; `loadStandingsPredictions` reads one `StandingsPrediction.stored` per player; `loadSurvivalRuns` one `SurvivalRun.stored` per player, and `loadStoredSurvivalRows` the tournament's production survival rows as the stored rows sportbet's refold reads. Each save is an upsert by the table's key.

**Files:**
- Create: `packages/db/src/prediction/repository.ts`, `packages/db/src/standings/repository.ts`, `packages/db/src/survival/repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/predictions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/predictions.test.ts`:

```ts
import {
  MatchPrediction,
  StandingsPrediction,
  SurvivalRun,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  teamPick,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadMatchPredictions,
  loadStandingsPredictions,
  loadSurvivalRuns,
  saveGames,
  saveMatchPredictions,
  saveStandingsPredictions,
  saveSurvivalPicks,
} from '../src';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  GAMES,
  OLY,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db } = useTestDatabase();

beforeEach(() => saveWorld(db));

describe('prediction repository', () => {
  beforeEach(() => saveGames(db, TOURNAMENT, GAMES));

  const stored = (row: Parameters<typeof MatchPrediction.stored>[0]) =>
    unwrap(MatchPrediction.stored(row));

  it('reads back real, half-typed, blank and filled-in rows, by game then player', async () => {
    const predictions = [
      stored({
        player: BEN,
        game: gameNo(7),
        home: 79,
        away: 88,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: ADA,
        game: gameNo(7),
        home: 85,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: ADA,
        game: gameNo(8),
        home: null,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
      stored({
        player: CAI,
        game: gameNo(8),
        home: 90,
        away: 80,
        origin: 'fill-in',
        filledInAt: null,
      }),
      stored({
        player: CAI,
        game: gameNo(9),
        home: 81,
        away: 77,
        origin: 'late-fill-in',
        filledInAt: at('2026-10-01T09:00:00Z'),
      }),
    ];
    await saveMatchPredictions(db, predictions);
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([
      predictions[1],
      predictions[0],
      predictions[2],
      predictions[3],
      predictions[4],
    ]);
  });

  it('keeps one row per player and game: a second save replaces the first', async () => {
    const first = stored({
      player: ADA,
      game: gameNo(7),
      home: 85,
      away: 80,
      origin: 'fill-in',
      filledInAt: null,
    });
    const saved = stored({
      player: ADA,
      game: gameNo(7),
      home: 90,
      away: 80,
      origin: 'real',
      filledInAt: null,
    });
    await saveMatchPredictions(db, [first]);
    await saveMatchPredictions(db, [saved]);
    expect(await loadMatchPredictions(db, TOURNAMENT)).toEqual([saved]);
  });
});

describe('standings repository', () => {
  it("reads back each player's rows - place 0, final place 3, never saved and unticked - one prediction per player", async () => {
    const ada = unwrap(
      StandingsPrediction.stored(ADA, [
        teamPick('11', { place: 1, playOffs: true, finalFour: false }),
        teamPick('12', { place: 0, finalPlace: 3 }),
      ]),
    );
    const ben = unwrap(
      StandingsPrediction.stored(BEN, [teamPick('13', { playOffs: false })]),
    );
    await saveStandingsPredictions(db, [ben, ada]);
    expect(await loadStandingsPredictions(db, TOURNAMENT)).toEqual([ada, ben]);
  });
});

describe('survival repository', () => {
  it("reads back each player's pick history, by player then round", async () => {
    const runs = new Map([
      [BEN, unwrap(SurvivalRun.stored([{ round: roundNo(1), team: FEN }]))],
      [
        ADA,
        unwrap(
          SurvivalRun.stored([
            { round: roundNo(2), team: ZAL },
            { round: roundNo(1), team: FEN },
          ]),
        ),
      ],
    ]);
    await saveSurvivalPicks(db, TOURNAMENT, runs);
    const loaded = await loadSurvivalRuns(db, TOURNAMENT);
    expect([...loaded.keys()]).toEqual([ADA, BEN]);
    expect(loaded.get(ADA)).toEqual(runs.get(ADA));
    expect(loaded.get(BEN)).toEqual(runs.get(BEN));
  });

  it('replaces the team of a round picked again', async () => {
    const pick = (team: typeof ZAL) =>
      new Map([
        [ADA, unwrap(SurvivalRun.stored([{ round: roundNo(1), team }]))],
      ]);
    await saveSurvivalPicks(db, TOURNAMENT, pick(ZAL));
    await saveSurvivalPicks(db, TOURNAMENT, pick(OLY));
    expect((await loadSurvivalRuns(db, TOURNAMENT)).get(ADA)?.picks).toEqual([
      { round: roundNo(1), team: OLY },
    ]);
  });

  it('refuses a pick in a round the tournament does not have', async () => {
    await expect(
      saveSurvivalPicks(
        db,
        TOURNAMENT,
        new Map([
          [
            player('1'),
            unwrap(SurvivalRun.stored([{ round: roundNo(3), team: ZAL }])),
          ],
        ]),
      ),
    ).rejects.toThrow(/tournament 3 has no round 3/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/predictions.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  6 failed (6)`: `TypeError: saveMatchPredictions is not a function` and its siblings.

- [ ] **Step 3: The repositories**

Create `packages/db/src/prediction/repository.ts`:

```ts
import {
  MatchPrediction,
  PREDICTION_ORIGINS,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  gameOf,
  inChunks,
  instantOf,
  keyOf,
  playerOf,
  stored,
} from '../edge';
import { games } from '../season/schema';
import { matchPredictions } from './schema';

const predictionRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    home: z.int().nullable(),
    away: z.int().nullable(),
    origin: z.enum(PREDICTION_ORIGINS),
    filledInAt: z.date().nullable(),
  }),
);

/** Upserts predictions by player and game. */
export async function saveMatchPredictions(
  db: Executor,
  predictions: readonly MatchPrediction[],
): Promise<void> {
  await inChunks(predictions, (chunk) =>
    db
      .insert(matchPredictions)
      .values(
        chunk.map((prediction) => ({
          playerId: keyOf(prediction.player, 'player'),
          gameId: prediction.game,
          home: prediction.home,
          away: prediction.away,
          origin: prediction.origin,
          filledInAt:
            prediction.filledInAt === null
              ? null
              : new Date(prediction.filledInAt),
        })),
      )
      .onConflictDoUpdate({
        target: [matchPredictions.playerId, matchPredictions.gameId],
        set: {
          home: excluded(matchPredictions.home),
          away: excluded(matchPredictions.away),
          origin: excluded(matchPredictions.origin),
          filledInAt: excluded(matchPredictions.filledInAt),
        },
      }),
  );
}

/**
 * Every prediction row of the tournament's games, real, filled in and
 * blank, through MatchPrediction.stored; by game, then player.
 */
export async function loadMatchPredictions(
  db: Executor,
  tournament: Tournament,
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
    .where(eq(games.tournamentId, tournament.id))
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
```

Create `packages/db/src/standings/repository.ts`:

```ts
import {
  StandingsPrediction,
  type StoredTeamPick,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored, teamOf } from '../edge';
import { teams } from '../team/schema';
import { standingsPredictions } from './schema';

const standingsRows = z.array(
  z.object({
    player: z.int(),
    team: z.int(),
    place: z.int().nullable(),
    playOffs: z.boolean().nullable(),
    finalFour: z.boolean().nullable(),
    finalPlace: z.int().nullable(),
  }),
);

/** Upserts every row of each prediction, by player and team. */
export async function saveStandingsPredictions(
  db: Executor,
  predictions: readonly StandingsPrediction[],
): Promise<void> {
  const rows = predictions.flatMap((prediction) =>
    prediction.picks.map((pick) => ({
      playerId: keyOf(prediction.player, 'player'),
      teamId: keyOf(pick.team, 'team'),
      place: pick.place,
      playOffs: pick.playOffs,
      finalFour: pick.finalFour,
      finalPlace: pick.finalPlace,
    })),
  );
  await inChunks(rows, (chunk) =>
    db
      .insert(standingsPredictions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [standingsPredictions.playerId, standingsPredictions.teamId],
        set: {
          place: excluded(standingsPredictions.place),
          playOffs: excluded(standingsPredictions.playOffs),
          finalFour: excluded(standingsPredictions.finalFour),
          finalPlace: excluded(standingsPredictions.finalPlace),
        },
      }),
  );
}

/**
 * One StandingsPrediction.stored per player with rows for the tournament's
 * teams, by player; each prediction's rows by team.
 */
export async function loadStandingsPredictions(
  db: Executor,
  tournament: Tournament,
): Promise<StandingsPrediction[]> {
  const rows = await db
    .select({
      player: standingsPredictions.playerId,
      team: standingsPredictions.teamId,
      place: standingsPredictions.place,
      playOffs: standingsPredictions.playOffs,
      finalFour: standingsPredictions.finalFour,
      finalPlace: standingsPredictions.finalPlace,
    })
    .from(standingsPredictions)
    .innerJoin(teams, eq(teams.id, standingsPredictions.teamId))
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(
      asc(standingsPredictions.playerId),
      asc(standingsPredictions.teamId),
    );
  const byPlayer = new Map<number, StoredTeamPick[]>();
  for (const row of standingsRows.parse(rows)) {
    byPlayer.set(row.player, [
      ...(byPlayer.get(row.player) ?? []),
      {
        team: teamOf(row.team),
        place: row.place,
        playOffs: row.playOffs,
        finalFour: row.finalFour,
        finalPlace: row.finalPlace,
      },
    ]);
  }
  return [...byPlayer].map(([player, picks]) =>
    stored(
      StandingsPrediction.stored(playerOf(player), picks),
      'standings_predictions',
      player,
    ),
  );
}
```

Create `packages/db/src/survival/repository.ts`:

```ts
import {
  Points,
  roundNumber,
  SurvivalRun,
  type PlayerId,
  type StoredSurvivalRow,
  type SurvivalPick,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  inChunks,
  keyOf,
  playerOf,
  stored,
  teamOf,
  unitsOf,
} from '../edge';
import { survivalPoints } from '../points/schema';
import { roundIdIn, roundIdsOf } from '../season/repository';
import { rounds } from '../season/schema';
import { survivalPicks } from './schema';

const pickRows = z.array(
  z.object({ player: z.int(), round: z.int(), team: z.int() }),
);

const storedRows = z.array(
  z.object({
    id: z.int(),
    player: z.int(),
    round: z.int(),
    team: z.int(),
    points: z.string(),
  }),
);

/** Upserts every run's picks, one per player and round. */
export async function saveSurvivalPicks(
  db: Executor,
  tournament: Tournament,
  runs: ReadonlyMap<PlayerId, SurvivalRun>,
): Promise<void> {
  const roundIds = await roundIdsOf(db, tournament);
  const rows = [...runs].flatMap(([player, run]) =>
    run.picks.map((pick) => ({
      playerId: keyOf(player, 'player'),
      tournamentId: tournament.id,
      roundId: roundIdIn(roundIds, pick.round, tournament),
      teamId: keyOf(pick.team, 'team'),
    })),
  );
  await inChunks(rows, (chunk) =>
    db
      .insert(survivalPicks)
      .values(chunk)
      .onConflictDoUpdate({
        target: [survivalPicks.playerId, survivalPicks.roundId],
        set: { teamId: excluded(survivalPicks.teamId) },
      }),
  );
}

/** Each player's pick history in the tournament through SurvivalRun.stored, by player. */
export async function loadSurvivalRuns(
  db: Executor,
  tournament: Tournament,
): Promise<Map<PlayerId, SurvivalRun>> {
  const rows = await db
    .select({
      player: survivalPicks.playerId,
      round: rounds.number,
      team: survivalPicks.teamId,
    })
    .from(survivalPicks)
    .innerJoin(rounds, eq(rounds.id, survivalPicks.roundId))
    .where(eq(survivalPicks.tournamentId, tournament.id))
    .orderBy(asc(survivalPicks.playerId), asc(rounds.number));
  const byPlayer = new Map<number, SurvivalPick[]>();
  for (const row of pickRows.parse(rows)) {
    byPlayer.set(row.player, [
      ...(byPlayer.get(row.player) ?? []),
      {
        round: stored(roundNumber(row.round), 'survival_picks', row.player),
        team: teamOf(row.team),
      },
    ]);
  }
  return new Map(
    [...byPlayer].map(([player, picks]) => [
      playerOf(player),
      stored(SurvivalRun.stored(picks), 'survival_picks', player),
    ]),
  );
}

/**
 * The tournament's `production` survival rows as the stored rows sportbet's
 * full recalculation refolds (SU-10), by id.
 */
export async function loadStoredSurvivalRows(
  db: Executor,
  tournament: Tournament,
): Promise<StoredSurvivalRow[]> {
  const rows = await db
    .select({
      id: survivalPoints.id,
      player: survivalPoints.playerId,
      round: rounds.number,
      team: survivalPoints.teamId,
      points: survivalPoints.points,
    })
    .from(survivalPoints)
    .innerJoin(rounds, eq(rounds.id, survivalPoints.roundId))
    .where(
      and(
        eq(survivalPoints.tournamentId, tournament.id),
        eq(survivalPoints.source, 'production'),
      ),
    )
    .orderBy(asc(survivalPoints.id));
  return storedRows.parse(rows).map((row) => ({
    id: row.id,
    player: playerOf(row.player),
    round: stored(roundNumber(row.round), 'survival_points', row.id),
    team: teamOf(row.team),
    storedPoints: stored(
      Points.ofHundredths(
        unitsOf(row.points, 2, 'survival_points', String(row.id)),
      ),
      'survival_points',
      row.id,
    ),
  }));
}
```

Replace the contents of `packages/db/src/index.ts` with:

```ts
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from './client';
export { databaseEnvSchema, databaseUrlSchema } from './config';
export { advanceIdentitySequences } from './identity';
export {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournamentPlayers,
  type TournamentPlayer,
} from './player/repository';
export {
  loadMatchPredictions,
  saveMatchPredictions,
} from './prediction/repository';
export {
  loadSeason,
  saveGames,
  saveRounds,
  type SavedRound,
} from './season/repository';
export {
  loadStandingsPredictions,
  saveStandingsPredictions,
} from './standings/repository';
export {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
  saveSurvivalPicks,
} from './survival/repository';
export {
  listTeams,
  loadTeamOutcomes,
  saveTeamOutcomes,
  saveTeams,
  type TeamRow,
} from './team/repository';
export {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from './tournament/repository';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  8 passed (8)` and `Tests  186 passed (186)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): prediction, standings and survival-pick repositories (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Points rows under a named source

`saveTournamentPoints(db, tournament, source, rows)` replaces, in one transaction, the tournament's rows of that source in the four points tables, so saving the same result twice leaves the same rows and the other sources are never touched. `rows` is a `PointsRows`: a `TournamentPoints` as it comes from `recalculateTournament`, or production's rows as the reader maps them. A production survival row is the stored row itself and keeps sportbet's id; it is upserted, so a derived row that rewrites it keeps its reference, and the sequence moves past it before any derived row is inserted. Numbers are written as the domain's exact decimal text and read back with `decimalUnits`.

**Files:**
- Create: `packages/db/src/points/repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/points.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/points.test.ts`:

```ts
import {
  CrowdOdds,
  Game,
  Odds,
  Points,
  StandingsOdds,
  StandingsPoints,
  type PointsRows,
  type StoredMatchRow,
  type SurvivalPoints,
} from '@sportbet/domain';
import { at, gameNo, roundNo, score, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  countPointsRows,
  loadStoredSurvivalRows,
  loadTournamentPoints,
  saveGames,
  saveTournamentPoints,
} from '../src';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, FEN, OLY, saveWorld, TOURNAMENT, ZAL } from './world';

const { db, client } = useTestDatabase();

beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [
    unwrap(
      Game.stored({
        id: gameNo(7),
        round: roundNo(1),
        home: ZAL,
        away: OLY,
        tipOff: at('2026-10-02T18:00:00Z'),
        result: score(70, 95),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  ]);
});

const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
const odds = (value: number) => unwrap(Odds.ofHundredths(value));
const tenThousandths = (value: number) =>
  unwrap(StandingsPoints.ofTenThousandths(value));

const MATCH: StoredMatchRow = {
  player: ADA,
  game: gameNo(7),
  points: {
    winner: Points.ZERO,
    margin: hundredths(-4500),
    bingo: Points.ZERO,
    oddsPoints: Points.ZERO,
    full: hundredths(-4500),
    odds: odds(159),
  },
  serija: Points.ZERO,
};

/** A production row: its stored id is its own, sportbet's. */
const SURVIVAL: SurvivalPoints = {
  player: ADA,
  round: roundNo(1),
  team: FEN,
  points: hundredths(1200),
  provisional: false,
  storedId: 41,
};

/** One row of each table, at the decimal edges: -45.00, 0.59, 631.1610, 0.0000 against null. */
const ROWS: PointsRows = {
  odds: [
    { game: gameNo(7), odds: CrowdOdds.stored(odds(159), odds(59), odds(259)) },
  ],
  matches: [MATCH],
  standings: [
    {
      player: ADA,
      team: ZAL,
      place: {
        points: tenThousandths(6_311_610),
        odds: unwrap(StandingsOdds.ofTenThousandths(10_000)),
      },
      playOffs: { points: StandingsPoints.ZERO, odds: null },
      finalFour: { points: null, odds: null },
      final: { points: null, odds: null },
    },
  ],
  survival: [SURVIVAL],
};

/** The same rows as a rule set derives them: the survival row rewrites 41. */
const DERIVED: PointsRows = ROWS;

describe('saveTournamentPoints and loadTournamentPoints', () => {
  it('read back every row exactly, as the decimal text Postgres holds', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await loadTournamentPoints(db, TOURNAMENT, 'production')).toEqual(
      ROWS,
    );
    const stored = await client.query(
      `select m.margin, m.odds, s.place_points, s.play_offs_points, s.final_points
       from match_points m, standings_points s`,
    );
    expect(stored.rows).toEqual([
      {
        margin: '-45.00',
        odds: '1.59',
        place_points: '631.1610',
        play_offs_points: '0.0000',
        final_points: null,
      },
    ]);
  });

  it("keep a production survival row's sportbet id, and read it back as a stored row", async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await loadStoredSurvivalRows(db, TOURNAMENT)).toEqual([
      {
        id: 41,
        player: ADA,
        round: roundNo(1),
        team: FEN,
        storedPoints: hundredths(1200),
      },
    ]);
  });

  it('leave one set of rows when saved twice under one source, and the other sources untouched', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', {
      ...ROWS,
      survival: [{ ...SURVIVAL, storedId: null }],
    });
    await saveTournamentPoints(db, TOURNAMENT, 'sportbet', DERIVED);
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    expect(await countPointsRows(db, TOURNAMENT)).toEqual({
      game_odds: { production: 1, sportbet: 1, ruled: 1 },
      match_points: { production: 1, sportbet: 1, ruled: 1 },
      standings_points: { production: 1, sportbet: 1, ruled: 1 },
      survival_points: { production: 1, sportbet: 1, ruled: 1 },
    });
    expect(await loadTournamentPoints(db, TOURNAMENT, 'sportbet')).toEqual(
      DERIVED,
    );
  });

  it('replace the rows of a source with the new ones', async () => {
    await saveTournamentPoints(db, TOURNAMENT, 'production', ROWS);
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', DERIVED);
    const moved: PointsRows = {
      odds: [],
      matches: [{ ...MATCH, player: BEN }],
      standings: [],
      survival: [],
    };
    await saveTournamentPoints(db, TOURNAMENT, 'ruled', moved);
    expect(await loadTournamentPoints(db, TOURNAMENT, 'ruled')).toEqual(moved);
  });

  it('refuse a production survival row without its stored id', async () => {
    await expect(
      saveTournamentPoints(db, TOURNAMENT, 'production', {
        ...ROWS,
        survival: [{ ...SURVIVAL, storedId: null }],
      }),
    ).rejects.toThrow(/production survival row.*needs its id/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/points.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  5 failed (5)`: `TypeError: saveTournamentPoints is not a function`.

- [ ] **Step 3: The repository**

Create `packages/db/src/points/repository.ts`:

```ts
import {
  CrowdOdds,
  Odds,
  Points,
  roundNumber,
  StandingsOdds,
  StandingsPoints,
  type GameOdds,
  type PointsRows,
  type StandingsLine,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type Tournament,
} from '@sportbet/domain';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  notInArray,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { advanceIdentitySequences } from '../identity';
import {
  excluded,
  gameOf,
  inChunks,
  keyOf,
  playerOf,
  stored,
  teamOf,
  unitsOf,
} from '../edge';
import { roundIdIn, roundIdsOf } from '../season/repository';
import { games, rounds } from '../season/schema';
import { teams } from '../team/schema';
import {
  gameOdds,
  matchPoints,
  POINTS_SOURCES,
  standingsPoints,
  survivalPoints,
  type PointsSource,
} from './schema';

/** The four points tables, as the load report counts them. */
export const POINTS_TABLES = [
  'game_odds',
  'match_points',
  'standings_points',
  'survival_points',
] as const;

export type PointsTable = (typeof POINTS_TABLES)[number];

const numericText = z.string();
const oddsRows = z.array(
  z.object({
    game: z.int(),
    home: numericText,
    away: numericText,
    draw: numericText,
  }),
);
const matchRows = z.array(
  z.object({
    player: z.int(),
    game: z.int(),
    winner: numericText,
    margin: numericText,
    bingo: numericText,
    oddsPoints: numericText,
    full: numericText,
    odds: numericText,
    serija: numericText,
  }),
);
const line = numericText.nullable();
const standingsRows = z.array(
  z.object({
    player: z.int(),
    team: z.int(),
    placePoints: line,
    placeOdds: line,
    playOffsPoints: line,
    playOffsOdds: line,
    finalFourPoints: line,
    finalFourOdds: line,
    finalPoints: line,
    finalOdds: line,
  }),
);
const survivalRows = z.array(
  z.object({
    id: z.int(),
    player: z.int(),
    round: z.int(),
    team: z.int(),
    points: numericText.nullable(),
    provisional: z.boolean(),
    storedRowId: z.int().nullable(),
  }),
);

const gamesOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.tournamentId, tournament.id));
const teamsOf = (db: Executor, tournament: Tournament) =>
  db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.tournamentId, tournament.id));

const text = (value: { toString(): string } | null): string | null =>
  value === null ? null : value.toString();

/**
 * Replaces the tournament's rows of `source` in the four points tables with
 * `rows`, in one transaction, so saving the same result twice leaves the
 * same rows and the other sources' rows are never touched. `rows` is a
 * TournamentPoints as recalculateTournament returns it, or production's
 * rows read back. A production survival row is the stored row itself: its
 * `storedId` is its own id, sportbet's `point_survivals.id`, kept as the
 * row's id (and upserted, so a derived row that rewrites it keeps its
 * reference); a derived row's `storedId` is the production row it rewrites.
 */
export async function saveTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
  rows: PointsRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    const roundIds = await roundIdsOf(tx, tournament);
    await tx
      .delete(gameOdds)
      .where(
        and(
          eq(gameOdds.source, source),
          inArray(gameOdds.gameId, gamesOf(tx, tournament)),
        ),
      );
    await tx
      .delete(matchPoints)
      .where(
        and(
          eq(matchPoints.source, source),
          inArray(matchPoints.gameId, gamesOf(tx, tournament)),
        ),
      );
    await tx
      .delete(standingsPoints)
      .where(
        and(
          eq(standingsPoints.source, source),
          inArray(standingsPoints.teamId, teamsOf(tx, tournament)),
        ),
      );
    const survival = rows.survival.map((row) => {
      const values = {
        source,
        playerId: keyOf(row.player, 'player'),
        tournamentId: tournament.id,
        roundId: roundIdIn(roundIds, row.round, tournament),
        teamId: keyOf(row.team, 'team'),
        points: text(row.points),
        provisional: row.provisional,
      };
      if (source !== 'production') {
        return { ...values, storedRowId: row.storedId };
      }
      if (row.storedId === null) {
        throw new Error(
          'saveTournamentPoints: a production survival row is a stored row and needs its id',
        );
      }
      return { ...values, id: row.storedId, storedRowId: null };
    });
    const kept: SQL[] = [
      eq(survivalPoints.source, source),
      eq(survivalPoints.tournamentId, tournament.id),
    ];
    const keptIds = survival.flatMap((row) => ('id' in row ? [row.id] : []));
    if (source === 'production' && keptIds.length > 0) {
      kept.push(notInArray(survivalPoints.id, keptIds));
    }
    await tx.delete(survivalPoints).where(and(...kept));

    await inChunks(rows.odds, (chunk) =>
      tx.insert(gameOdds).values(
        chunk.map(({ game, odds }) => ({
          source,
          gameId: game,
          home: odds.home.toString(),
          away: odds.away.toString(),
          draw: odds.draw.toString(),
        })),
      ),
    );
    await inChunks(rows.matches, (chunk) =>
      tx.insert(matchPoints).values(
        chunk.map((row) => ({
          source,
          playerId: keyOf(row.player, 'player'),
          gameId: row.game,
          winner: row.points.winner.toString(),
          margin: row.points.margin.toString(),
          bingo: row.points.bingo.toString(),
          oddsPoints: row.points.oddsPoints.toString(),
          full: row.points.full.toString(),
          odds: row.points.odds.toString(),
          serija: row.serija.toString(),
        })),
      ),
    );
    await inChunks(rows.standings, (chunk) =>
      tx.insert(standingsPoints).values(
        chunk.map((row) => ({
          source,
          playerId: keyOf(row.player, 'player'),
          teamId: keyOf(row.team, 'team'),
          placePoints: text(row.place.points),
          placeOdds: text(row.place.odds),
          playOffsPoints: text(row.playOffs.points),
          playOffsOdds: text(row.playOffs.odds),
          finalFourPoints: text(row.finalFour.points),
          finalFourOdds: text(row.finalFour.odds),
          finalPoints: text(row.final.points),
          finalOdds: text(row.final.odds),
        })),
      ),
    );
    const production = survival.filter((row) => 'id' in row);
    const derived = survival.filter((row) => !('id' in row));
    // A derived row's id is generated: it must never be one a production
    // row was saved under.
    await inChunks(production, (chunk) =>
      tx
        .insert(survivalPoints)
        .overridingSystemValue()
        .values(chunk)
        .onConflictDoUpdate({
          target: survivalPoints.id,
          set: {
            source: excluded(survivalPoints.source),
            playerId: excluded(survivalPoints.playerId),
            tournamentId: excluded(survivalPoints.tournamentId),
            roundId: excluded(survivalPoints.roundId),
            teamId: excluded(survivalPoints.teamId),
            points: excluded(survivalPoints.points),
            provisional: excluded(survivalPoints.provisional),
            storedRowId: excluded(survivalPoints.storedRowId),
          },
        }),
    );
    if (production.length > 0) {
      await advanceIdentitySequences(tx, [survivalPoints]);
    }
    await inChunks(derived, (chunk) => tx.insert(survivalPoints).values(chunk));
  });
}

/** The tournament's game odds rows of `source`, by game. */
export async function loadGameOdds(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<GameOdds[]> {
  const rows = await db
    .select({
      game: gameOdds.gameId,
      home: gameOdds.home,
      away: gameOdds.away,
      draw: gameOdds.draw,
    })
    .from(gameOdds)
    .where(
      and(
        eq(gameOdds.source, source),
        inArray(gameOdds.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(gameOdds.gameId));
  return oddsRows.parse(rows).map((row) => {
    const key = `${source}/${String(row.game)}`;
    const odds = (value: string) =>
      stored(
        Odds.ofHundredths(unitsOf(value, 2, 'game_odds', key)),
        'game_odds',
        key,
      );
    return {
      game: gameOf(row.game),
      odds: CrowdOdds.stored(odds(row.home), odds(row.away), odds(row.draw)),
    };
  });
}

/**
 * The tournament's points rows of `source`: odds by game, match points by
 * game then player, standings by player then team, survival by player,
 * round and id. A production survival row's `storedId` is its own id.
 */
export async function loadTournamentPoints(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<PointsRows> {
  const pointsOf = (value: string, table: string, key: string) =>
    stored(Points.ofHundredths(unitsOf(value, 2, table, key)), table, key);

  const matchResult = await db
    .select({
      player: matchPoints.playerId,
      game: matchPoints.gameId,
      winner: matchPoints.winner,
      margin: matchPoints.margin,
      bingo: matchPoints.bingo,
      oddsPoints: matchPoints.oddsPoints,
      full: matchPoints.full,
      odds: matchPoints.odds,
      serija: matchPoints.serija,
    })
    .from(matchPoints)
    .where(
      and(
        eq(matchPoints.source, source),
        inArray(matchPoints.gameId, gamesOf(db, tournament)),
      ),
    )
    .orderBy(asc(matchPoints.gameId), asc(matchPoints.playerId));
  const matches: StoredMatchRow[] = matchRows.parse(matchResult).map((row) => {
    const key = `${source}/${String(row.player)}/${String(row.game)}`;
    const of = (value: string) => pointsOf(value, 'match_points', key);
    return {
      player: playerOf(row.player),
      game: gameOf(row.game),
      points: {
        winner: of(row.winner),
        margin: of(row.margin),
        bingo: of(row.bingo),
        oddsPoints: of(row.oddsPoints),
        full: of(row.full),
        odds: stored(
          Odds.ofHundredths(unitsOf(row.odds, 2, 'match_points', key)),
          'match_points',
          key,
        ),
      },
      serija: of(row.serija),
    };
  });

  const standingsResult = await db
    .select({
      player: standingsPoints.playerId,
      team: standingsPoints.teamId,
      placePoints: standingsPoints.placePoints,
      placeOdds: standingsPoints.placeOdds,
      playOffsPoints: standingsPoints.playOffsPoints,
      playOffsOdds: standingsPoints.playOffsOdds,
      finalFourPoints: standingsPoints.finalFourPoints,
      finalFourOdds: standingsPoints.finalFourOdds,
      finalPoints: standingsPoints.finalPoints,
      finalOdds: standingsPoints.finalOdds,
    })
    .from(standingsPoints)
    .where(
      and(
        eq(standingsPoints.source, source),
        inArray(standingsPoints.teamId, teamsOf(db, tournament)),
      ),
    )
    .orderBy(asc(standingsPoints.playerId), asc(standingsPoints.teamId));
  const standings: StandingsRow[] = standingsRows
    .parse(standingsResult)
    .map((row) => {
      const key = `${source}/${String(row.player)}/${String(row.team)}`;
      const standingsLine = (
        points: string | null,
        odds: string | null,
      ): StandingsLine => ({
        points:
          points === null
            ? null
            : stored(
                StandingsPoints.ofTenThousandths(
                  unitsOf(points, 4, 'standings_points', key),
                ),
                'standings_points',
                key,
              ),
        odds:
          odds === null
            ? null
            : stored(
                StandingsOdds.ofTenThousandths(
                  unitsOf(odds, 4, 'standings_points', key),
                ),
                'standings_points',
                key,
              ),
      });
      return {
        player: playerOf(row.player),
        team: teamOf(row.team),
        place: standingsLine(row.placePoints, row.placeOdds),
        playOffs: standingsLine(row.playOffsPoints, row.playOffsOdds),
        finalFour: standingsLine(row.finalFourPoints, row.finalFourOdds),
        final: standingsLine(row.finalPoints, row.finalOdds),
      };
    });

  const survivalResult = await db
    .select({
      id: survivalPoints.id,
      player: survivalPoints.playerId,
      round: rounds.number,
      team: survivalPoints.teamId,
      points: survivalPoints.points,
      provisional: survivalPoints.provisional,
      storedRowId: survivalPoints.storedRowId,
    })
    .from(survivalPoints)
    .innerJoin(rounds, eq(rounds.id, survivalPoints.roundId))
    .where(
      and(
        eq(survivalPoints.source, source),
        eq(survivalPoints.tournamentId, tournament.id),
      ),
    )
    .orderBy(
      asc(survivalPoints.playerId),
      asc(rounds.number),
      asc(survivalPoints.id),
    );
  const survival: SurvivalPoints[] = survivalRows
    .parse(survivalResult)
    .map((row) => {
      const key = String(row.id);
      return {
        player: playerOf(row.player),
        round: stored(roundNumber(row.round), 'survival_points', key),
        team: teamOf(row.team),
        points:
          row.points === null
            ? null
            : pointsOf(row.points, 'survival_points', key),
        provisional: row.provisional,
        storedId: source === 'production' ? row.id : row.storedRowId,
      };
    });

  return {
    odds: await loadGameOdds(db, tournament, source),
    matches,
    standings,
    survival,
  };
}

/** How many rows of each source each points table holds for the tournament. */
export async function countPointsRows(
  db: Executor,
  tournament: Tournament,
): Promise<Record<PointsTable, Record<PointsSource, number>>> {
  const sourceCounts = z.array(
    z.object({ source: z.enum(POINTS_SOURCES), rows: z.int() }),
  );
  const bySource = (rows: unknown): Record<PointsSource, number> => {
    const parsed = sourceCounts.parse(rows);
    const of = (source: PointsSource) =>
      parsed.find((row) => row.source === source)?.rows ?? 0;
    return {
      production: of('production'),
      sportbet: of('sportbet'),
      ruled: of('ruled'),
    };
  };
  return {
    game_odds: bySource(
      await db
        .select({ source: gameOdds.source, rows: count() })
        .from(gameOdds)
        .where(inArray(gameOdds.gameId, gamesOf(db, tournament)))
        .groupBy(gameOdds.source),
    ),
    match_points: bySource(
      await db
        .select({ source: matchPoints.source, rows: count() })
        .from(matchPoints)
        .where(inArray(matchPoints.gameId, gamesOf(db, tournament)))
        .groupBy(matchPoints.source),
    ),
    standings_points: bySource(
      await db
        .select({ source: standingsPoints.source, rows: count() })
        .from(standingsPoints)
        .where(inArray(standingsPoints.teamId, teamsOf(db, tournament)))
        .groupBy(standingsPoints.source),
    ),
    survival_points: bySource(
      await db
        .select({ source: survivalPoints.source, rows: count() })
        .from(survivalPoints)
        .where(eq(survivalPoints.tournamentId, tournament.id))
        .groupBy(survivalPoints.source),
    ),
  };
}
```

Replace the contents of `packages/db/src/index.ts` with:

```ts
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from './client';
export { databaseEnvSchema, databaseUrlSchema } from './config';
export { advanceIdentitySequences } from './identity';
export {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournamentPlayers,
  type TournamentPlayer,
} from './player/repository';
export {
  countPointsRows,
  loadGameOdds,
  loadTournamentPoints,
  POINTS_TABLES,
  saveTournamentPoints,
  type PointsTable,
} from './points/repository';
export { POINTS_SOURCES, type PointsSource } from './points/schema';
export {
  loadMatchPredictions,
  saveMatchPredictions,
} from './prediction/repository';
export {
  loadSeason,
  saveGames,
  saveRounds,
  type SavedRound,
} from './season/repository';
export {
  loadStandingsPredictions,
  saveStandingsPredictions,
} from './standings/repository';
export {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
  saveSurvivalPicks,
} from './survival/repository';
export {
  listTeams,
  loadTeamOutcomes,
  saveTeamOutcomes,
  saveTeams,
  type TeamRow,
} from './team/repository';
export {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from './tournament/repository';
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  9 passed (9)` and `Tests  191 passed (191)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "$(cat <<'EOF'
feat(db): saveTournamentPoints and loadTournamentPoints under a named points source (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: One tournament's inputs, the golden master across the database, and the migrations entry

`loadTournamentInputs(db, tournament, reads)` reads everything `recalculateTournament` needs in one repeatable-read, read-only transaction; `reads` always names what it reads - the stored odds or the votes, the stored survival rows or the picks. sportbet's golden scenario, saved through the repositories under sportbet's own ids and read back, reproduces `golden-points.json` under `sportbetRules` both ways and the ruled differences under `ruledRules`. The reader will start the same `postgres:18.6` and migrate it the same way the tests do, so `POSTGRES_IMAGE` moves beside `runMigrations` and `MIGRATIONS_FOLDER`, and the three get a runtime entry, `@sportbet/db/migrations` (the web bundler cannot take `new URL('../migrations', import.meta.url)`, so they stay out of the main entry).

**Files:**
- Create: `packages/db/src/recalculation/repository.ts`
- Modify: `packages/db/src/index.ts`, `packages/db/src/migrations.ts`, `packages/db/src/testing/database.ts`, `packages/db/package.json`, `infra/compose/app.yml`, `infra/host/backup.sh`, `Dockerfile`
- Test: `packages/db/test/golden.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/db/test/golden.test.ts`:

```ts
// sportbet's golden scenario saved through the repositories and read back
// with loadTournamentInputs: the domain's golden master (golden.test.ts in
// packages/domain), now across the database.

import {
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type GameId,
  type PointsRows,
  type RuleSet,
  type Tournament,
  type TournamentInputs,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  goldenOdds,
  goldenSurvivalRows,
  player,
  snapshotOf,
  team,
  unwrap,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTournamentInputs,
  loadTournamentPoints,
  saveGames,
  saveMatchPredictions,
  savePlayers,
  saveRounds,
  saveStandingsPredictions,
  saveSurvivalPicks,
  saveTeamOutcomes,
  saveTeams,
  saveTournament,
  saveTournamentPlayers,
  saveTournamentPoints,
  type Db,
  type InputReads,
} from '../src';
import { useTestDatabase } from '../src/testing';

const { db } = useTestDatabase();

/** sportbet's own ids for the golden rows (its golden dump numbers them so). */
const IDS: GoldenIds = {
  player: (name) => player(String(GOLDEN.players.indexOf(name) + 1)),
  team: (name) => team(String(GOLDEN.teams.indexOf(name) + 5)),
  game: (id) => gameNo(id + 6),
};

const GOLDEN_EL: Tournament = {
  id: 2,
  slug: 'golden-el',
  name: 'Golden EL',
  format: 'euroleague',
  endsOn: GOLDEN.endsOn,
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: GOLDEN.tableIsFinal,
};

const FROM_VOTES: InputReads = { odds: 'from-votes', survival: 'picks' };
const AS_STORED: InputReads = { odds: 'stored', survival: 'stored-rows' };

const recalculate = (inputs: TournamentInputs, rules: RuleSet) =>
  unwrap(recalculateTournament(inputs, rules));

/**
 * Production's rows, as the reader loads them: the stored odds and survival
 * rows of golden-points.json, and the match and standings rows it holds -
 * which are what the scenario recalculates to (the domain's golden test).
 */
function productionRows(): PointsRows {
  const derived = recalculate(goldenInputs({}, IDS), sportbetRules);
  return {
    odds: [...goldenOdds(GOLDEN_POINTS.game_odds, IDS)].map(([game, odds]) => ({
      game,
      odds,
    })),
    matches: derived.matches,
    standings: derived.standings,
    survival: goldenSurvivalRows(GOLDEN_POINTS.point_survivals, IDS).map(
      (row) => ({
        player: row.player,
        round: row.round,
        team: row.team,
        points: row.storedPoints,
        provisional: false,
        storedId: row.id,
      }),
    ),
  };
}

async function saveGolden(database: Db): Promise<void> {
  const inputs = goldenInputs({}, IDS);
  await saveTournament(database, GOLDEN_EL);
  await saveTeams(
    database,
    GOLDEN_EL,
    GOLDEN.teams.map((name) => ({ id: IDS.team(name), name })),
  );
  await saveRounds(
    database,
    GOLDEN_EL,
    GOLDEN.rounds.map((round, index) => {
      const saved = inputs.season.rounds[index];
      if (saved === undefined) throw new Error('golden: a round is missing');
      return { id: index + 4, name: round.name, round: saved };
    }),
  );
  await savePlayers(
    database,
    GOLDEN.players.map((name) => ({ id: IDS.player(name), username: name })),
  );
  await saveTournamentPlayers(
    database,
    GOLDEN_EL,
    inputs.players.map((id) => ({
      player: id,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
  );
  await saveGames(database, GOLDEN_EL, inputs.season.games);
  await saveTeamOutcomes(database, inputs.outcomes);
  await saveMatchPredictions(database, inputs.predictions);
  await saveStandingsPredictions(database, inputs.standings);
  if (inputs.survival.from !== 'picks') {
    throw new Error('golden: the scenario holds a pick history');
  }
  await saveSurvivalPicks(database, GOLDEN_EL, inputs.survival.runs);
  await saveTournamentPoints(
    database,
    GOLDEN_EL,
    'production',
    productionRows(),
  );
}

beforeEach(() => saveGolden(db));

const byGameThenPlayer = <T extends { game: GameId; player: string }>(
  rows: readonly T[],
) =>
  [...rows].sort((a, b) => a.game - b.game || a.player.localeCompare(b.player));

describe('golden master across the database', () => {
  it('golden (db): the saved scenario reads back as its own inputs', async () => {
    const loaded = await loadTournamentInputs(db, GOLDEN_EL, FROM_VOTES);
    const golden = goldenInputs({}, IDS);
    expect(loaded.season).toEqual(golden.season);
    expect(loaded.players).toEqual(golden.players);
    expect(byGameThenPlayer(loaded.predictions)).toEqual(
      byGameThenPlayer(golden.predictions),
    );
    expect(loaded.standings).toEqual(golden.standings);
    expect(loaded.outcomes).toEqual(golden.outcomes);
    expect(loaded.odds).toBe('from-votes');
    expect(loaded.survival).toEqual(golden.survival);
  });

  it("golden (db): the stored reads are production's odds and survival rows, by sportbet id", async () => {
    const loaded = await loadTournamentInputs(db, GOLDEN_EL, AS_STORED);
    expect(loaded.odds).toEqual(goldenOdds(GOLDEN_POINTS.game_odds, IDS));
    expect(loaded.survival).toEqual({
      from: 'stored-rows',
      rows: goldenSurvivalRows(GOLDEN_POINTS.point_survivals, IDS),
    });
  });

  it('golden (db): production reads back as golden-points.json', async () => {
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'production'), IDS),
    ).toEqual(GOLDEN_POINTS);
  });

  it('golden (db): reproduces every entry under sportbetRules from the votes and the picks', async () => {
    const inputs = await loadTournamentInputs(db, GOLDEN_EL, FROM_VOTES);
    expect(snapshotOf(recalculate(inputs, sportbetRules), IDS)).toEqual(
      GOLDEN_POINTS,
    );
  });

  it('golden (db): reproduces every entry under sportbetRules from the stored odds and survival rows (CO-7, SU-10)', async () => {
    const inputs = await loadTournamentInputs(db, GOLDEN_EL, AS_STORED);
    expect(snapshotOf(recalculate(inputs, sportbetRules), IDS)).toEqual(
      GOLDEN_POINTS,
    );
  });

  it('golden (db, ruled): differs from sportbet exactly where the rulings say', async () => {
    const inputs = await loadTournamentInputs(db, GOLDEN_EL, FROM_VOTES);
    expect(snapshotOf(recalculate(inputs, ruledRules), IDS)).toEqual(
      GOLDEN_POINTS_RULED,
    );
  });

  it('golden (db): a recalculation saved under its rule set reads back as the same rows', async () => {
    const inputs = await loadTournamentInputs(db, GOLDEN_EL, AS_STORED);
    await saveTournamentPoints(
      db,
      GOLDEN_EL,
      'sportbet',
      recalculate(inputs, sportbetRules),
    );
    const ruledInputs = await loadTournamentInputs(db, GOLDEN_EL, FROM_VOTES);
    await saveTournamentPoints(
      db,
      GOLDEN_EL,
      'ruled',
      recalculate(ruledInputs, ruledRules),
    );
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'sportbet'), IDS),
    ).toEqual(GOLDEN_POINTS);
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'ruled'), IDS),
    ).toEqual(GOLDEN_POINTS_RULED);
    // Each sportbet survival row rewrites the production row of its id.
    const sportbet = await loadTournamentPoints(db, GOLDEN_EL, 'sportbet');
    expect(sportbet.survival.map((row) => row.storedId).toSorted()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm --filter @sportbet/db exec vitest run test/golden.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `Test Files  1 failed (1)` and `Tests  6 failed | 1 passed (7)`: `TypeError: loadTournamentInputs is not a function` (production's rows already read back).

- [ ] **Step 3: loadTournamentInputs**

Create `packages/db/src/recalculation/repository.ts`:

```ts
import type { Tournament, TournamentInputs } from '@sportbet/domain';
import type { Executor } from '../client';
import { listTournamentPlayers } from '../player/repository';
import { loadGameOdds } from '../points/repository';
import { loadMatchPredictions } from '../prediction/repository';
import { loadSeason } from '../season/repository';
import { loadStandingsPredictions } from '../standings/repository';
import {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
} from '../survival/repository';
import { loadTeamOutcomes } from '../team/repository';

/**
 * What a recalculation reads besides the tournament's own rows, always
 * named by the caller: the odds each game was scored with as production
 * stored them (`'stored'`, CO-7) or computed from the votes; survival from
 * production's stored rows (`'stored-rows'`, SU-10) or from the picks.
 * Parity under sportbetRules reads `{ odds: 'stored', survival:
 * 'stored-rows' }`; the ruled set reads `{ odds: 'from-votes', survival:
 * 'picks' }`.
 */
export interface InputReads {
  readonly odds: 'stored' | 'from-votes';
  readonly survival: 'stored-rows' | 'picks';
}

/**
 * One tournament's TournamentInputs, read in one repeatable-read, read-only
 * transaction so they are one consistent snapshot. Its players are the
 * tournament's `tournament_players`.
 */
export async function loadTournamentInputs(
  db: Executor,
  tournament: Tournament,
  reads: InputReads,
): Promise<TournamentInputs> {
  return db.transaction(
    async (tx) => {
      const season = await loadSeason(tx, tournament);
      const players = await listTournamentPlayers(tx, tournament);
      const predictions = await loadMatchPredictions(tx, tournament);
      const odds =
        reads.odds === 'stored'
          ? new Map(
              (await loadGameOdds(tx, tournament, 'production')).map(
                ({ game, odds: stored }) => [game, stored],
              ),
            )
          : 'from-votes';
      const survival =
        reads.survival === 'stored-rows'
          ? {
              from: 'stored-rows' as const,
              rows: await loadStoredSurvivalRows(tx, tournament),
            }
          : {
              from: 'picks' as const,
              runs: await loadSurvivalRuns(tx, tournament),
            };
      const standings = await loadStandingsPredictions(tx, tournament);
      const outcomes = await loadTeamOutcomes(tx, tournament);
      return {
        season,
        players,
        predictions,
        odds,
        survival,
        standings,
        outcomes,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
```

Replace the contents of `packages/db/src/index.ts` with:

```ts
export {
  createDb,
  ping,
  type Db,
  type DbHandle,
  type Executor,
  type Tx,
} from './client';
export { databaseEnvSchema, databaseUrlSchema } from './config';
export { advanceIdentitySequences } from './identity';
export {
  listPlayers,
  listTournamentPlayers,
  loadPlayerStatuses,
  savePlayers,
  saveTournamentPlayers,
  type TournamentPlayer,
} from './player/repository';
export {
  countPointsRows,
  loadGameOdds,
  loadTournamentPoints,
  POINTS_TABLES,
  saveTournamentPoints,
  type PointsTable,
} from './points/repository';
export { POINTS_SOURCES, type PointsSource } from './points/schema';
export {
  loadMatchPredictions,
  saveMatchPredictions,
} from './prediction/repository';
export {
  loadTournamentInputs,
  type InputReads,
} from './recalculation/repository';
export {
  loadSeason,
  saveGames,
  saveRounds,
  type SavedRound,
} from './season/repository';
export {
  loadStandingsPredictions,
  saveStandingsPredictions,
} from './standings/repository';
export {
  loadStoredSurvivalRows,
  loadSurvivalRuns,
  saveSurvivalPicks,
} from './survival/repository';
export {
  listTeams,
  loadTeamOutcomes,
  saveTeamOutcomes,
  saveTeams,
  type TeamRow,
} from './team/repository';
export {
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  saveTournament,
  type NewTournament,
} from './tournament/repository';
```

- [ ] **Step 4: The migrations entry**

Replace the contents of `packages/db/src/migrations.ts` with:

```ts
// A runtime entry of its own (`@sportbet/db/migrations`), not part of the
// package's main entry: the web app's bundler would try to resolve
// `../migrations` below as a module, and the web app never migrates.
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/**
 * `migrations/` beside `src/` - and beside `dist/` in the migrate image, where
 * this file is bundled into dist/migrate.mjs, so the same relative path holds.
 * The production-copy reader's bundle (tools/migrate) gets a copy beside its
 * own `dist/` for the same reason.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

/**
 * The Postgres image every test suite and the production-copy reader run
 * on; staging's Compose file (infra/compose/app.yml) and
 * infra/host/backup.sh pin the same exact tag, bumped deliberately together
 * with the node tag in the Dockerfile.
 */
export const POSTGRES_IMAGE = 'postgres:18.6';

export async function runMigrations(
  url: string,
  migrationsFolder: string,
): Promise<void> {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
```

In `packages/db/src/testing/database.ts`, replace:

```ts
import { connect, type Db } from '../client';
import { databaseUrlSchema } from '../config';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrations';

/**
 * The Postgres image every test suite runs on; staging's Compose file
 * (infra/compose/app.yml) and infra/host/backup.sh pin the same exact tag,
 * bumped deliberately together with the node tag in the Dockerfile.
 */
const POSTGRES_IMAGE = 'postgres:18.6';

declare module 'vitest' {
```

with:

```ts
import { connect, type Db } from '../client';
import { databaseUrlSchema } from '../config';
import {
  MIGRATIONS_FOLDER,
  POSTGRES_IMAGE,
  runMigrations,
} from '../migrations';

declare module 'vitest' {
```

In `packages/db/package.json`, replace:

```json
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/index.ts"
  },
```

with:

```json
  "exports": {
    ".": "./src/index.ts",
    "./migrations": "./src/migrations.ts",
    "./testing": "./src/testing/index.ts"
  },
```

The Compose file, the backup script and the Dockerfile name the file that pins the image:

In `infra/compose/app.yml`, replace:

```yaml
#
# postgres:18.x is pinned exactly, bumped deliberately together with the
# same tag in packages/db/src/testing/database.ts, infra/host/backup.sh and
# the node tag in the Dockerfile.
services:
```

with:

```yaml
#
# postgres:18.x is pinned exactly, bumped deliberately together with the
# same tag in packages/db/src/migrations.ts, infra/host/backup.sh and
# the node tag in the Dockerfile.
services:
```

In `infra/host/backup.sh`, replace:

```bash
# postgres:18.x below is pinned exactly, bumped deliberately together with
# the same tag in infra/compose/app.yml and
# packages/db/src/testing/database.ts.
set -Eeuo pipefail
```

with:

```bash
# postgres:18.x below is pinned exactly, bumped deliberately together with
# the same tag in infra/compose/app.yml and
# packages/db/src/migrations.ts.
set -Eeuo pipefail
```

In `Dockerfile`, replace:

```dockerfile
# packages/db/src/testing.ts, backup.sh) and caddy:2.x.y (edge.yml) are
```

with:

```dockerfile
# packages/db/src/migrations.ts, backup.sh) and caddy:2.x.y (edge.yml) are
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:db 2>&1 | grep -E "Test Files|Tests "
pnpm build 2>&1 | grep -E "build: Done|rror"
```

Expected: lint and typecheck clean; `Test Files  10 passed (10)` and `Tests  198 passed (198)`; `packages/db build: Done` and `apps/web build: Done` (the web bundle no longer sees `migrations.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/db infra/compose/app.yml infra/host/backup.sh Dockerfile
git commit -m "$(cat <<'EOF'
feat(db): loadTournamentInputs; the golden master across the database; @sportbet/db/migrations (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: The reader's package, and the only columns it reads

`@sportbet/migrate` is a new workspace package beside `apps/web`: migrate -> db -> domain, and nothing imports migrate. Its first module is `READ_COLUMNS`, the only place the reader names a sportbet column: one Zod object per table, each column carrying the MySQL type sportbet's migrations give it (the schema drift check compares it) and how its value is parsed. From `users` it reads `id` and `username` and nothing else. CI runs the package's suite; the image build learns the new workspace member; `.gitignore` gains a second guard against a dump in the repository.

**Files:**
- Create: `tools/migrate/package.json`, `tools/migrate/tsconfig.json`, `tools/migrate/vitest.config.ts`, `tools/migrate/test/global-setup.ts`, `tools/migrate/src/read-columns.ts`
- Modify: `pnpm-workspace.yaml`, `pnpm-lock.yaml` (by `pnpm install`), `eslint.config.js`, `package.json`, `.github/workflows/ci.yml`, `Dockerfile`, `.gitignore`
- Test: `tools/migrate/src/read-columns.test.ts`

- [ ] **Step 1: The package**

In `pnpm-workspace.yaml`, replace:

```yaml
  - apps/*
  - packages/*

saveExact: true
```

with:

```yaml
  - apps/*
  - packages/*
  - tools/*

saveExact: true
```

Create `tools/migrate/package.json`:

```json
{
  "name": "@sportbet/migrate",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p .",
    "test": "vitest run"
  },
  "dependencies": {
    "@sportbet/db": "workspace:*",
    "@sportbet/domain": "workspace:*",
    "@testcontainers/mysql": "12.1.0",
    "@testcontainers/postgresql": "12.1.0",
    "mysql2": "3.24.5",
    "testcontainers": "12.1.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "26.6.3",
    "esbuild": "0.28.2",
    "typescript": "6.0.3",
    "vitest": "5.0.2"
  }
}
```

Create `tools/migrate/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Create `tools/migrate/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The map, the dump checks and the fetch rules run with no container;
    // load.test.ts writes into the suite's test database, and reader.test.ts
    // runs the whole reader on a synthetic dump, on the MySQL and Postgres
    // containers it starts itself.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One test database for the run; files take turns so truncation cannot race.
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
});
```

Create `tools/migrate/test/global-setup.ts`:

```ts
import { startTestDatabase } from '@sportbet/db/testing';
import type { TestProject } from 'vitest/node';

// The migrated Postgres load.test.ts writes into. The end-to-end test starts
// its own containers through the reader, as a real run does.
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  project.provide('databaseUrl', database.url);
  return database.stop;
}
```

```bash
pnpm install 2>&1 | tail -1
```

Expected: `Done in ...`; `pnpm-lock.yaml` gains the `tools/migrate` importer (mysql2 3.24.5, @testcontainers/mysql 12.1.0 on the testcontainers 12.1.0 already locked).

- [ ] **Step 2: The layering, the script, CI, the image and the ignore list**

In `eslint.config.js`, replace:

```js
import tseslint from 'typescript-eslint';

// Decision 5: the direction of dependencies (web -> db -> domain) is enforced.
const deepImport = {
  regex: '^@sportbet/[^/]+/(src|dist)(/|$)',
```

with:

```js
import tseslint from 'typescript-eslint';

// Decision 5: the direction of dependencies (web -> db -> domain, and
// migrate -> db -> domain beside web) is enforced.
const deepImport = {
  regex: '^@sportbet/[^/]+/(src|dist)(/|$)',
```

In `eslint.config.js`, replace:

```js
// files without going through `@sportbet/*`, silently bypassing every rule below.
const crossPackageRelative = {
  regex: '^(\\.\\./)+(packages|apps|db|domain|web)(/|$)',
  message:
    'Cross-package imports go through @sportbet/*, never a relative path.',
```

with:

```js
// files without going through `@sportbet/*`, silently bypassing every rule below.
const crossPackageRelative = {
  regex: '^(\\.\\./)+(packages|apps|tools|db|domain|web|migrate)(/|$)',
  message:
    'Cross-package imports go through @sportbet/*, never a relative path.',
```

In `eslint.config.js`, replace:

```js
    rules: restrictImports(relativeTesting, {
      regex:
        '^(@sportbet/web|next|react|react-dom|@sportbet/domain/testing|vitest|@testcontainers/postgresql)(/|$)',
      message:
        "db must not depend on web (web -> db -> domain), nor on domain's test-only entry or test tooling outside tests.",
```

with:

```js
    rules: restrictImports(relativeTesting, {
      regex:
        '^(@sportbet/web|@sportbet/migrate|next|react|react-dom|@sportbet/domain/testing|vitest|@testcontainers/postgresql)(/|$)',
      message:
        "db must not depend on web (web -> db -> domain), nor on domain's test-only entry or test tooling outside tests.",
```

In `eslint.config.js`, replace:

```js
        '^(@sportbet/web|@sportbet/migrate|next|react|react-dom|@sportbet/domain/testing|vitest|@testcontainers/postgresql)(/|$)',
      message:
        "db must not depend on web (web -> db -> domain), nor on domain's test-only entry or test tooling outside tests.",
    }),
  },
```

with:

```js
        '^(@sportbet/web|@sportbet/migrate|next|react|react-dom|@sportbet/domain/testing|vitest|@testcontainers/postgresql)(/|$)',
      message:
        "db must not depend on web or migrate (web -> db -> domain), nor on domain's test-only entry or test tooling outside tests.",
    }),
  },
```

In `eslint.config.js`, replace:

```js
    files: ['packages/db/test/**/*.ts', 'packages/db/src/testing/**/*.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|next|react|react-dom)(/|$)',
      message: 'db must not depend on web (web -> db -> domain).',
    }),
  },
```

with:

```js
    files: ['packages/db/test/**/*.ts', 'packages/db/src/testing/**/*.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|@sportbet/migrate|next|react|react-dom)(/|$)',
      message: 'db must not depend on web or migrate (web -> db -> domain).',
    }),
  },
```

In `eslint.config.js`, replace:

```js
    rules: restrictImports({
      regex:
        '^(pg|drizzle-orm|@sportbet/db/testing|@sportbet/domain/testing)(/|$)',
      message:
        "web reaches the database only through @sportbet/db, and never its test helpers, nor domain's test-only entry.",
```

with:

```js
    rules: restrictImports({
      regex:
        '^(pg|drizzle-orm|@sportbet/migrate|@sportbet/db/testing|@sportbet/db/migrations|@sportbet/domain/testing)(/|$)',
      message:
        "web reaches the database only through @sportbet/db, and never its test helpers, nor domain's test-only entry.",
```

In `eslint.config.js`, replace:

```js
        '^(pg|drizzle-orm|@sportbet/migrate|@sportbet/db/testing|@sportbet/db/migrations|@sportbet/domain/testing)(/|$)',
      message:
        "web reaches the database only through @sportbet/db, and never its test helpers, nor domain's test-only entry.",
    }),
  },
```

with:

```js
        '^(pg|drizzle-orm|@sportbet/migrate|@sportbet/db/testing|@sportbet/db/migrations|@sportbet/domain/testing)(/|$)',
      message:
        "web reaches the database only through @sportbet/db, and never its test helpers or its migrations, nor domain's test-only entry, nor the reader.",
    }),
  },
  {
    // The production-copy reader's runtime code (spec 2.2): db and domain
    // through their entry points, zod, mysql2, the container tooling and
    // Node built-ins - never web, next, react or a test-only entry.
    files: ['tools/migrate/**/*.ts'],
    ignores: [
      'tools/migrate/test/**/*.ts',
      'tools/migrate/src/**/*.test.ts',
      'tools/migrate/vitest.config.ts',
    ],
    rules: restrictImports(relativeTesting, {
      regex:
        '^(?!(@sportbet/db|@sportbet/db/migrations|@sportbet/domain|zod|mysql2|mysql2/promise|testcontainers|@testcontainers/mysql|@testcontainers/postgresql|node:[a-z/_]+)$)(?!\\.\\.?/)',
      message:
        'migrate imports only @sportbet/db (and its migrations entry), @sportbet/domain, zod, mysql2, the container tooling and Node built-ins (migrate -> db -> domain).',
    }),
  },
  {
    // Its tests may also reach the two test-only entries and vitest.
    files: ['tools/migrate/test/**/*.ts', 'tools/migrate/src/**/*.test.ts'],
    rules: restrictImports({
      regex: '^(@sportbet/web|next|react|react-dom|pg|drizzle-orm)(/|$)',
      message:
        'migrate tests reach the database only through @sportbet/db and its test entry.',
    }),
  },
```

In `package.json`, replace:

```json
    "test:unit": "pnpm --filter @sportbet/domain test",
    "test:db": "pnpm --filter @sportbet/db test",
    "test:component": "pnpm --filter @sportbet/web test:component",
    "test:feature": "pnpm --filter @sportbet/web test:feature",
```

with:

```json
    "test:unit": "pnpm --filter @sportbet/domain test",
    "test:db": "pnpm --filter @sportbet/db test",
    "test:migrate": "pnpm --filter @sportbet/migrate test",
    "test:component": "pnpm --filter @sportbet/web test:component",
    "test:feature": "pnpm --filter @sportbet/web test:feature",
```

In `.github/workflows/ci.yml`, replace:

```yaml
      - run: pnpm test:component
      - run: pnpm test:db
      - run: pnpm test:feature
```

with:

```yaml
      - run: pnpm test:component
      - run: pnpm test:db
      # The production-copy reader, on a synthetic dump only: CI has no OCI
      # credentials and never reaches Oracle.
      - run: pnpm test:migrate
      - run: pnpm test:feature
```

In `Dockerfile`, replace:

```dockerfile
COPY packages/db/package.json packages/db/
```

with:

```dockerfile
COPY packages/db/package.json packages/db/
COPY tools/migrate/package.json tools/migrate/
```

In `.gitignore`, replace:

```gitignore
.env.*
.vercel
```

with:

```gitignore
.env.*
.vercel
# The production-copy reader never writes into the repository; a second
# guard in case a dump is ever saved here by hand (spec 2.2).
*.sql
*.sql.gz
sportbet-migrate-*
!packages/db/migrations/*.sql
# The reader's bundle carries a copy of db's migrations (build.mjs).
tools/migrate/migrations/
```

- [ ] **Step 3: Write the failing test**

Create `tools/migrate/src/read-columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';

/** Personal data and sign-in material: never selected from any table. */
const FORBIDDEN_COLUMNS: readonly string[] = [
  'surname',
  'email',
  'google_id',
  'remember_token',
  'ip_address',
  'password',
];

/** Tables the reader never reads at all. */
const UNREAD_TABLES: readonly string[] = [
  'audit_logins',
  'audit_prediction_games',
  'audit_prediction_survival',
  'login_codes',
  'sessions',
  'league_invites',
  'messages',
  'settings',
  'colors',
  'points_calculations',
  'league_game_odds',
];

describe('READ_COLUMNS', () => {
  it('reads exactly the id and the username of a user: never a name', () => {
    expect(columnsOf('users')).toEqual(['id', 'username']);
  });

  it('reads only which tournament a league belongs to, and who is in it', () => {
    expect(columnsOf('leagues')).toEqual(['id', 'tournament_id']);
    expect(columnsOf('league_members')).toEqual(['league_id', 'user_id']);
  });

  it('never reads an email, surname, Google id, token, IP address or password', () => {
    const read = SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column) => ({ table, column })),
    );
    expect(
      read.filter(({ column }) => FORBIDDEN_COLUMNS.includes(column)),
    ).toEqual([]);
  });

  it('never reads an audit, sign-in, message or football table', () => {
    expect(
      SPORTBET_TABLES.filter((table) => UNREAD_TABLES.includes(table)),
    ).toEqual([]);
  });

  it("names a MySQL type for every column, as sportbet's migrations give it", () => {
    expect(expectedType('users', 'username')).toBe('varchar(255)');
    expect(expectedType('point_standings', 'group_position_points')).toBe(
      'double',
    );
    const untyped = SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).filter(
        (column) => !/^[a-z]/.test(expectedType(table, column)),
      ),
    );
    expect(untyped).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

```bash
pnpm test:migrate 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `FAIL  src/read-columns.test.ts` with `Error: Cannot find module './read-columns'`, and `Test Files  1 failed (1)`.

- [ ] **Step 5: READ_COLUMNS**

Create `tools/migrate/src/read-columns.ts`:

```ts
import { z } from 'zod';

/**
 * A sportbet column the reader reads: the MySQL type it has at 0da316f (as
 * `information_schema.columns.column_type` names it; the schema drift check
 * compares it) and how its value is parsed. mysql2 returns DECIMAL, DOUBLE
 * (typeCast), DATE and DATETIME (dateStrings) and BLOB (typeCast) as text.
 */
const column = <T extends z.ZodType>(type: string, schema: T): T =>
  schema.describe(type);

const id = (type = 'bigint unsigned') => column(type, z.int().positive());
const whole = (type: string) => column(type, z.int());
const maybeWhole = (type: string) => column(type, z.int().nullable());
const text = (type: string) => column(type, z.string());
const maybeText = (type: string) => column(type, z.string().nullable());

/**
 * Every sportbet table and column the reader reads, and nothing else: the
 * only place the reader names a sportbet column, and every query selects
 * exactly these (no `select *` anywhere). From `users` it reads the id and
 * the username only - never a name, surname, email, Google id or remember
 * token - so none of those ever reaches the reader's memory. The audit
 * tables, `login_codes`, `sessions`, `league_invites`, `messages`,
 * `settings`, `colors` and football's `points_calculations` are not read at
 * all; `leagues` only for which tournament each belongs to. Football's
 * columns (`last16`, `last32`, a prediction's `game_winner_id`) are read
 * only to count values that should not be there.
 */
export const READ_COLUMNS = {
  tournaments: z.object({
    id: id(),
    slug: text('varchar(255)'),
    name: text('varchar(255)'),
    standings_format: text('varchar(50)'),
    standings_deadline_round: maybeWhole('tinyint unsigned'),
    end_date: maybeText('date'),
    survival_game: whole('tinyint(1)'),
  }),
  events: z.object({
    id: id(),
    tournament_id: id(),
    event: text('varchar(255)'),
    event_day: whole('smallint'),
    event_survival: whole('tinyint'),
    is_knockout: whole('tinyint(1)'),
    rate: whole('tinyint'),
  }),
  teams: z.object({
    id: id(),
    tournament_id: id(),
    team: text('varchar(255)'),
    group_position: maybeWhole('tinyint'),
    quarterfinal: maybeWhole('tinyint'),
    semifinal: maybeWhole('tinyint'),
    final: maybeWhole('tinyint'),
    last16: maybeWhole('tinyint'),
    last32: maybeWhole('tinyint'),
  }),
  games: z.object({
    id: id(),
    event_id: id(),
    home_team_id: id(),
    away_team_id: id(),
    game_date: text('datetime'),
    home_team_score: maybeWhole('smallint'),
    away_team_score: maybeWhole('smallint'),
    game_winner_id: maybeWhole('bigint unsigned'),
  }),
  game_odds: z.object({
    id: id(),
    game_id: id(),
    home_odds: maybeText('decimal(8,2)'),
    away_odds: maybeText('decimal(8,2)'),
    draw_odds: maybeText('decimal(8,2)'),
  }),
  users: z.object({
    id: id(),
    username: text('varchar(255)'),
  }),
  user_settings: z.object({
    user_id: id(),
    active: whole('tinyint(1)'),
  }),
  leagues: z.object({
    id: id(),
    tournament_id: id(),
  }),
  league_members: z.object({
    league_id: id(),
    user_id: id(),
  }),
  prediction_results: z.object({
    id: id(),
    user_id: id(),
    game_id: id(),
    home_team_score: maybeWhole('smallint'),
    away_team_score: maybeWhole('smallint'),
    generated: maybeText('blob'),
    game_winner_id: maybeWhole('smallint'),
  }),
  prediction_standings: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    group_position: maybeWhole('tinyint'),
    quarterfinal: maybeWhole('tinyint'),
    semifinal: maybeWhole('tinyint'),
    final: maybeWhole('tinyint'),
    last16: maybeWhole('tinyint'),
    last32: maybeWhole('tinyint'),
  }),
  prediction_survivals: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    event_id: maybeWhole('smallint'),
  }),
  point_results: z.object({
    id: id(),
    user_id: id(),
    game_id: id(),
    winner_points: text('decimal(8,2)'),
    difference_points: text('decimal(8,2)'),
    bingo_points: text('decimal(8,2)'),
    odds: text('decimal(8,2)'),
    odds_points: text('decimal(8,2)'),
    full_points: text('decimal(8,2)'),
    streak_bonus: text('decimal(8,2)'),
  }),
  point_standings: z.object({
    id: id(),
    user_id: id(),
    team_id: id(),
    group_position_points: maybeText('double'),
    group_position_odds: maybeText('double'),
    quarterfinal_points: maybeText('double'),
    quarterfinal_odds: maybeText('double'),
    semifinal_points: maybeText('double'),
    semifinal_odds: maybeText('double'),
    final_points: maybeText('double'),
    final_odds: maybeText('double'),
    last16_points: maybeText('double'),
    last16_odds: maybeText('double'),
    last32_points: maybeText('double'),
    last32_odds: maybeText('double'),
  }),
  point_survivals: z.object({
    id: id(),
    user_id: id(),
    event_id: id(),
    team_id: id(),
    survival_points: whole('smallint'),
  }),
};

export type SportbetTable = keyof typeof READ_COLUMNS;

export const SPORTBET_TABLES = Object.keys(READ_COLUMNS).filter(
  (table): table is SportbetTable => table in READ_COLUMNS,
);

/** One read row of a table, as its schema parses it. */
export type SportbetRow<T extends SportbetTable> = z.infer<
  (typeof READ_COLUMNS)[T]
>;

/** Every table's rows, as read. */
export type SportbetRows = { readonly [T in SportbetTable]: SportbetRow<T>[] };

/** The columns the reader selects from `table`, in order. */
export const columnsOf = (table: SportbetTable): string[] =>
  Object.keys(READ_COLUMNS[table].shape);

/** The MySQL type the reader expects `table.column` to have. */
export function expectedType(table: SportbetTable, name: string): string {
  const schema: unknown = Reflect.get(READ_COLUMNS[table].shape, name);
  const type = schema instanceof z.ZodType ? schema.description : undefined;
  if (type === undefined) {
    throw new Error(`READ_COLUMNS: ${table}.${name} has no MySQL type`);
  }
  return type;
}

/** How each table's rows are read in key order, so a run is deterministic. */
export const ORDER_BY: Readonly<Record<SportbetTable, string>> = {
  tournaments: 'id',
  events: 'id',
  teams: 'id',
  games: 'id',
  game_odds: 'id',
  users: 'id',
  user_settings: 'user_id',
  leagues: 'id',
  league_members: 'league_id, user_id',
  prediction_results: 'id',
  prediction_standings: 'id',
  prediction_survivals: 'id',
  point_results: 'id',
  point_standings: 'id',
  point_survivals: 'id',
};
```

- [ ] **Step 6: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
git check-ignore -q packages/db/migrations/0002_core-schema.sql || echo "migrations are not ignored"
```

Expected: lint and typecheck clean; `Test Files  1 passed (1)` and `Tests  5 passed (5)`; and `migrations are not ignored` (the `*.sql` guard does not hide db's own migrations).

- [ ] **Step 7: Commit**

```bash
git add tools/migrate pnpm-workspace.yaml pnpm-lock.yaml eslint.config.js package.json .github/workflows/ci.yml Dockerfile .gitignore
git commit -m "$(cat <<'EOF'
feat(migrate): the reader's package; READ_COLUMNS, the only sportbet columns it reads (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Which backup, and whether it is whole

The reader obtains production data only from the latest nightly backup in `sportbet-db-backup`, prefix `sportbet-web/`: the greatest name matching `sportbet-YYYYMMDDTHHMMSSZ-daily.sql.gz` (the names sort by time), a warning in the report once it is older than 26 hours. The fetcher is the reader's one seam: the real one downloads through the OCI CLI (`OCI_CLI`, else `oci` on the PATH, else `~/bin/oci.exe`); the tests hand over a synthetic dump and never call it. A downloaded dump is used only if it is whole gzip, ends with sportbet's completion marker and names an engine of the MySQL image's major.minor.

**Files:**
- Create: `tools/migrate/src/fetch.ts`, `tools/migrate/src/dump.ts`
- Test: `tools/migrate/src/fetch.test.ts`, `tools/migrate/src/dump.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/migrate/src/fetch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backupAge, backupTakenAt, BACKUP_BUCKET, latestBackup } from './fetch';

describe('the backup the reader fetches', () => {
  it("comes from sportbet's bucket and prefix only", () => {
    expect(BACKUP_BUCKET).toEqual({
      bucket: 'sportbet-db-backup',
      namespace: 'axox7rtziknk',
      region: 'eu-stockholm-1',
      prefix: 'sportbet-web/',
    });
  });

  it('is the latest daily backup: the greatest matching name', () => {
    expect(
      latestBackup([
        'sportbet-web/sportbet-20260928T021702Z-daily.sql.gz',
        'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
        'sportbet-web/sportbet-20260927T021655Z-daily.sql.gz',
      ]),
    ).toBe('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz');
  });

  it("ignores other tags, sportbet_new's own backups and anything else", () => {
    expect(
      latestBackup([
        'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz',
        'sportbet-web/sportbet-20260930T090000Z-predeploy.sql.gz',
        'sportbet-new/sportbet-20260930T021700Z-daily.sql.gz',
        'sportbet-web/sportbet-20260930T021700Z-daily.sql.gz.part',
        'sportbet-web/notes.txt',
      ]),
    ).toBe('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz');
  });

  it('is none when no daily backup is listed', () => {
    expect(latestBackup(['sportbet-web/notes.txt'])).toBeUndefined();
  });

  it('was taken at the time its name gives, in UTC', () => {
    expect(
      backupTakenAt('sportbet-web/sportbet-20260929T021708Z-daily.sql.gz'),
    ).toEqual(new Date('2026-09-29T02:17:08Z'));
  });

  it('is a warning only once it is older than 26 hours', () => {
    const name = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';
    expect(backupAge(name, new Date('2026-09-30T04:17:08Z'))).toEqual({
      hours: 26,
      stale: false,
    });
    expect(backupAge(name, new Date('2026-09-30T05:17:08Z'))).toEqual({
      hours: 27,
      stale: true,
    });
  });
});
```

Create `tools/migrate/src/dump.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { refuse } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { checkDump, COMPLETION_MARKER } from './dump';

const dump = (engine: string, last = COMPLETION_MARKER) =>
  gzipSync(
    [
      '-- SportBet database dump',
      '--',
      `-- engine       : ${engine}`,
      '-- tag          : daily',
      'SET NAMES utf8mb4;',
      '',
      '--',
      '-- rows written : 0',
      last,
      '',
    ].join('\n'),
  );

describe('checkDump', () => {
  it("accepts a whole dump of the image's major.minor, giving its size, hash and engine", () => {
    const file = dump('mysql 26.7.0');
    expect(checkDump(file, '26.7.0')).toEqual({
      ok: true,
      value: {
        bytes: file.length,
        sha256: createHash('sha256').update(file).digest('hex'),
        engine: 'mysql 26.7.0',
      },
    });
  });

  it('accepts another patch release of the same major.minor', () => {
    expect(checkDump(dump('mysql 26.7.3'), '26.7.0').ok).toBe(true);
  });

  it('refuses a file that is not gzip', () => {
    expect(
      checkDump(Buffer.from('-- SportBet database dump'), '26.7.0'),
    ).toEqual(refuse('not-gzip'));
  });

  it('refuses a truncated gzip file', () => {
    const file = dump('mysql 26.7.0');
    expect(checkDump(file.subarray(0, file.length - 8), '26.7.0')).toEqual(
      refuse('not-gzip'),
    );
  });

  it('refuses a dump without the completion marker', () => {
    expect(
      checkDump(dump('mysql 26.7.0', '-- rows written : 0'), '26.7.0'),
    ).toEqual(refuse('incomplete'));
  });

  it("refuses a dump of another MySQL major.minor than the image's", () => {
    expect(checkDump(dump('mysql 8.4.6'), '26.7.0')).toEqual(
      refuse('engine-differs-from-image'),
    );
  });

  it('refuses a dump that names no engine', () => {
    expect(checkDump(dump('sqlite 3.45.1'), '26.7.0')).toEqual(
      refuse('no-engine-line'),
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm test:migrate 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `src/fetch.test.ts` and `src/dump.test.ts` fail with `Error: Cannot find module './fetch'` and `'./dump'`; `Test Files  2 failed | 1 passed (3)`, `Tests  5 passed (5)`.

- [ ] **Step 3: The fetcher and the dump checks**

Create `tools/migrate/src/fetch.ts`:

```ts
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);

/**
 * Where sportbet's nightly backups are (spec 2.2, production facts): the
 * only place the reader obtains production data from. The same bucket also
 * holds sportbet_new's own `sportbet-new/` backups, which it never touches.
 */
export const BACKUP_BUCKET = Object.freeze({
  bucket: 'sportbet-db-backup',
  namespace: 'axox7rtziknk',
  region: 'eu-stockholm-1',
  prefix: 'sportbet-web/',
});

/** A daily backup's object name; the names sort by the time they were taken. */
const DAILY =
  /^sportbet-web\/sportbet-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-daily\.sql\.gz$/;

/** A backup older than this is a warning (the old app's own backup check uses the same bound). */
export const STALE_AFTER_HOURS = 26;

/** The latest daily backup among the listed object names, if there is one. */
export function latestBackup(names: readonly string[]): string | undefined {
  return names
    .filter((name) => DAILY.test(name))
    .sort()
    .at(-1);
}

/** When a daily backup was taken, from its name. */
export function backupTakenAt(name: string): Date {
  const parts = DAILY.exec(name)?.slice(1).map(Number);
  if (parts === undefined) throw new Error(`not a daily backup: ${name}`);
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] =
    parts;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/** How old a backup is at `now`, in whole hours, and whether that is stale. */
export function backupAge(
  name: string,
  now: Date,
): { readonly hours: number; readonly stale: boolean } {
  const hours = Math.floor(
    (now.getTime() - backupTakenAt(name).getTime()) / 3_600_000,
  );
  return { hours, stale: hours > STALE_AFTER_HOURS };
}

/** A backup downloaded into the reader's private temporary directory. */
export interface FetchedBackup {
  readonly objectName: string;
  readonly path: string;
}

/**
 * Where the dump comes from: the reader's one seam. The real fetcher
 * downloads the latest backup with the OCI CLI; the tests hand over a
 * synthetic dump instead.
 */
export interface BackupFetcher {
  readonly fetch: (directory: string) => Promise<FetchedBackup>;
}

/**
 * The OCI CLI: `OCI_CLI` if set, else `oci` on the PATH, else
 * `~/bin/oci.exe` (where the owner's laptop has it). Undefined when none
 * answers.
 */
export async function findOciCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const candidates = [
    env['OCI_CLI'],
    'oci',
    join(homedir(), 'bin', 'oci.exe'),
  ].flatMap((candidate) =>
    candidate === undefined || candidate === '' ? [] : [candidate],
  );
  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (!existsSync(candidate)) continue;
    }
    try {
      await run(candidate, ['--version'], { windowsHide: true });
      return candidate;
    } catch {
      // Not this one: try the next.
    }
  }
  return undefined;
}

const objectList = z
  .object({
    data: z.array(z.object({ name: z.string() }).loose()).default([]),
  })
  .loose();

/** The fetcher that downloads the latest daily backup through the OCI CLI. */
export function ociFetcher(cli: string): BackupFetcher {
  const oci = (args: readonly string[]) =>
    run(
      cli,
      [
        'os',
        'object',
        ...args,
        '--bucket-name',
        BACKUP_BUCKET.bucket,
        '--namespace',
        BACKUP_BUCKET.namespace,
        '--region',
        BACKUP_BUCKET.region,
      ],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
  return {
    fetch: async (directory) => {
      const listed = await oci([
        'list',
        '--prefix',
        BACKUP_BUCKET.prefix,
        '--all',
        '--output',
        'json',
      ]);
      const names = objectList
        .parse(JSON.parse(listed.stdout))
        .data.map(({ name }) => name);
      const objectName = latestBackup(names);
      if (objectName === undefined) {
        throw new Error(
          `no daily backup under ${BACKUP_BUCKET.bucket}/${BACKUP_BUCKET.prefix}`,
        );
      }
      const path = join(directory, 'backup.sql.gz');
      await oci(['get', '--name', objectName, '--file', path]);
      return { objectName, path };
    },
  };
}
```

Create `tools/migrate/src/dump.ts`:

```ts
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ok, refuse, type Result } from '@sportbet/domain';

/** The last line of a finished sportbet dump (DatabaseDumpWriter). */
export const COMPLETION_MARKER = '-- SPORTBET DUMP COMPLETE';

export type DumpProblem =
  'not-gzip' | 'incomplete' | 'no-engine-line' | 'engine-differs-from-image';

/** What the report says about the dump: never a row of it. */
export interface DumpFacts {
  readonly bytes: number;
  readonly sha256: string;
  /** The header's engine, e.g. "mysql 26.7.0". */
  readonly engine: string;
}

const ENGINE = /^-- engine +: (mysql (\d+)\.(\d+)\.\d+\S*)$/m;

/**
 * A downloaded dump is used only if it is a whole gzip file, ends with the
 * completion marker, and names in its header an engine whose major.minor
 * is the MySQL image's (`imageVersion`, e.g. "26.7.0").
 */
export function checkDump(
  gzipped: Buffer,
  imageVersion: string,
): Result<DumpFacts, DumpProblem> {
  let text: string;
  try {
    text = gunzipSync(gzipped).toString('utf8');
  } catch {
    return refuse('not-gzip');
  }
  if (!text.endsWith(`\n${COMPLETION_MARKER}\n`)) {
    return refuse('incomplete');
  }
  const engine = ENGINE.exec(text.slice(0, 4096));
  if (engine === null) {
    return refuse('no-engine-line');
  }
  const [major, minor] = imageVersion.split('.');
  if (engine[2] !== major || engine[3] !== minor) {
    return refuse('engine-differs-from-image');
  }
  return ok({
    bytes: gzipped.length,
    sha256: createHash('sha256').update(gzipped).digest('hex'),
    engine: engine[1] ?? '',
  });
}
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  3 passed (3)` and `Tests  18 passed (18)`.

- [ ] **Step 5: Commit**

```bash
git add tools/migrate
git commit -m "$(cat <<'EOF'
feat(migrate): the latest daily backup, its age, and the dump checks (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: The synthetic dump, and the map

`mapSportbet` is the reader's core: a pure function from the rows read to the domain's stored rows, reconciling every table (rows read = loaded + skipped + refused). Every value goes through `sportbetColumns` and then its stored factory. A football tournament is skipped with every row that belongs to it; a user in no loaded tournament is not loaded; sportbet's seeded survival slots are skipped; a round after 38 is refused (`stage-unknown`); duplicate odds keep the lowest id (an equal duplicate is a notice, a differing one a refusal); a row whose parent is missing is an `orphan`, one whose parent was refused inherits its reason (`depends-on-refused (...)`); a game or pick across tournaments is `cross-tournament`; two rows where the schema has one key are `duplicate-key`. A refused row no player owns is named by its sportbet id; a player's row by its game, team or event only.

Its tests, and the end-to-end test in Task 17, share one fixture: a synthetic dump in the format sportbet's `DatabaseDumpWriter` writes, with sportbet's own `CREATE TABLE` text at `0da316f`, built from the golden scenario plus a football tournament and deliberate quirks, with a sentinel name, surname, email and Google id on every user and a sentinel IP address in `audit_logins`.

**Files:**
- Create: `tools/migrate/test/fixtures/create-tables.ts`, `tools/migrate/test/fixtures/sportbet-dump.ts`, `tools/migrate/src/map.ts`
- Test: `tools/migrate/test/map.test.ts`

- [ ] **Step 1: The fixture**

The first fixture file is sportbet's `SHOW CREATE TABLE` output for each table, as a dump carries it, read from its migrations at `0da316f` run on `mysql:26.7.0`.

Create `tools/migrate/test/fixtures/create-tables.ts`:

```ts
// sportbet's own SHOW CREATE TABLE text at 0da316f, as DatabaseDumpWriter
// writes it into a dump (from its migrations, run on mysql:26.7.0), for
// every table the reader reads, and audit_logins - which it never reads, so
// the synthetic dump can prove its IP address never leaves MySQL.

export const CREATE_TABLE = {
  audit_logins: [
    'CREATE TABLE `audit_logins` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `ip_address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    '  `login_method` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  events: [
    'CREATE TABLE `events` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `tournament_id` bigint unsigned NOT NULL,',
    '  `event` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `event_day` smallint NOT NULL,',
    '  `event_survival` tinyint NOT NULL,',
    "  `is_knockout` tinyint(1) NOT NULL DEFAULT '0',",
    '  `round_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    "  `active` tinyint NOT NULL DEFAULT '1',",
    '  `rate` tinyint NOT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `events_tournament_id_foreign` (`tournament_id`),',
    '  CONSTRAINT `events_tournament_id_foreign` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  game_odds: [
    'CREATE TABLE `game_odds` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `game_id` bigint unsigned NOT NULL,',
    '  `home_odds` decimal(8,2) DEFAULT NULL,',
    '  `draw_odds` decimal(8,2) DEFAULT NULL,',
    '  `away_odds` decimal(8,2) DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `game_odds_game_id_foreign` (`game_id`),',
    '  CONSTRAINT `game_odds_game_id_foreign` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  games: [
    'CREATE TABLE `games` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `game_date` datetime NOT NULL,',
    '  `event_id` bigint unsigned NOT NULL,',
    '  `home_team_id` bigint unsigned NOT NULL,',
    '  `away_team_id` bigint unsigned NOT NULL,',
    '  `home_team_score` smallint DEFAULT NULL,',
    '  `away_team_score` smallint DEFAULT NULL,',
    "  `reminder_sent` tinyint(1) NOT NULL DEFAULT '0',",
    '  `game_winner_id` bigint unsigned DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `games_event_id_game_date_index` (`event_id`,`game_date`),',
    '  KEY `games_home_team_id_index` (`home_team_id`),',
    '  KEY `games_away_team_id_index` (`away_team_id`),',
    '  KEY `games_game_winner_id_foreign` (`game_winner_id`),',
    '  CONSTRAINT `games_away_team_id_foreign` FOREIGN KEY (`away_team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,',
    '  CONSTRAINT `games_event_id_foreign` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,',
    '  CONSTRAINT `games_game_winner_id_foreign` FOREIGN KEY (`game_winner_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL,',
    '  CONSTRAINT `games_home_team_id_foreign` FOREIGN KEY (`home_team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  league_members: [
    'CREATE TABLE `league_members` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `league_id` bigint unsigned NOT NULL,',
    '  `user_id` bigint unsigned NOT NULL,',
    "  `is_admin` tinyint(1) NOT NULL DEFAULT '0',",
    "  `is_guest` tinyint(1) NOT NULL DEFAULT '0',",
    "  `active` tinyint(1) NOT NULL DEFAULT '0',",
    '  `paid_amount` decimal(8,2) DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `league_members_league_id_user_id_unique` (`league_id`,`user_id`),',
    '  KEY `league_members_user_id_index` (`user_id`),',
    '  CONSTRAINT `league_members_league_id_foreign` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,',
    '  CONSTRAINT `league_members_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  leagues: [
    'CREATE TABLE `leagues` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `tournament_id` bigint unsigned NOT NULL,',
    '  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `description` text COLLATE utf8mb4_unicode_ci,',
    "  `is_public` tinyint(1) NOT NULL DEFAULT '0',",
    '  `owner_id` bigint unsigned DEFAULT NULL,',
    '  `base_fee` int DEFAULT NULL,',
    '  `penalty_step` int DEFAULT NULL,',
    "  `use_league_odds` tinyint(1) NOT NULL DEFAULT '0',",
    '  `reward_description` text COLLATE utf8mb4_unicode_ci,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `leagues_owner_id_foreign` (`owner_id`),',
    '  KEY `leagues_tournament_id_foreign` (`tournament_id`),',
    '  CONSTRAINT `leagues_owner_id_foreign` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,',
    '  CONSTRAINT `leagues_tournament_id_foreign` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  point_results: [
    'CREATE TABLE `point_results` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `game_id` bigint unsigned NOT NULL,',
    '  `winner_points` decimal(8,2) NOT NULL,',
    '  `difference_points` decimal(8,2) NOT NULL,',
    '  `bingo_points` decimal(8,2) NOT NULL,',
    '  `odds` decimal(8,2) NOT NULL,',
    '  `odds_points` decimal(8,2) NOT NULL,',
    '  `full_points` decimal(8,2) NOT NULL,',
    "  `streak_bonus` decimal(8,2) NOT NULL DEFAULT '0.00',",
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `point_results_user_id_game_id_unique` (`user_id`,`game_id`),',
    '  KEY `point_results_game_id_foreign` (`game_id`),',
    '  CONSTRAINT `point_results_game_id_foreign` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`),',
    '  CONSTRAINT `point_results_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  point_standings: [
    'CREATE TABLE `point_standings` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `team_id` bigint unsigned NOT NULL,',
    '  `group_position_points` double DEFAULT NULL,',
    '  `group_position_odds` double DEFAULT NULL,',
    '  `last16_points` double DEFAULT NULL,',
    '  `last16_odds` double DEFAULT NULL,',
    '  `last32_points` double DEFAULT NULL,',
    '  `last32_odds` double DEFAULT NULL,',
    '  `quarterfinal_points` double DEFAULT NULL,',
    '  `quarterfinal_odds` double DEFAULT NULL,',
    '  `semifinal_points` double DEFAULT NULL,',
    '  `semifinal_odds` double DEFAULT NULL,',
    '  `final_points` double DEFAULT NULL,',
    '  `final_odds` double DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `point_standings_user_id_team_id_unique` (`user_id`,`team_id`),',
    '  KEY `point_standings_team_id_foreign` (`team_id`),',
    '  CONSTRAINT `point_standings_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`),',
    '  CONSTRAINT `point_standings_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  point_survivals: [
    'CREATE TABLE `point_survivals` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `event_id` bigint unsigned NOT NULL,',
    '  `team_id` bigint unsigned NOT NULL,',
    '  `survival_points` smallint NOT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `point_survivals_user_id_foreign` (`user_id`),',
    '  KEY `point_survivals_event_id_foreign` (`event_id`),',
    '  KEY `point_survivals_team_id_foreign` (`team_id`),',
    '  CONSTRAINT `point_survivals_event_id_foreign` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`),',
    '  CONSTRAINT `point_survivals_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`),',
    '  CONSTRAINT `point_survivals_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  prediction_results: [
    'CREATE TABLE `prediction_results` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `game_id` bigint unsigned NOT NULL,',
    '  `home_team_score` smallint DEFAULT NULL,',
    '  `away_team_score` smallint DEFAULT NULL,',
    '  `game_winner_id` smallint DEFAULT NULL,',
    '  `prediction_date` timestamp NULL DEFAULT NULL,',
    '  `generated` blob,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  `reminded_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `prediction_results_user_id_foreign` (`user_id`),',
    '  KEY `prediction_results_game_id_foreign` (`game_id`),',
    '  CONSTRAINT `prediction_results_game_id_foreign` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`),',
    '  CONSTRAINT `prediction_results_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  prediction_standings: [
    'CREATE TABLE `prediction_standings` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `team_id` bigint unsigned NOT NULL,',
    '  `group_position` tinyint DEFAULT NULL,',
    '  `last16` tinyint DEFAULT NULL,',
    '  `last32` tinyint DEFAULT NULL,',
    '  `quarterfinal` tinyint DEFAULT NULL,',
    '  `semifinal` tinyint DEFAULT NULL,',
    '  `final` tinyint DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `prediction_standings_user_id_foreign` (`user_id`),',
    '  KEY `prediction_standings_team_id_foreign` (`team_id`),',
    '  CONSTRAINT `prediction_standings_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`),',
    '  CONSTRAINT `prediction_standings_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  prediction_survivals: [
    'CREATE TABLE `prediction_survivals` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `team_id` bigint unsigned NOT NULL,',
    '  `event_id` smallint DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `prediction_survivals_user_id_foreign` (`user_id`),',
    '  KEY `prediction_survivals_team_id_index` (`team_id`),',
    '  CONSTRAINT `prediction_survivals_team_id_foreign` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,',
    '  CONSTRAINT `prediction_survivals_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  teams: [
    'CREATE TABLE `teams` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `tournament_id` bigint unsigned NOT NULL,',
    '  `team` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `group_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    '  `group_position` tinyint DEFAULT NULL,',
    '  `last16` tinyint DEFAULT NULL,',
    '  `last32` tinyint DEFAULT NULL,',
    '  `quarterfinal` tinyint DEFAULT NULL,',
    '  `semifinal` tinyint DEFAULT NULL,',
    '  `final` tinyint DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  KEY `teams_tournament_id_foreign` (`tournament_id`),',
    '  CONSTRAINT `teams_tournament_id_foreign` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  tournaments: [
    'CREATE TABLE `tournaments` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    "  `sport` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'football',",
    "  `standings_format` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'football',",
    '  `standings_deadline_round` tinyint unsigned DEFAULT NULL,',
    "  `status` enum('upcoming','active','finished') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'upcoming',",
    '  `start_date` date DEFAULT NULL,',
    '  `end_date` date DEFAULT NULL,',
    '  `description` text COLLATE utf8mb4_unicode_ci,',
    '  `cover_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    "  `is_public` tinyint(1) NOT NULL DEFAULT '1',",
    "  `survival_game` tinyint(1) NOT NULL DEFAULT '0',",
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `tournaments_slug_unique` (`slug`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  user_settings: [
    'CREATE TABLE `user_settings` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `user_id` bigint unsigned NOT NULL,',
    '  `admin` tinyint NOT NULL,',
    '  `result_amount` smallint DEFAULT NULL,',
    '  `time_zone` smallint DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    "  `receive_reminders` tinyint(1) NOT NULL DEFAULT '0',",
    "  `active` tinyint(1) NOT NULL DEFAULT '1',",
    "  `locale` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lt',",
    '  PRIMARY KEY (`id`),',
    '  KEY `user_settings_user_id_foreign` (`user_id`),',
    '  CONSTRAINT `user_settings_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
  users: [
    'CREATE TABLE `users` (',
    '  `id` bigint unsigned NOT NULL AUTO_INCREMENT,',
    '  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `surname` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  `google_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    '  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,',
    '  `created_at` timestamp NULL DEFAULT NULL,',
    '  `updated_at` timestamp NULL DEFAULT NULL,',
    '  PRIMARY KEY (`id`),',
    '  UNIQUE KEY `users_email_unique` (`email`),',
    '  UNIQUE KEY `users_google_id_unique` (`google_id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  ].join('\n'),
};

export type DumpTable = keyof typeof CREATE_TABLE;
```

Create `tools/migrate/test/fixtures/sportbet-dump.ts`:

```ts
// A synthetic sportbet dump: the Euroleague part of sportbet's golden
// scenario (GOLDEN and GOLDEN_POINTS from @sportbet/domain/testing), a
// football tournament's rows, and deliberate quirks, in the format
// DatabaseDumpWriter writes (header, per table DROP and CREATE, extended
// INSERTs a tuple a line, the completion marker). Never production data:
// every name, surname, email, Google id and IP address is a sentinel.

import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  player,
  team,
  type GoldenIds,
} from '@sportbet/domain/testing';
import { READ_COLUMNS, type SportbetRows } from '../../src/read-columns';
import { CREATE_TABLE, type DumpTable } from './create-tables';

export type SqlValue = string | number | null;
export type DumpRow = Readonly<Record<string, SqlValue>>;
export type Dump = Readonly<Record<DumpTable, readonly DumpRow[]>>;

export const DUMP_TABLES = Object.keys(CREATE_TABLE).filter(
  (table): table is DumpTable => table in CREATE_TABLE,
);

/** A table's columns, in its CREATE TABLE order. */
export function columnsIn(table: DumpTable): string[] {
  return CREATE_TABLE[table]
    .split('\n')
    .flatMap((line) => /^ {2}`([a-z0-9_]+)` /.exec(line)?.[1] ?? []);
}

/** Columns sportbet stores as `double`: PHP writes them unquoted. */
const doubles = new Set(
  columnsIn('point_standings').filter(
    (column) => column.endsWith('_points') || column.endsWith('_odds'),
  ),
);

/** What PDO::quote (MySQL) puts before each character it escapes. */
const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  "'": "\\'",
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\0': '\\0',
};

/** A value as PDO::quote (MySQL) and MySqlDumpDialect::quoteValue write it. */
function quote(column: string, value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number' || doubles.has(column)) return String(value);
  const escaped = value.replace(
    /[\\'"\n\r\0]/g,
    (character) => ESCAPES[character] ?? character,
  );
  return `'${escaped}'`;
}

/**
 * The dump's text, as DatabaseDumpWriter writes it: tables sorted by name,
 * each dropped and created, then its rows. `engine` is the header's engine
 * line; `complete` false leaves the completion marker off.
 */
export function renderDump(
  dump: Dump,
  { engine = 'mysql 26.7.0', complete = true } = {},
): string {
  const tables = [...DUMP_TABLES].sort();
  const header = [
    '-- SportBet database dump',
    '--',
    '-- generated_at : 2026-09-29T02:17:08Z',
    `-- engine       : ${engine}`,
    '-- tag          : daily',
    `-- tables       : ${String(tables.length)}`,
    '-- no rows for  : (none)',
    '-- nulled       : users.remember_token',
    '--',
    '-- A synthetic dump for the production-copy reader tests: no real player.',
    '',
    '',
  ].join('\n');
  const preamble = [
    'SET NAMES utf8mb4',
    "SET time_zone = '+00:00'",
    'SET FOREIGN_KEY_CHECKS = 0',
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'",
    'SET UNIQUE_CHECKS = 0',
  ]
    .map((statement) => `${statement};\n`)
    .join('');
  let rows = 0;
  let body = '';
  for (const table of tables) {
    body += `\n--\n-- ${table}\n--\n`;
    body += `DROP TABLE IF EXISTS \`${table}\`;\n${CREATE_TABLE[table]};\n`;
    const columns = columnsIn(table);
    const tuples = dump[table].map(
      (row) =>
        `(${columns.map((column) => quote(column, row[column] ?? null)).join(',')})`,
    );
    rows += tuples.length;
    if (tuples.length > 0) {
      body += `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES\n${tuples.join(',\n')};\n`;
    }
  }
  const postamble = 'SET UNIQUE_CHECKS = 1;\nSET FOREIGN_KEY_CHECKS = 1;\n';
  const footer = `\n--\n-- rows written : ${String(rows)}\n${complete ? '-- SPORTBET DUMP COMPLETE\n' : ''}`;
  return header + preamble + body + postamble + footer;
}

/**
 * The rows the reader reads from a restored copy of `dump`, as mysql2 hands
 * them over (READ_COLUMNS parses each and drops every column not read).
 */
export function readRows(dump: Dump): SportbetRows {
  // A column the fixture leaves out is NULL in the restored table.
  const all = (table: DumpTable) =>
    dump[table].map((row) =>
      Object.fromEntries(
        columnsIn(table).map((column) => [column, row[column] ?? null]),
      ),
    );
  return {
    tournaments: all('tournaments').map((row) =>
      READ_COLUMNS.tournaments.parse(row),
    ),
    events: all('events').map((row) => READ_COLUMNS.events.parse(row)),
    teams: all('teams').map((row) => READ_COLUMNS.teams.parse(row)),
    games: all('games').map((row) => READ_COLUMNS.games.parse(row)),
    game_odds: all('game_odds').map((row) => READ_COLUMNS.game_odds.parse(row)),
    users: all('users').map((row) => READ_COLUMNS.users.parse(row)),
    user_settings: all('user_settings').map((row) =>
      READ_COLUMNS.user_settings.parse(row),
    ),
    leagues: all('leagues').map((row) => READ_COLUMNS.leagues.parse(row)),
    league_members: all('league_members').map((row) =>
      READ_COLUMNS.league_members.parse(row),
    ),
    prediction_results: all('prediction_results').map((row) =>
      READ_COLUMNS.prediction_results.parse(row),
    ),
    prediction_standings: all('prediction_standings').map((row) =>
      READ_COLUMNS.prediction_standings.parse(row),
    ),
    prediction_survivals: all('prediction_survivals').map((row) =>
      READ_COLUMNS.prediction_survivals.parse(row),
    ),
    point_results: all('point_results').map((row) =>
      READ_COLUMNS.point_results.parse(row),
    ),
    point_standings: all('point_standings').map((row) =>
      READ_COLUMNS.point_standings.parse(row),
    ),
    point_survivals: all('point_survivals').map((row) =>
      READ_COLUMNS.point_survivals.parse(row),
    ),
  };
}

type Name = (typeof GOLDEN.players)[number];
type TeamName = (typeof GOLDEN.teams)[number];

/** sportbet's ids for the golden rows: the players 1-4, teams 5-8, games 7-9, events 4-5. */
export const IDS = {
  player: (name: Name) => GOLDEN.players.indexOf(name) + 1,
  team: (name: TeamName) => GOLDEN.teams.indexOf(name) + 5,
  game: (id: 1 | 2 | 3) => id + 6,
  event: (round: 1 | 2) => round + 3,
};

/** The golden names as the dump's sportbet ids, for the domain's golden helpers. */
export const DUMP_IDS: GoldenIds = {
  player: (name) => player(String(IDS.player(name))),
  team: (name) => team(String(IDS.team(name))),
  game: (id) => gameNo(IDS.game(id)),
};

/** The Euroleague tournament's id. */
export const EUROLEAGUE = 2;
/** An unscored Euroleague game with sportbet's blank odds row. */
export const UNSCORED_GAME = 10;

const USERS = [...GOLDEN.players, 'eve', 'fbfan'] as const;

/** Every personal value in the dump; none may leave MySQL. */
export const SENTINELS: readonly string[] = [
  ...USERS.flatMap((user) => [
    `Sentinel-Name-${user}`,
    `Sentinel-Surname-${user}`,
    `sentinel.${user}@example.invalid`,
    `sentinel-google-${user}`,
  ]),
  '203.0.113.77',
];

/** "380.0000" as PHP writes the double: 380. */
const double = (fourPlaces: string | null) =>
  fourPlaces === null ? null : String(Number(fourPlaces));
/** "79.5000" as the DECIMAL(8,2) text: 79.50. */
const decimal = (fourPlaces: string | undefined) => {
  if (fourPlaces === undefined) throw new Error('fixture: no such column');
  return fourPlaces.slice(0, -2);
};

/** A golden-points key, "ada / EL h2", as its player and the rest. */
const golden = (key: string) => {
  const [name, rest] = key.split(' / ');
  const player = GOLDEN.players.find((each) => each === name);
  if (player === undefined || rest === undefined) {
    throw new Error(`fixture: bad key ${key}`);
  }
  return { player, rest };
};

/** "EL h2" as the golden game 2. */
const goldenGame = (label: string) => {
  const game = GOLDEN.games.find(({ id }) => label === `EL h${String(id)}`);
  if (game === undefined) throw new Error(`fixture: bad game ${label}`);
  return game.id;
};

/**
 * The synthetic dump: sportbet's golden scenario with sportbet's ids, plus
 * a football tournament with a row in every table (skipped by design), a
 * user in no tournament, seeded survival slots, a switched-off player (dan),
 * an unscored game with sportbet's blank odds row, an equal and a
 * differing duplicate odds row, an orphan prediction and a `generated` of
 * '2' (refused), and sentinel personal data on every user.
 */
export function syntheticDump(): Dump {
  const eventOf = (round: 1 | 2) => IDS.event(round);
  return {
    tournaments: [
      {
        id: 1,
        name: 'Golden FB',
        slug: 'golden-fb',
        sport: 'football',
        standings_format: 'football',
        status: 'active',
        is_public: 1,
        survival_game: 1,
      },
      {
        id: EUROLEAGUE,
        name: 'Golden EL',
        slug: 'golden-el',
        sport: 'basketball',
        standings_format: 'euroleague',
        status: 'active',
        end_date: GOLDEN.endsOn,
        is_public: 1,
        survival_game: 1,
      },
    ],
    events: [
      {
        id: 1,
        tournament_id: 1,
        event: 'FB R1',
        event_day: 1,
        event_survival: 1,
        is_knockout: 0,
        active: 1,
        rate: 1,
      },
      ...GOLDEN.rounds.map((round) => ({
        id: eventOf(round.number),
        tournament_id: EUROLEAGUE,
        event: round.name,
        event_day: round.number,
        event_survival: 1,
        is_knockout: round.knockout ? 1 : 0,
        active: 1,
        rate: 1,
      })),
    ],
    teams: [
      {
        id: 1,
        tournament_id: 1,
        team: 'FRA',
        group_name: 'A',
        group_position: 1,
        last16: 1,
        quarterfinal: 1,
      },
      {
        id: 2,
        tournament_id: 1,
        team: 'ESP',
        group_name: 'A',
        group_position: 2,
        last16: 1,
      },
      ...GOLDEN.teams.map((name) => {
        const outcome = GOLDEN.outcomes.find(({ team }) => team === name);
        return {
          id: IDS.team(name),
          tournament_id: EUROLEAGUE,
          team: name,
          group_name: 'A',
          group_position: outcome?.place ?? null,
          quarterfinal: outcome?.playOffs === true ? 1 : null,
        };
      }),
    ],
    games: [
      {
        id: 1,
        game_date: '2026-06-01 18:00:00',
        event_id: 1,
        home_team_id: 1,
        away_team_id: 2,
        home_team_score: 2,
        away_team_score: 0,
        reminder_sent: 0,
      },
      ...GOLDEN.games.map((game) => ({
        id: IDS.game(game.id),
        game_date: game.tipOff.replace('T', ' ').replace('Z', ''),
        event_id: eventOf(game.round),
        home_team_id: IDS.team(game.home),
        away_team_id: IDS.team(game.away),
        home_team_score: game.result[0],
        away_team_score: game.result[1],
        reminder_sent: 0,
      })),
      {
        id: UNSCORED_GAME,
        game_date: '2026-06-21 18:00:00',
        event_id: eventOf(2),
        home_team_id: IDS.team('REA'),
        away_team_id: IDS.team('OLY'),
        reminder_sent: 0,
      },
    ],
    game_odds: [
      {
        id: 1,
        game_id: 1,
        home_odds: '0.68',
        draw_odds: '2.26',
        away_odds: '2.59',
      },
      ...Object.entries(GOLDEN_POINTS.game_odds).map(([key, odds]) => {
        const game = IDS.game(goldenGame(key));
        return {
          id: game,
          game_id: game,
          home_odds: decimal(odds['home_odds']),
          draw_odds: decimal(odds['draw_odds']),
          away_odds: decimal(odds['away_odds']),
        };
      }),
      // sportbet's blank row, inserted with every game: odds 0, not 1.0.
      {
        id: 10,
        game_id: UNSCORED_GAME,
        home_odds: null,
        draw_odds: null,
        away_odds: null,
      },
      // A duplicate equal to the kept row (a notice), and one that differs (a refusal).
      {
        id: 11,
        game_id: IDS.game(1),
        home_odds: '0.59',
        draw_odds: '2.59',
        away_odds: '1.59',
      },
      {
        id: 12,
        game_id: IDS.game(2),
        home_odds: '1.00',
        draw_odds: '1.00',
        away_odds: '1.00',
      },
    ],
    users: USERS.map((user, index) => ({
      id: index + 1,
      username: user,
      name: `Sentinel-Name-${user}`,
      surname: `Sentinel-Surname-${user}`,
      email: `sentinel.${user}@example.invalid`,
      google_id: `sentinel-google-${user}`,
      remember_token: null,
    })),
    user_settings: USERS.map((user, index) => ({
      id: index + 1,
      user_id: index + 1,
      admin: 0,
      receive_reminders: 0,
      // dan is switched off, as production's one player is (P20).
      active: user === 'dan' ? 0 : 1,
      locale: 'lt',
    })),
    leagues: [
      {
        id: 1,
        tournament_id: 1,
        name: 'Crowd',
        is_public: 0,
        use_league_odds: 1,
      },
      {
        id: 2,
        tournament_id: EUROLEAGUE,
        name: 'Golden league',
        is_public: 1,
        use_league_odds: 0,
      },
    ],
    league_members: [
      { id: 1, league_id: 1, user_id: 6, is_admin: 0, is_guest: 0, active: 1 },
      { id: 2, league_id: 1, user_id: 3, is_admin: 0, is_guest: 0, active: 1 },
      ...GOLDEN.players.map((name, index) => ({
        id: index + 3,
        league_id: 2,
        user_id: IDS.player(name),
        is_admin: 0,
        is_guest: 0,
        active: 1,
      })),
    ],
    prediction_results: [
      {
        id: 1,
        user_id: 1,
        game_id: 1,
        home_team_score: 2,
        away_team_score: 0,
        generated: '0',
      },
      {
        id: 2,
        user_id: 6,
        game_id: 1,
        home_team_score: 1,
        away_team_score: 0,
        generated: '1',
      },
      ...GOLDEN.predictions.map(([name, game, home, away], index) => ({
        id: index + 3,
        user_id: IDS.player(name),
        game_id: IDS.game(game),
        home_team_score: home,
        away_team_score: away,
        generated: '0',
      })),
      // An unpredicted game's blank row (MS-2), generated NULL.
      {
        id: 12,
        user_id: IDS.player('dan'),
        game_id: UNSCORED_GAME,
        home_team_score: null,
        away_team_score: null,
        generated: null,
      },
      // A prediction for a game that does not exist.
      {
        id: 13,
        user_id: IDS.player('ben'),
        game_id: 999,
        home_team_score: 80,
        away_team_score: 70,
        generated: '0',
      },
      // A generated blob that is neither '1', '0' nor NULL.
      {
        id: 14,
        user_id: IDS.player('dan'),
        game_id: IDS.game(1),
        home_team_score: 85,
        away_team_score: 80,
        generated: '2',
      },
    ],
    prediction_standings: [
      {
        id: 1,
        user_id: 1,
        team_id: 1,
        group_position: 1,
        last16: 1,
        quarterfinal: 1,
      },
      ...GOLDEN.standings
        .flatMap(([name, rows]) => rows.map((row) => ({ name, row })))
        .map(({ name, row }, index) => ({
          id: index + 2,
          user_id: IDS.player(name),
          team_id: IDS.team(row.team),
          group_position: row.place,
          quarterfinal: row.playOffs === true ? 1 : null,
        })),
    ],
    prediction_survivals: [
      { id: 1, user_id: 1, team_id: 1, event_id: 1 },
      { id: 2, user_id: 1, team_id: 2, event_id: null },
      // One row per player and team, as sportbet seeds them; a pick sets
      // its event.
      ...GOLDEN.survival
        .flatMap(([name, picks]) =>
          GOLDEN.teams.map((team) => {
            const pick = picks.find(([, picked]) => picked === team);
            return {
              user_id: IDS.player(name),
              team_id: IDS.team(team),
              event_id: pick === undefined ? null : eventOf(pick[0]),
            };
          }),
        )
        .map((row, index) => ({ id: index + 3, ...row })),
    ],
    point_results: [
      {
        id: 1,
        user_id: 1,
        game_id: 1,
        winner_points: '50.00',
        difference_points: '20.00',
        bingo_points: '10.00',
        odds: '0.68',
        odds_points: '0.00',
        full_points: '80.00',
        streak_bonus: '0.00',
      },
      ...Object.entries(GOLDEN_POINTS.point_results).map(
        ([key, row], index) => {
          const { player, rest } = golden(key);
          return {
            id: index + 2,
            user_id: IDS.player(player),
            game_id: IDS.game(goldenGame(rest)),
            winner_points: decimal(row['winner_points']),
            difference_points: decimal(row['difference_points']),
            bingo_points: decimal(row['bingo_points']),
            odds: decimal(row['odds']),
            odds_points: decimal(row['odds_points']),
            full_points: decimal(row['full_points']),
            streak_bonus: decimal(row['streak_bonus']),
          };
        },
      ),
    ],
    point_standings: [
      {
        id: 1,
        user_id: 1,
        team_id: 1,
        group_position_points: '6',
        group_position_odds: '1',
        last16_points: '6',
        last16_odds: '0',
        quarterfinal_points: '9',
        quarterfinal_odds: '0',
      },
      ...Object.entries(GOLDEN_POINTS.point_standings).map(
        ([key, row], index) => {
          const { player, rest } = golden(key);
          const team = GOLDEN.teams.find((each) => each === rest);
          if (team === undefined) throw new Error(`fixture: bad team ${rest}`);
          return {
            id: index + 2,
            user_id: IDS.player(player),
            team_id: IDS.team(team),
            ...Object.fromEntries(
              Object.entries(row).map(([column, value]) => [
                column,
                double(value),
              ]),
            ),
          };
        },
      ),
    ],
    point_survivals: [
      { id: 1, user_id: 1, event_id: 1, team_id: 1, survival_points: 10 },
      ...Object.entries(GOLDEN_POINTS.point_survivals).map(
        ([key, row], index) => {
          const { player, rest } = golden(key);
          const round = rest === 'EL E1' ? 1 : 2;
          const team = GOLDEN.teams.find((each) => each === row['team_id']);
          if (team === undefined) throw new Error('fixture: bad survival team');
          return {
            id: index + 2,
            user_id: IDS.player(player),
            event_id: eventOf(round),
            team_id: IDS.team(team),
            survival_points: Number(row['survival_points']),
          };
        },
      ),
    ],
    audit_logins: [
      {
        id: 1,
        user_id: '1',
        ip_address: '203.0.113.77',
        login_method: 'google',
      },
    ],
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `tools/migrate/test/map.test.ts`:

```ts
import { Odds } from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  snapshotOf,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { mapSportbet, type Mapped, type MappedTournament } from '../src/map';
import type { SportbetTable } from '../src/read-columns';
import type { DumpTable } from './fixtures/create-tables';
import {
  DUMP_IDS,
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  UNSCORED_GAME,
  type Dump,
  type DumpRow,
} from './fixtures/sportbet-dump';

const map = (dump: Dump = syntheticDump()) => mapSportbet(readRows(dump));

/** The dump with one table's rows changed. */
function changed(
  table: DumpTable,
  rows: (current: readonly DumpRow[]) => readonly DumpRow[],
): Dump {
  const dump = syntheticDump();
  return { ...dump, [table]: rows(dump[table]) };
}

const countOf = (mapped: Mapped, table: SportbetTable) => {
  const count = mapped.tables.find((each) => each.table === table);
  if (count === undefined) throw new Error(`no count for ${table}`);
  return count;
};

const euroleague = (mapped: Mapped): MappedTournament => {
  const found = mapped.tournaments.find(
    ({ tournament }) => tournament.id === EUROLEAGUE,
  );
  if (found === undefined) throw new Error('no Euroleague tournament mapped');
  return found;
};

/** A second Euroleague tournament (3) with its own round (event 30) and team (30). */
const withSecondTournament = (dump: Dump): Dump => ({
  ...dump,
  tournaments: [
    ...dump.tournaments,
    {
      id: 3,
      name: 'Other EL',
      slug: 'other-el',
      sport: 'basketball',
      standings_format: 'euroleague',
      status: 'active',
      end_date: '2027-05-23',
      is_public: 1,
      survival_game: 1,
    },
  ],
  events: [
    ...dump.events,
    {
      id: 30,
      tournament_id: 3,
      event: '1 turas',
      event_day: 1,
      event_survival: 1,
      is_knockout: 0,
      active: 1,
      rate: 1,
    },
  ],
  teams: [
    ...dump.teams,
    { id: 30, tournament_id: 3, team: 'BAR', group_name: 'A' },
  ],
});

describe('map: reconciliation', () => {
  it('map: every table reconciles: rows read = loaded + skipped + refused', () => {
    for (const count of map().tables) {
      const skipped = Object.values(count.skipped).reduce((a, b) => a + b, 0);
      const refused = Object.values(count.refused).reduce((a, b) => a + b, 0);
      expect({
        table: count.table,
        total: count.loaded + skipped + refused,
      }).toEqual({
        table: count.table,
        total: count.read,
      });
    }
  });
});

describe('map: the golden scenario', () => {
  const mapped = euroleague(map());
  const golden = goldenInputs({}, DUMP_IDS);

  it('map: the golden rows map to the golden inputs, through sportbetColumns and the stored factories', () => {
    expect(mapped.tournament).toMatchObject({
      slug: 'golden-el',
      endsOn: GOLDEN.endsOn,
    });
    expect(mapped.rounds.map(({ round }) => round)).toEqual(
      golden.season.rounds,
    );
    expect(mapped.games.filter(({ id }) => id !== UNSCORED_GAME)).toEqual(
      golden.season.games,
    );
    expect(
      mapped.predictions.filter(({ game }) => game !== UNSCORED_GAME),
    ).toEqual(golden.predictions);
    expect(mapped.standings).toEqual(golden.standings);
    expect(mapped.outcomes.teams).toEqual(golden.outcomes.teams);
    expect(
      golden.survival.from === 'picks' && [...golden.survival.runs],
    ).toEqual([...mapped.runs]);
    expect(mapped.players.map(({ player: id }) => id)).toEqual(golden.players);
  });

  it("map: production's points rows are golden-points.json's 25 Euroleague entries", () => {
    expect(
      snapshotOf(
        {
          ...mapped.production,
          odds: mapped.production.odds.filter(
            ({ game }) => game !== UNSCORED_GAME,
          ),
        },
        DUMP_IDS,
      ),
    ).toEqual(GOLDEN_POINTS);
  });

  it("map: production's survival rows keep sportbet's ids as their stored ids", () => {
    expect(mapped.production.survival.map(({ storedId }) => storedId)).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });

  it('map: sportbet does not record a final table, so the outcomes load as not final (R-14), and the report says so', () => {
    expect(mapped.outcomes.tableIsFinal).toBe(false);
    expect(map().notices).toContain(
      'tournaments: sportbet does not record whether its standings table is final (R-14); every tournament is loaded with it not final',
    );
  });
});

describe('map: skipped by design', () => {
  const mapped = map();

  it('map: a football tournament is skipped with every row that belongs to it, counted per table', () => {
    const notEuroleague = Object.fromEntries(
      mapped.tables.map((count) => [
        count.table,
        count.skipped['not-euroleague'] ?? 0,
      ]),
    );
    expect(notEuroleague).toEqual({
      tournaments: 1,
      events: 1,
      teams: 2,
      games: 1,
      game_odds: 1,
      users: 0,
      user_settings: 0,
      leagues: 1,
      league_members: 2,
      prediction_results: 2,
      prediction_standings: 1,
      prediction_survivals: 2,
      point_results: 1,
      point_standings: 1,
      point_survivals: 1,
    });
  });

  it('map: a user in no loaded tournament is not loaded, and counted without an id', () => {
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
    expect(countOf(mapped, 'users')).toMatchObject({
      loaded: 4,
      skipped: { 'in-no-loaded-tournament': 2 },
      refusals: [],
    });
  });

  it("map: sportbet's seeded survival slots, rows with no event, are skipped", () => {
    expect(countOf(mapped, 'prediction_survivals').skipped).toEqual({
      'not-euroleague': 2,
      'seeded-slot-without-event': 7,
    });
  });

  it('map: a player keeps only the id and the username', () => {
    expect(mapped.players[0]).toEqual({ id: '1', username: 'ada' });
  });
});

describe('map: game odds', () => {
  const mapped = map();

  it('map: the lowest id is kept; an equal duplicate is a notice, a differing one a refusal naming its id', () => {
    expect(countOf(mapped, 'game_odds')).toMatchObject({
      loaded: 4,
      skipped: { 'not-euroleague': 1, 'duplicate-equal': 1 },
      refusals: [{ reason: 'duplicate-key', row: 'id 12' }],
    });
    expect(mapped.notices).toContain(
      'game_odds: game 7 has 2 rows; the lowest id is kept, as sportbetColumns documents',
    );
    const kept = euroleague(mapped).production.odds.find(
      ({ game }) => game === IDS.game(2),
    );
    expect(kept?.odds.home.toString()).toBe('1.59');
  });

  it("map: sportbet's blank odds row reads as odds 0, not CO-5's 1.0", () => {
    const blank = euroleague(mapped).production.odds.find(
      ({ game }) => game === UNSCORED_GAME,
    );
    expect(blank?.odds.home.equals(Odds.ZERO)).toBe(true);
    expect(blank?.odds.draw.equals(Odds.ZERO)).toBe(true);
  });
});

describe('map: refusals', () => {
  it("map: an orphan prediction and a generated of '2' are refused, naming only the game", () => {
    expect(countOf(map(), 'prediction_results').refusals).toEqual([
      { reason: 'orphan', row: 'game 999' },
      { reason: 'bad-generated', row: 'game 7' },
    ]);
  });

  it('map: a tournament without an end date is refused by id, and every row of it depends on it', () => {
    const mapped = map(
      changed('tournaments', (rows) =>
        rows.map((row) =>
          row['id'] === EUROLEAGUE ? { ...row, end_date: null } : row,
        ),
      ),
    );
    expect(mapped.tournaments).toEqual([]);
    expect(countOf(mapped, 'tournaments').refusals).toEqual([
      { reason: 'tournament-without-end-date', row: 'id 2' },
    ]);
    const inherited = 'depends-on-refused (tournament-without-end-date)';
    expect(countOf(mapped, 'events').refused).toEqual({ [inherited]: 2 });
    expect(countOf(mapped, 'games').refused).toEqual({ [inherited]: 4 });
    expect(countOf(mapped, 'prediction_results').refused[inherited]).toBe(11);
    expect(countOf(mapped, 'point_survivals').refused).toEqual({
      [inherited]: 5,
    });
  });

  it('map: an event after round 38 is refused as stage-unknown, and its games with it', () => {
    const mapped = map({
      ...changed('events', (rows) => [
        ...rows,
        {
          id: 6,
          tournament_id: EUROLEAGUE,
          event: 'Play-in',
          event_day: 39,
          event_survival: 0,
          is_knockout: 1,
          active: 1,
          rate: 1,
        },
      ]),
    });
    expect(countOf(mapped, 'events').refusals).toEqual([
      { reason: 'stage-unknown', row: 'id 6' },
    ]);
  });

  it("map: a game whose team is another tournament's is refused as cross-tournament", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      games: [
        ...dump.games,
        {
          id: 11,
          game_date: '2026-06-22 18:00:00',
          event_id: IDS.event(2),
          home_team_id: IDS.team('ZAL'),
          away_team_id: 30,
          reminder_sent: 0,
        },
      ],
    });
    expect(countOf(mapped, 'games').refusals).toEqual([
      { reason: 'cross-tournament', row: 'id 11' },
    ]);
  });

  it("map: a survival pick of another tournament's team is refused as cross-tournament", () => {
    const dump = withSecondTournament(syntheticDump());
    const mapped = map({
      ...dump,
      prediction_survivals: [
        ...dump.prediction_survivals,
        {
          id: 90,
          user_id: IDS.player('cai'),
          team_id: 30,
          event_id: IDS.event(1),
        },
      ],
    });
    expect(countOf(mapped, 'prediction_survivals').refusals).toEqual([
      { reason: 'cross-tournament', row: 'event 4' },
    ]);
  });

  it('map: a second prediction for one game is refused as duplicate-key; the first is kept', () => {
    const mapped = map(
      changed('prediction_results', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: IDS.player('ada'),
          game_id: IDS.game(1),
          home_team_score: 70,
          away_team_score: 60,
          generated: '0',
        },
      ]),
    );
    expect(countOf(mapped, 'prediction_results').refused['duplicate-key']).toBe(
      1,
    );
    expect(
      euroleague(mapped).predictions.find(
        ({ player: id, game }) => id === '1' && game === IDS.game(1),
      )?.home,
    ).toBe(85);
  });

  it('map: a second survival pick in one round is refused as two-picks-in-one-round', () => {
    const mapped = map(
      changed('prediction_survivals', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: IDS.player('ada'),
          team_id: IDS.team('OLY'),
          event_id: IDS.event(1),
        },
      ]),
    );
    expect(countOf(mapped, 'prediction_survivals').refusals).toEqual([
      { reason: 'two-picks-in-one-round', row: 'event 4' },
    ]);
  });

  it('map: two user_settings rows that differ refuse the player, and every row they own depends on it', () => {
    const mapped = map(
      changed('user_settings', (rows) => [
        ...rows,
        {
          id: 90,
          user_id: IDS.player('ben'),
          admin: 0,
          receive_reminders: 0,
          active: 0,
          locale: 'lt',
        },
      ]),
    );
    expect(countOf(mapped, 'user_settings').refused).toEqual({
      'duplicate-key': 2,
    });
    expect(countOf(mapped, 'users').refused).toEqual({
      'depends-on-refused (duplicate-key)': 1,
    });
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      // ben's three Euroleague predictions; his fourth is an orphan.
      'depends-on-refused (duplicate-key)': 3,
    });
    expect(mapped.players.map(({ id }) => id)).toEqual(['1', '3', '4']);
  });

  it('map: a blank username is refused without naming it, and the rows its player owns with it', () => {
    const mapped = map(
      changed('users', (rows) =>
        rows.map((row) =>
          row['id'] === IDS.player('cai') ? { ...row, username: '  ' } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'users').refusals).toEqual([
      { reason: 'bad-username', row: '' },
    ]);
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'depends-on-refused (bad-username)': 3,
    });
  });

  it("map: football's columns set in a Euroleague row are refused as football-column-set", () => {
    const dump = syntheticDump();
    const mapped = map({
      ...dump,
      teams: dump.teams.map((row) =>
        row['id'] === IDS.team('REA') ? { ...row, last16: 1 } : row,
      ),
      prediction_results: dump.prediction_results.map((row) =>
        row['id'] === 3 ? { ...row, game_winner_id: IDS.team('ZAL') } : row,
      ),
      point_standings: dump.point_standings.map((row) =>
        row['id'] === 2 ? { ...row, last32_points: '0' } : row,
      ),
    });
    expect(countOf(mapped, 'teams').refused).toEqual({
      'football-column-set': 1,
    });
    expect(countOf(mapped, 'prediction_results').refused).toMatchObject({
      'football-column-set': 1,
    });
    expect(countOf(mapped, 'point_standings').refused).toMatchObject({
      'football-column-set': 1,
    });
  });

  it('map: a standings point with more places than sportbet stores is refused, never rounded', () => {
    const mapped = map(
      changed('point_standings', (rows) =>
        rows.map((row) =>
          row['id'] === 2
            ? { ...row, group_position_points: '380.00001' }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'point_standings').refusals).toEqual([
      { reason: 'bad-standings-points', row: 'team 5' },
    ]);
  });
});

describe('map: tournament players', () => {
  it("map: a switched-off player is switched off in the tournament, and the tournament's own fill-ins are counted", () => {
    const mapped = map(
      changed('prediction_results', (rows) =>
        rows.map((row) => (row['id'] === 3 ? { ...row, generated: '1' } : row)),
      ),
    );
    expect(euroleague(mapped).players).toEqual([
      { player: '1', switchedOff: false, adminHidden: false, fillIns: 1 },
      { player: '2', switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: '3', switchedOff: false, adminHidden: false, fillIns: 0 },
      { player: '4', switchedOff: true, adminHidden: false, fillIns: 0 },
    ]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

```bash
pnpm test:migrate 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `FAIL  test/map.test.ts` with `Error: Cannot find module '../src/map'`; `Test Files  1 failed | 3 passed (4)`, `Tests  18 passed (18)`.

- [ ] **Step 4: The map**

Create `tools/migrate/src/map.ts`:

```ts
import type { SavedRound, TeamRow, TournamentPlayer } from '@sportbet/db';
import {
  Game,
  gameId,
  instantFrom,
  MatchPrediction,
  playerId,
  PlayerStatus,
  Round,
  sportbetColumns,
  sportbetRules,
  StandingsPrediction,
  SurvivalRun,
  teamId,
  TeamOutcomes,
  tournamentId,
  type GameId,
  type GameOdds,
  type PlayerId,
  type PointsRows,
  type Result,
  type RoundNumber,
  type StandingsRow,
  type StoredMatchRow,
  type StoredPlayer,
  type StoredTeamPick,
  type SurvivalPick,
  type SurvivalPoints,
  type TeamId,
  type TeamOutcome,
  type Tournament,
} from '@sportbet/domain';
import {
  SPORTBET_TABLES,
  type SportbetRows,
  type SportbetTable,
} from './read-columns';

/** The regular season is rounds 1 to 38 (R-10, R-14); sportbet stores no stage. */
const LAST_REGULAR_ROUND = 38;

/** One tournament's rows, mapped through sportbetColumns and the stored factories. */
export interface MappedTournament {
  readonly tournament: Tournament;
  readonly teams: readonly TeamRow[];
  readonly rounds: readonly SavedRound[];
  readonly games: readonly Game[];
  readonly outcomes: TeamOutcomes;
  readonly players: readonly TournamentPlayer[];
  readonly predictions: readonly MatchPrediction[];
  readonly standings: readonly StandingsPrediction[];
  readonly runs: ReadonlyMap<PlayerId, SurvivalRun>;
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
}

/**
 * A row not loaded, and why. `row` names it without personal data: the
 * sportbet id of a row no player owns (`id 7`), the game, team or event a
 * player's row belongs to (`game 7`), or nothing at all.
 */
export interface Refusal {
  readonly reason: string;
  readonly row: string;
}

/** One sportbet table's reconciliation: read = loaded + skipped + refused. */
export interface TableCount {
  readonly table: SportbetTable;
  readonly read: number;
  readonly loaded: number;
  readonly skipped: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
  readonly refusals: readonly Refusal[];
}

export interface Mapped {
  /** Every loaded player: the id and the username only. */
  readonly players: readonly StoredPlayer[];
  readonly tournaments: readonly MappedTournament[];
  readonly tables: readonly TableCount[];
  /** Quirks that were loaded as they are, each worth knowing about. */
  readonly notices: readonly string[];
}

/** What became of a row other rows depend on. */
type Fate =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

const LOADED: Fate = Object.freeze({ kind: 'loaded' });

class Ledger {
  readonly #counts = new Map<
    SportbetTable,
    {
      read: number;
      loaded: number;
      skipped: Map<string, number>;
      refused: Map<string, number>;
      refusals: Refusal[];
    }
  >();

  constructor(rows: SportbetRows) {
    for (const table of SPORTBET_TABLES) {
      this.#counts.set(table, {
        read: rows[table].length,
        loaded: 0,
        skipped: new Map(),
        refused: new Map(),
        refusals: [],
      });
    }
  }

  #of(table: SportbetTable) {
    const count = this.#counts.get(table);
    if (count === undefined) throw new Error(`map: no table ${table}`);
    return count;
  }

  load(table: SportbetTable): void {
    this.#of(table).loaded += 1;
  }

  skip(table: SportbetTable, reason: string): void {
    const { skipped } = this.#of(table);
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  }

  refuse(table: SportbetTable, reason: string, row = ''): void {
    const count = this.#of(table);
    count.refused.set(reason, (count.refused.get(reason) ?? 0) + 1);
    count.refusals.push({ reason, row });
  }

  /**
   * Follows a row's parent: an unknown parent makes it an orphan, a parent
   * skipped by design skips it for the same reason, and a refused parent
   * refuses it with the reason it inherits. True when the parent is loaded.
   */
  follow(
    table: SportbetTable,
    parent: Fate | undefined,
    row: string,
  ): parent is { readonly kind: 'loaded' } {
    if (parent === undefined) {
      this.refuse(table, 'orphan', row);
      return false;
    }
    switch (parent.kind) {
      case 'loaded':
        return true;
      case 'skipped':
        this.skip(table, parent.reason);
        return false;
      case 'refused':
        this.refuse(table, dependsOn(parent.reason), row);
        return false;
    }
  }

  tables(): TableCount[] {
    return SPORTBET_TABLES.map((table) => {
      const count = this.#of(table);
      return {
        table,
        read: count.read,
        loaded: count.loaded,
        skipped: Object.fromEntries(count.skipped),
        refused: Object.fromEntries(count.refused),
        refusals: count.refusals,
      };
    });
  }
}

/** A refusal a row inherits from the row it depends on, named once. */
const dependsOn = (reason: string) =>
  reason.startsWith('depends-on-refused')
    ? reason
    : `depends-on-refused (${reason})`;

const refused = (reason: string): Fate => ({ kind: 'refused', reason });
const skipped = (reason: string): Fate => ({ kind: 'skipped', reason });

/** An id the domain always accepts for a positive sportbet id. */
function must<T, R extends string>(result: Result<T, R>, what: string): T {
  if (!result.ok) throw new Error(`map: ${what}: ${result.refusal}`);
  return result.value;
}
const teamOf = (id: number): TeamId => must(teamId(String(id)), 'team id');
const playerOf = (id: number): PlayerId =>
  must(playerId(String(id)), 'player id');
const gameOf = (id: number): GameId => must(gameId(id), 'game id');

/** sportbet's `game_date` (UTC, `YYYY-MM-DD HH:MM:SS`) as an instant. */
const tipOffOf = (gameDate: string) =>
  instantFrom(`${gameDate.replace(' ', 'T')}Z`);

interface RoundRow {
  readonly tournament: number;
  readonly number: RoundNumber;
  readonly saved: SavedRound;
}
interface TeamEntry {
  readonly tournament: number;
  readonly row: TeamRow;
  readonly outcome: TeamOutcome;
}
interface GameEntry {
  readonly tournament: number;
  readonly game: Game;
}

/** Rows grouped per loaded tournament, as they are mapped. */
class PerTournament<T> {
  readonly #rows = new Map<number, T[]>();

  add(tournament: number, row: T): void {
    this.#rows.set(tournament, [...(this.#rows.get(tournament) ?? []), row]);
  }

  of(tournament: number): readonly T[] {
    return this.#rows.get(tournament) ?? [];
  }
}

/**
 * Maps sportbet's read rows to the domain's stored rows, and reconciles
 * every table: each row is loaded, skipped by design (a football
 * tournament's, a seeded survival slot, a user in no loaded tournament) or
 * refused with a reason. Every value goes through sportbetColumns and then
 * the domain's stored factory, and nothing is mapped anywhere else. Pure:
 * no I/O, so every quirk has a unit test.
 */
export function mapSportbet(rows: SportbetRows): Mapped {
  const ledger = new Ledger(rows);
  const notices: string[] = [];

  // tournaments
  const tournamentFates = new Map<number, Fate>();
  const tournaments = new Map<number, Tournament>();
  for (const row of rows.tournaments) {
    const mapped = sportbetColumns.tournament(row);
    if (mapped.ok) {
      tournaments.set(row.id, mapped.value);
      tournamentFates.set(row.id, LOADED);
      ledger.load('tournaments');
    } else if (mapped.refusal === 'format-not-ported') {
      tournamentFates.set(row.id, skipped('not-euroleague'));
      ledger.skip('tournaments', 'not-euroleague');
    } else {
      tournamentFates.set(row.id, refused(mapped.refusal));
      ledger.refuse('tournaments', mapped.refusal, `id ${String(row.id)}`);
    }
  }
  if (tournaments.size > 0) {
    notices.push(
      'tournaments: sportbet does not record whether its standings table is final (R-14); every tournament is loaded with it not final',
    );
  }

  // events: the rounds
  const eventFates = new Map<number, Fate>();
  const rounds = new Map<number, RoundRow>();
  const roundNumbers = new Set<string>();
  for (const row of rows.events) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => eventFates.set(row.id, to);
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('events', parent, where)) {
      fate(parent === undefined ? refused('orphan') : inherit(parent));
      continue;
    }
    if (row.event_day > LAST_REGULAR_ROUND) {
      fate(refused('stage-unknown'));
      ledger.refuse('events', 'stage-unknown', where);
      continue;
    }
    const mapped = sportbetColumns.round({ ...row, stage: 'regular' });
    if (!mapped.ok) {
      fate(refused(mapped.refusal));
      ledger.refuse('events', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.tournament_id)}/${String(mapped.value.number)}`;
    if (roundNumbers.has(key)) {
      fate(refused('duplicate-key'));
      ledger.refuse('events', 'duplicate-key', where);
      continue;
    }
    roundNumbers.add(key);
    rounds.set(row.id, {
      tournament: row.tournament_id,
      number: mapped.value.number,
      saved: { id: row.id, name: row.event, round: Round.stored(mapped.value) },
    });
    fate(LOADED);
    ledger.load('events');
  }

  // teams, and their outcomes
  const teamFates = new Map<number, Fate>();
  const teams = new Map<number, TeamEntry>();
  for (const row of rows.teams) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => teamFates.set(row.id, to);
    const parent = tournamentFates.get(row.tournament_id);
    if (!ledger.follow('teams', parent, where)) {
      fate(parent === undefined ? refused('orphan') : inherit(parent));
      continue;
    }
    if (row.last16 !== null || row.last32 !== null) {
      fate(refused('football-column-set'));
      ledger.refuse('teams', 'football-column-set', where);
      continue;
    }
    const outcome = sportbetColumns.teamOutcome({
      ...row,
      team: teamOf(row.id),
    });
    if (!outcome.ok) {
      fate(refused(outcome.refusal));
      ledger.refuse('teams', outcome.refusal, where);
      continue;
    }
    const shape = TeamOutcomes.stored([outcome.value], false);
    if (!shape.ok) {
      fate(refused(shape.refusal));
      ledger.refuse('teams', shape.refusal, where);
      continue;
    }
    teams.set(row.id, {
      tournament: row.tournament_id,
      row: { id: teamOf(row.id), name: row.team },
      outcome: outcome.value,
    });
    fate(LOADED);
    ledger.load('teams');
  }

  // games
  const gameFates = new Map<number, Fate>();
  const games = new Map<number, GameEntry>();
  const pairings = new Set<string>();
  for (const row of rows.games) {
    const where = `id ${String(row.id)}`;
    const fate = (to: Fate) => gameFates.set(row.id, to);
    const parents = [
      eventFates.get(row.event_id),
      teamFates.get(row.home_team_id),
      teamFates.get(row.away_team_id),
    ];
    const blocked = firstBlocked(parents);
    if (blocked !== null) {
      ledger.follow('games', blocked.fate, where);
      fate(
        blocked.fate === undefined ? refused('orphan') : inherit(blocked.fate),
      );
      continue;
    }
    const round = rounds.get(row.event_id);
    const home = teams.get(row.home_team_id);
    const away = teams.get(row.away_team_id);
    if (round === undefined || home === undefined || away === undefined) {
      throw new Error('map: a loaded game parent is missing');
    }
    if (
      home.tournament !== round.tournament ||
      away.tournament !== round.tournament
    ) {
      fate(refused('cross-tournament'));
      ledger.refuse('games', 'cross-tournament', where);
      continue;
    }
    const tipOff = tipOffOf(row.game_date);
    if (!tipOff.ok) {
      fate(refused(tipOff.refusal));
      ledger.refuse('games', tipOff.refusal, where);
      continue;
    }
    const mapped = sportbetColumns.game({
      id: gameOf(row.id),
      round: round.number,
      home: home.row.id,
      away: away.row.id,
      tipOff: tipOff.value,
      home_team_score: row.home_team_score,
      away_team_score: row.away_team_score,
      game_winner_id:
        row.game_winner_id === null ? null : teamOf(row.game_winner_id),
    });
    const game = mapped.ok ? Game.stored(mapped.value) : mapped;
    if (!game.ok) {
      fate(refused(game.refusal));
      ledger.refuse('games', game.refusal, where);
      continue;
    }
    const pairing = `${String(row.event_id)}/${String(row.home_team_id)}/${String(row.away_team_id)}`;
    if (pairings.has(pairing)) {
      fate(refused('duplicate-key'));
      ledger.refuse('games', 'duplicate-key', where);
      continue;
    }
    pairings.add(pairing);
    games.set(row.id, { tournament: round.tournament, game: game.value });
    fate(LOADED);
    ledger.load('games');
  }

  // game_odds: sportbet reads first() with no order; the lowest id is kept
  const odds = new PerTournament<GameOdds>();
  const keptOdds = new Map<number, GameOdds>();
  const extraOdds = new Map<number, number>();
  for (const row of rows.game_odds) {
    const where = `id ${String(row.id)}`;
    if (!ledger.follow('game_odds', gameFates.get(row.game_id), where)) {
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined) throw new Error('map: a loaded game is missing');
    const mapped = sportbetColumns.gameOdds({ ...row, game: game.game.id });
    if (!mapped.ok) {
      ledger.refuse('game_odds', mapped.refusal, where);
      continue;
    }
    const kept = keptOdds.get(row.game_id);
    if (kept === undefined) {
      keptOdds.set(row.game_id, mapped.value);
      odds.add(game.tournament, mapped.value);
      ledger.load('game_odds');
      continue;
    }
    extraOdds.set(row.game_id, (extraOdds.get(row.game_id) ?? 1) + 1);
    const same =
      kept.odds.home.equals(mapped.value.odds.home) &&
      kept.odds.away.equals(mapped.value.odds.away) &&
      kept.odds.draw.equals(mapped.value.odds.draw);
    if (same) {
      ledger.skip('game_odds', 'duplicate-equal');
    } else {
      ledger.refuse('game_odds', 'duplicate-key', where);
    }
  }
  for (const [game, count] of extraOdds) {
    notices.push(
      `game_odds: game ${String(game)} has ${String(count)} rows; the lowest id is kept, as sportbetColumns documents`,
    );
  }

  // users: the id and the username, nothing else
  const userFates = new Map<number, Fate>();
  const users = new Map<number, StoredPlayer>();
  for (const row of rows.users) {
    const mapped = sportbetColumns.player(row);
    if (mapped.ok) {
      users.set(row.id, mapped.value);
      userFates.set(row.id, LOADED);
    } else {
      userFates.set(row.id, refused(mapped.refusal));
      ledger.refuse('users', mapped.refusal);
    }
  }

  // user_settings: one global switch per user
  const active = new Map<number, boolean>();
  const settingsRows = new Map<number, number[]>();
  for (const row of rows.user_settings) {
    settingsRows.set(row.user_id, [
      ...(settingsRows.get(row.user_id) ?? []),
      row.active,
    ]);
  }
  const settingsFate = new Map<number, 'kept' | 'duplicate' | 'refused'>();
  for (const [user, values] of settingsRows) {
    if (userFates.get(user) === undefined) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'orphan');
      });
      continue;
    }
    if (new Set(values.map((value) => value !== 0)).size > 1) {
      values.forEach(() => {
        ledger.refuse('user_settings', 'duplicate-key');
      });
      if (userFates.get(user)?.kind === 'loaded') {
        userFates.set(user, refused('duplicate-key'));
        users.delete(user);
        ledger.refuse('users', dependsOn('duplicate-key'));
      }
      settingsFate.set(user, 'refused');
      continue;
    }
    active.set(user, (values[0] ?? 1) !== 0);
    settingsFate.set(user, values.length > 1 ? 'duplicate' : 'kept');
  }

  // leagues and league_members: who plays a tournament
  const leagueTournament = new Map<number, number>();
  const leagueFates = new Map<number, Fate>();
  for (const row of rows.leagues) {
    const parent = tournamentFates.get(row.tournament_id);
    const where = `id ${String(row.id)}`;
    if (ledger.follow('leagues', parent, where)) {
      leagueTournament.set(row.id, row.tournament_id);
      leagueFates.set(row.id, LOADED);
      ledger.load('leagues');
    } else {
      leagueFates.set(
        row.id,
        parent === undefined ? refused('orphan') : inherit(parent),
      );
    }
  }
  const members = new PerTournament<number>();
  for (const row of rows.league_members) {
    const blocked = firstBlocked([
      leagueFates.get(row.league_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('league_members', blocked.fate, '');
      continue;
    }
    const tournament = leagueTournament.get(row.league_id);
    if (tournament === undefined) throw new Error('map: a league is missing');
    members.add(tournament, row.user_id);
    ledger.load('league_members');
  }

  // prediction_results
  const predictions = new PerTournament<{
    user: number;
    prediction: MatchPrediction;
  }>();
  const predicted = new Set<string>();
  for (const row of rows.prediction_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      gameFates.get(row.game_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_results', blocked.fate, where);
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined) throw new Error('map: a loaded game is missing');
    if (row.game_winner_id !== null) {
      ledger.refuse('prediction_results', 'football-column-set', where);
      continue;
    }
    const mapped = sportbetColumns.prediction({
      ...row,
      player: playerOf(row.user_id),
      game: game.game.id,
    });
    const prediction = mapped.ok
      ? MatchPrediction.stored(mapped.value)
      : mapped;
    if (!prediction.ok) {
      ledger.refuse('prediction_results', prediction.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.game_id)}`;
    if (predicted.has(key)) {
      ledger.refuse('prediction_results', 'duplicate-key', where);
      continue;
    }
    predicted.add(key);
    predictions.add(game.tournament, {
      user: row.user_id,
      prediction: prediction.value,
    });
    ledger.load('prediction_results');
  }

  // prediction_standings
  const standingsRows = new PerTournament<{
    user: number;
    pick: StoredTeamPick;
  }>();
  const placed = new Set<string>();
  for (const row of rows.prediction_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_standings', blocked.fate, where);
      continue;
    }
    const team = teams.get(row.team_id);
    if (team === undefined) throw new Error('map: a loaded team is missing');
    if (row.last16 !== null || row.last32 !== null) {
      ledger.refuse('prediction_standings', 'football-column-set', where);
      continue;
    }
    const pick = sportbetColumns.teamPick({ ...row, team: team.row.id });
    const checked = StandingsPrediction.stored(playerOf(row.user_id), [pick]);
    if (!checked.ok) {
      ledger.refuse('prediction_standings', checked.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.team_id)}`;
    if (placed.has(key)) {
      ledger.refuse('prediction_standings', 'duplicate-key', where);
      continue;
    }
    placed.add(key);
    standingsRows.add(team.tournament, { user: row.user_id, pick });
    ledger.load('prediction_standings');
  }

  // prediction_survivals: a pick has an event; a seeded slot has none
  const picks = new PerTournament<{ user: number; pick: SurvivalPick }>();
  const pickedRounds = new Set<string>();
  for (const row of rows.prediction_survivals) {
    if (row.event_id === null) {
      // A slot of a football tournament's team is skipped as football.
      const parent = teamFates.get(row.team_id);
      ledger.skip(
        'prediction_survivals',
        parent?.kind === 'skipped'
          ? parent.reason
          : 'seeded-slot-without-event',
      );
      continue;
    }
    const where = `event ${String(row.event_id)}`;
    const blocked = firstBlocked([
      eventFates.get(row.event_id),
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('prediction_survivals', blocked.fate, where);
      continue;
    }
    const round = rounds.get(row.event_id);
    const team = teams.get(row.team_id);
    if (round === undefined || team === undefined) {
      throw new Error('map: a loaded pick parent is missing');
    }
    if (team.tournament !== round.tournament) {
      ledger.refuse('prediction_survivals', 'cross-tournament', where);
      continue;
    }
    const pick = sportbetColumns.survivalPick({
      team: team.row.id,
      event_day: round.number,
    });
    if (!pick.ok) {
      ledger.refuse('prediction_survivals', pick.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.event_id)}`;
    if (pickedRounds.has(key)) {
      ledger.refuse('prediction_survivals', 'two-picks-in-one-round', where);
      continue;
    }
    pickedRounds.add(key);
    picks.add(round.tournament, { user: row.user_id, pick: pick.value });
    ledger.load('prediction_survivals');
  }

  // point_results: production's match points
  const matchPoints = new PerTournament<{
    user: number;
    row: StoredMatchRow;
  }>();
  const scored = new Set<string>();
  for (const row of rows.point_results) {
    const where = `game ${String(row.game_id)}`;
    const blocked = firstBlocked([
      gameFates.get(row.game_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_results', blocked.fate, where);
      continue;
    }
    const game = games.get(row.game_id);
    if (game === undefined) throw new Error('map: a loaded game is missing');
    const mapped = sportbetColumns.matchPointsRow({
      ...row,
      player: playerOf(row.user_id),
      game: game.game.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_results', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.game_id)}`;
    if (scored.has(key)) {
      ledger.refuse('point_results', 'duplicate-key', where);
      continue;
    }
    scored.add(key);
    matchPoints.add(game.tournament, { user: row.user_id, row: mapped.value });
    ledger.load('point_results');
  }

  // point_standings: production's standings points
  const standingsPoints = new PerTournament<{
    user: number;
    row: StandingsRow;
  }>();
  const standingsScored = new Set<string>();
  for (const row of rows.point_standings) {
    const where = `team ${String(row.team_id)}`;
    const blocked = firstBlocked([
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_standings', blocked.fate, where);
      continue;
    }
    const team = teams.get(row.team_id);
    if (team === undefined) throw new Error('map: a loaded team is missing');
    const mapped = sportbetColumns.standingsPointsRow({
      ...row,
      player: playerOf(row.user_id),
      team: team.row.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_standings', mapped.refusal, where);
      continue;
    }
    const key = `${String(row.user_id)}/${String(row.team_id)}`;
    if (standingsScored.has(key)) {
      ledger.refuse('point_standings', 'duplicate-key', where);
      continue;
    }
    standingsScored.add(key);
    standingsPoints.add(team.tournament, {
      user: row.user_id,
      row: mapped.value,
    });
    ledger.load('point_standings');
  }

  // point_survivals: production's stored survival rows, by sportbet id
  const survivalPoints = new PerTournament<{
    user: number;
    row: SurvivalPoints;
  }>();
  for (const row of rows.point_survivals) {
    const where = `event ${String(row.event_id)}`;
    const blocked = firstBlocked([
      eventFates.get(row.event_id),
      teamFates.get(row.team_id),
      userFates.get(row.user_id),
    ]);
    if (blocked !== null) {
      ledger.follow('point_survivals', blocked.fate, where);
      continue;
    }
    const round = rounds.get(row.event_id);
    const team = teams.get(row.team_id);
    if (round === undefined || team === undefined) {
      throw new Error('map: a loaded survival parent is missing');
    }
    if (team.tournament !== round.tournament) {
      ledger.refuse('point_survivals', 'cross-tournament', where);
      continue;
    }
    const mapped = sportbetColumns.survivalRow({
      ...row,
      player: playerOf(row.user_id),
      event_day: round.number,
      team: team.row.id,
    });
    if (!mapped.ok) {
      ledger.refuse('point_survivals', mapped.refusal, where);
      continue;
    }
    // A production row is the stored row itself: its stored id is its own.
    survivalPoints.add(round.tournament, {
      user: row.user_id,
      row: {
        player: mapped.value.player,
        round: mapped.value.round,
        team: mapped.value.team,
        points: mapped.value.storedPoints,
        provisional: false,
        storedId: mapped.value.id,
      },
    });
    ledger.load('point_survivals');
  }

  // Each loaded tournament: its players are its leagues' members and
  // everyone who owns one of its loaded rows.
  const loadedUsers = new Set<number>();
  const mapped: MappedTournament[] = [];
  for (const [id, tournament] of tournaments) {
    const owners = [
      ...members.of(id),
      ...predictions.of(id).map(({ user }) => user),
      ...standingsRows.of(id).map(({ user }) => user),
      ...picks.of(id).map(({ user }) => user),
      ...matchPoints.of(id).map(({ user }) => user),
      ...standingsPoints.of(id).map(({ user }) => user),
      ...survivalPoints.of(id).map(({ user }) => user),
    ];
    const playing = [...new Set(owners)]
      .filter((user) => users.has(user))
      .sort((a, b) => a - b);
    for (const user of playing) loadedUsers.add(user);
    const key = must(tournamentId(String(id)), 'tournament id');
    const players = playing.map((user): TournamentPlayer => {
      const fillIns = predictions
        .of(id)
        .filter(
          (each) => each.user === user && each.prediction.origin === 'fill-in',
        ).length;
      const status = sportbetColumns.status({
        tournament: key,
        active: active.get(user) ?? true,
        fillIns,
      });
      must(PlayerStatus.stored(status, sportbetRules), 'player status');
      return {
        player: playerOf(user),
        switchedOff: status.switchedOffIn.has(key),
        adminHidden: status.adminHidden,
        fillIns: status.fillIns.get(key) ?? 0,
      };
    });
    const standingsByUser = new Map<number, StoredTeamPick[]>();
    for (const { user, pick } of standingsRows.of(id)) {
      standingsByUser.set(user, [...(standingsByUser.get(user) ?? []), pick]);
    }
    const picksByUser = new Map<number, SurvivalPick[]>();
    for (const { user, pick } of picks.of(id)) {
      picksByUser.set(user, [...(picksByUser.get(user) ?? []), pick]);
    }
    const teamsOf = [...teams.values()].filter(
      (team) => team.tournament === id,
    );
    mapped.push({
      tournament,
      teams: teamsOf.map(({ row }) => row),
      rounds: [...rounds.values()]
        .filter((round) => round.tournament === id)
        .map(({ saved }) => saved),
      games: [...games.values()]
        .filter((game) => game.tournament === id)
        .map(({ game }) => game),
      outcomes: must(
        TeamOutcomes.stored(
          teamsOf.map(({ outcome }) => outcome),
          tournament.standingsTableFinal,
        ),
        'team outcomes',
      ),
      players,
      predictions: predictions.of(id).map(({ prediction }) => prediction),
      standings: [...standingsByUser].map(([user, rowsOfUser]) =>
        must(
          StandingsPrediction.stored(playerOf(user), rowsOfUser),
          'standings prediction',
        ),
      ),
      runs: new Map(
        [...picksByUser].map(([user, picksOfUser]) => [
          playerOf(user),
          must(SurvivalRun.stored(picksOfUser), 'survival run'),
        ]),
      ),
      production: {
        odds: odds.of(id),
        matches: matchPoints.of(id).map(({ row }) => row),
        standings: standingsPoints.of(id).map(({ row }) => row),
        survival: survivalPoints.of(id).map(({ row }) => row),
      },
    });
  }

  // users and user_settings, counted now that the players are known
  for (const [id, fate] of userFates) {
    if (fate.kind !== 'loaded') continue;
    if (loadedUsers.has(id)) {
      ledger.load('users');
    } else {
      ledger.skip('users', 'in-no-loaded-tournament');
    }
  }
  for (const [user, values] of settingsRows) {
    // An orphan's rows and differing duplicates are counted above.
    const fate = settingsFate.get(user);
    if (fate === undefined || fate === 'refused') continue;
    const userFate = userFates.get(user);
    values.forEach((_, index) => {
      if (index > 0) {
        ledger.skip('user_settings', 'duplicate-equal');
      } else if (userFate?.kind === 'refused') {
        ledger.refuse('user_settings', dependsOn(userFate.reason));
      } else if (loadedUsers.has(user)) {
        ledger.load('user_settings');
      } else {
        ledger.skip('user_settings', 'user-not-loaded');
      }
    });
  }

  return {
    players: [...loadedUsers]
      .sort((a, b) => a - b)
      .flatMap((id) => {
        const player = users.get(id);
        return player === undefined ? [] : [player];
      }),
    tournaments: mapped,
    tables: ledger.tables(),
    notices,
  };
}

/** A parent's fate as its dependants see it: skipped stays skipped, refused is inherited. */
function inherit(parent: Fate): Fate {
  switch (parent.kind) {
    case 'loaded':
      return LOADED;
    case 'skipped':
      return parent;
    case 'refused':
      return refused(dependsOn(parent.reason));
  }
}

/**
 * The first parent that keeps a row from loading: an unknown one (an
 * orphan) first, then one skipped or refused. Null when all are loaded.
 */
function firstBlocked(
  parents: readonly (Fate | undefined)[],
): { readonly fate: Fate | undefined } | null {
  if (parents.includes(undefined)) return { fate: undefined };
  const blocked = parents.find(
    (parent) => parent !== undefined && parent.kind !== 'loaded',
  );
  return blocked === undefined ? null : { fate: blocked };
}
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  4 passed (4)` and `Tests  41 passed (41)`.

- [ ] **Step 6: Commit**

```bash
git add tools/migrate
git commit -m "$(cat <<'EOF'
feat(migrate): mapSportbet reconciles every table; a synthetic golden dump for its tests (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: The load, the recalculation and the report

`loadMapped` writes the mapped rows through the repositories in one transaction, in foreign-key order, then moves the identity sequences past the loaded ids; loading the same rows twice leaves the same rows. `recalculateLoaded` runs `recalculateTournament` over each loaded tournament under both rule sets - sportbet from production's stored odds and survival rows, ruled from the votes and the picks - and saves each result under its rule set's name; a refusal is reported, not thrown. The report holds counts, sportbet ids of rows no player owns and the dump's name, size and hash, never a username, name, email or player id; the exit status is 0 when nothing was refused, 1 when anything was, 2 when the run could not complete.

**Files:**
- Create: `tools/migrate/src/load.ts`, `tools/migrate/src/report.ts`
- Test: `tools/migrate/test/load.test.ts`, `tools/migrate/src/report.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/migrate/test/load.test.ts`:

```ts
import {
  countPointsRows,
  findTournamentBySlug,
  loadTournamentInputs,
  loadTournamentPoints,
  type Db,
} from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadMapped, recalculateLoaded } from '../src/load';
import { mapSportbet } from '../src/map';
import { readRows, syntheticDump } from './fixtures/sportbet-dump';

const { db, client } = useTestDatabase();

const mapped = () => mapSportbet(readRows(syntheticDump()));

/** Every table's row count, and the golden tournament's rows as the domain reads them. */
async function everything(database: Db) {
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      (
        await client.query(
          "select tablename as name from pg_tables where schemaname = 'public' order by tablename",
        )
      ).rows,
    );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = z
      .array(z.object({ rows: z.coerce.number() }))
      .parse(
        (await client.query(`select count(*) as rows from "${name}"`)).rows,
      );
    counts[name] = row?.rows ?? 0;
  }
  const tournament = await findTournamentBySlug(database, 'golden-el');
  if (tournament === undefined) throw new Error('golden-el was not loaded');
  return {
    counts,
    inputs: await loadTournamentInputs(database, tournament, {
      odds: 'stored',
      survival: 'stored-rows',
    }),
    production: await loadTournamentPoints(database, tournament, 'production'),
  };
}

describe('the load', () => {
  it('leaves the same rows when the same mapped rows are loaded twice', async () => {
    await loadMapped(db, mapped());
    const once = await everything(db);
    await loadMapped(db, mapped());
    expect(await everything(db)).toEqual(once);
    expect(once.counts).toMatchObject({
      tournaments: 1,
      players: 4,
      games: 4,
      match_predictions: 10,
      survival_picks: 5,
    });
  });

  it('leaves one set of rows per source when the tournament is recalculated twice', async () => {
    await loadMapped(db, mapped());
    const tournament = await findTournamentBySlug(db, 'golden-el');
    if (tournament === undefined) throw new Error('golden-el was not loaded');
    await recalculateLoaded(db, [tournament]);
    const once = await countPointsRows(db, tournament);
    await recalculateLoaded(db, [tournament]);
    expect(await countPointsRows(db, tournament)).toEqual(once);
    expect(once).toEqual({
      game_odds: { production: 4, sportbet: 3, ruled: 3 },
      match_points: { production: 9, sportbet: 9, ruled: 9 },
      standings_points: { production: 8, sportbet: 8, ruled: 8 },
      survival_points: { production: 5, sportbet: 5, ruled: 5 },
    });
  });
});
```

Create `tools/migrate/src/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyReport, exitStatusOf, renderReport } from './report';

const table = {
  table: 'games' as const,
  inDump: 2,
  read: 2,
  loaded: 1,
  skipped: {},
  refused: { 'same-team-twice': 1 },
  refusals: [{ reason: 'same-team-twice', row: 'id 9' }],
};

describe('the exit status', () => {
  it('is 0 when nothing was refused', () => {
    expect(
      exitStatusOf({
        ...emptyReport(),
        tables: [{ ...table, refused: {}, refusals: [] }],
      }),
    ).toBe(0);
  });

  it('is 1 when a row, or a recalculation, was refused', () => {
    expect(exitStatusOf({ ...emptyReport(), tables: [table] })).toBe(1);
    expect(
      exitStatusOf({
        ...emptyReport(),
        recalculations: [
          { tournament: 2, rules: 'ruled', refusal: 'odds-missing' },
        ],
      }),
    ).toBe(1);
  });

  it('is 2 when the run could not complete', () => {
    expect(
      exitStatusOf({ ...emptyReport(), tables: [table], problem: 'no dump' }),
    ).toBe(2);
  });
});

describe('the printed report', () => {
  it('names a refused row no player owns by its sportbet id', () => {
    expect(renderReport({ ...emptyReport(), tables: [table] })).toContain(
      'refused same-team-twice: id 9',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm test:migrate 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `src/report.test.ts` and `test/load.test.ts` fail with `Error: Cannot find module './report'` and `'../src/load'`; `Test Files  2 failed | 4 passed (6)`, `Tests  41 passed (41)`.

- [ ] **Step 3: The load and the report**

Create `tools/migrate/src/load.ts`:

```ts
import {
  advanceIdentitySequences,
  countPointsRows,
  loadTournamentInputs,
  saveGames,
  saveMatchPredictions,
  savePlayers,
  saveRounds,
  saveStandingsPredictions,
  saveSurvivalPicks,
  saveTeamOutcomes,
  saveTeams,
  saveTournament,
  saveTournamentPlayers,
  saveTournamentPoints,
  type Db,
  type InputReads,
  type PointsSource,
  type PointsTable,
} from '@sportbet/db';
import {
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type RecalculationRefusal,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import type { Mapped } from './map';

/**
 * Writes the mapped rows through the repositories in one transaction, in
 * foreign-key order, then moves every identity sequence past the loaded
 * ids. Every save is an upsert or a replace, so loading the same rows twice
 * leaves the same rows.
 */
export async function loadMapped(db: Db, mapped: Mapped): Promise<void> {
  await db.transaction(async (tx) => {
    await savePlayers(tx, mapped.players);
    for (const each of mapped.tournaments) {
      const { tournament } = each;
      await saveTournament(tx, tournament);
      await saveTeams(tx, tournament, each.teams);
      await saveRounds(tx, tournament, each.rounds);
      await saveGames(tx, tournament, each.games);
      await saveTeamOutcomes(tx, each.outcomes);
      await saveTournamentPlayers(tx, tournament, each.players);
      await saveMatchPredictions(tx, each.predictions);
      await saveStandingsPredictions(tx, each.standings);
      await saveSurvivalPicks(tx, tournament, each.runs);
      await saveTournamentPoints(tx, tournament, 'production', each.production);
    }
    await advanceIdentitySequences(tx);
  });
}

/** One recalculation the reader ran: refused, or saved under its rule set. */
export interface Recalculation {
  readonly tournament: number;
  readonly rules: RuleSet['name'];
  readonly refusal: RecalculationRefusal | null;
}

/**
 * What each rule set reads: parity under sportbetRules reads production's
 * stored odds (CO-7) and refolds its stored survival rows (SU-10); the
 * ruled set computes the odds from the votes and folds the picks.
 */
const RUNS: readonly (readonly [RuleSet, InputReads])[] = [
  [sportbetRules, { odds: 'stored', survival: 'stored-rows' }],
  [ruledRules, { odds: 'from-votes', survival: 'picks' }],
];

/**
 * recalculateTournament over each loaded tournament under both rule sets,
 * each result saved under its rule set's name. A refusal is reported, not
 * thrown.
 */
export async function recalculateLoaded(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<Recalculation[]> {
  const done: Recalculation[] = [];
  for (const tournament of tournaments) {
    for (const [rules, reads] of RUNS) {
      const inputs = await loadTournamentInputs(db, tournament, reads);
      const result = recalculateTournament(inputs, rules);
      if (result.ok) {
        await saveTournamentPoints(db, tournament, rules.name, result.value);
      }
      done.push({
        tournament: tournament.id,
        rules: rules.name,
        refusal: result.ok ? null : result.refusal,
      });
    }
  }
  return done;
}

/** The rows of each source in each points table, per loaded tournament. */
export async function pointsRowCounts(
  db: Db,
  tournaments: readonly Tournament[],
): Promise<
  {
    readonly tournament: number;
    readonly rows: Record<PointsTable, Record<PointsSource, number>>;
  }[]
> {
  const counts = [];
  for (const tournament of tournaments) {
    counts.push({
      tournament: tournament.id,
      rows: await countPointsRows(db, tournament),
    });
  }
  return counts;
}
```

Create `tools/migrate/src/report.ts`:

```ts
import type { PointsSource, PointsTable } from '@sportbet/db';
import type { Recalculation } from './load';
import type { TableCount } from './map';

/**
 * The load report: counts, the sportbet ids of rows no player owns, and the
 * dump's name, size and hash. Never a username, name, email or player id.
 */
export interface Report {
  readonly dump: {
    readonly object: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly ageHours: number;
    readonly stale: boolean;
    readonly engine: string;
    readonly image: string;
  } | null;
  /** Per sportbet table: rows in the dump, then the reconciliation. */
  readonly tables: readonly (TableCount & { readonly inDump: number })[];
  readonly notices: readonly string[];
  readonly points: readonly {
    readonly tournament: number;
    readonly rows: Record<PointsTable, Record<PointsSource, number>>;
  }[];
  readonly recalculations: readonly Recalculation[];
  readonly cleanup: readonly string[];
  /** Why the run could not complete, if it could not. */
  readonly problem: string | null;
  /** 0 nothing refused, 1 something refused, 2 the run could not complete. */
  readonly exitStatus: 0 | 1 | 2;
}

export const emptyReport = (): Report => ({
  dump: null,
  tables: [],
  notices: [],
  points: [],
  recalculations: [],
  cleanup: [],
  problem: null,
  exitStatus: 2,
});

/** The exit status a finished run's report earns. */
export function exitStatusOf(report: Report): 0 | 1 | 2 {
  if (report.problem !== null) return 2;
  const refused =
    report.tables.some((table) => table.refusals.length > 0) ||
    report.recalculations.some(({ refusal }) => refusal !== null);
  return refused ? 1 : 0;
}

const counted = (counts: Readonly<Record<string, number>>) =>
  Object.entries(counts)
    .map(([reason, count]) => `${reason} ${String(count)}`)
    .join(', ') || '-';

/** The report as the reader prints it. */
export function renderReport(report: Report): string {
  const lines: string[] = ['sportbet production-copy load report', ''];
  if (report.dump !== null) {
    const { dump } = report;
    lines.push(
      `dump    ${dump.object}`,
      `        ${String(dump.bytes)} bytes, sha256 ${dump.sha256}`,
      `        ${String(dump.ageHours)} hours old${dump.stale ? ' - WARNING: older than 26 hours' : ''}`,
      `        ${dump.engine}, restored on ${dump.image}`,
      '',
    );
  }
  if (report.tables.length > 0) {
    lines.push('table                  dump  read loaded  skipped / refused');
    for (const table of report.tables) {
      lines.push(
        `${table.table.padEnd(21)} ${String(table.inDump).padStart(5)} ${String(table.read).padStart(5)} ${String(table.loaded).padStart(6)}  skipped: ${counted(table.skipped)}; refused: ${counted(table.refused)}`,
      );
      for (const { reason, row } of table.refusals) {
        if (row !== '')
          lines.push(`${' '.repeat(23)}refused ${reason}: ${row}`);
      }
    }
    lines.push('');
  }
  for (const notice of report.notices) lines.push(`notice  ${notice}`);
  if (report.notices.length > 0) lines.push('');
  for (const { tournament, rows } of report.points) {
    lines.push(
      `points of tournament ${String(tournament)} (production / sportbet / ruled)`,
    );
    for (const [table, sources] of Object.entries(rows)) {
      lines.push(
        `        ${table.padEnd(17)} ${String(sources.production)} / ${String(sources.sportbet)} / ${String(sources.ruled)}`,
      );
    }
  }
  for (const { tournament, rules, refusal } of report.recalculations) {
    if (refusal !== null) {
      lines.push(
        `recalculation refused: tournament ${String(tournament)} under ${rules}: ${refusal}`,
      );
    }
  }
  if (report.problem !== null)
    lines.push(`could not complete: ${report.problem}`);
  for (const line of report.cleanup) lines.push(`cleanup ${line}`);
  lines.push(`exit    ${String(report.exitStatus)}`);
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
```

Expected: lint and typecheck clean; `Test Files  6 passed (6)` and `Tests  47 passed (47)`.

- [ ] **Step 5: Commit**

```bash
git add tools/migrate
git commit -m "$(cat <<'EOF'
feat(migrate): load through the repositories, recalculate under both rule sets, report (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: The containers, the run and the command

The rest of the pipeline. The MySQL container comes from the image pinned to production's version, with its data directory on tmpfs, a random per-run root password held in memory, its port on the loopback interface only and the `sportbet-migrate` label; the dump is streamed, decompressed, into its `mysql` client (a failure reports the client's exit code and the dump line only, never its message). The restored schema must hold every read column with sportbet's type (a column added later is ignored). The Postgres container is labelled, tmpfs, loopback and random-password too, migrated with `runMigrations`. `runReader` removes a crashed run's leftovers first, and at the end deletes the dump, its temporary directory and both containers, then fails the run if any labelled container remains; `--keep` keeps only the Postgres, until Ctrl-C. The command takes no database URL.

The end-to-end test runs the whole reader on the synthetic dump - the fetch step replaced by the fixture, on a real `mysql:26.7.0` and a real `postgres:18.6` - and asserts every table's counts, the loaded golden inputs, production's rows and the recalculated sportbet rows equal to `golden-points.json`, the ruled rows, the exit status, no sentinel in stdout, stderr, the JSON report or a `pg_dump` of the loaded Postgres, the players table's two columns, and nothing left behind.

**Files:**
- Create: `tools/migrate/src/containers.ts`, `tools/migrate/src/sportbet-read.ts`, `tools/migrate/src/run.ts`, `tools/migrate/src/bin/migrate.ts`, `tools/migrate/build.mjs`
- Modify: `tools/migrate/package.json`
- Test: `tools/migrate/src/containers.test.ts`, `tools/migrate/src/sportbet-read.test.ts`, `tools/migrate/test/reader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tools/migrate/src/containers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scrubbedLoadError } from './containers';

describe('a failed restore', () => {
  it("reports the mysql client's exit code and the dump line only, never its message", () => {
    const stderr =
      "ERROR 1064 (42000) at line 57: You have an error in your SQL syntax near 'Sentinel-Name-ada','sentinel.ada@example.invalid'";
    const reported = scrubbedLoadError(1, stderr);
    expect(reported).toBe('the mysql client exited with 1 at dump line 57');
    expect(reported).not.toContain('Sentinel');
  });

  it('reports the exit code alone when the client names no line', () => {
    expect(
      scrubbedLoadError(2, 'ERROR 2002 (HY000): Can not connect: sentinel'),
    ).toBe('the mysql client exited with 2');
  });
});
```

Create `tools/migrate/src/sportbet-read.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { columnsOf, expectedType, SPORTBET_TABLES } from './read-columns';
import { driftOf } from './sportbet-read';

/** Every read column as sportbet's migrations at 0da316f give it. */
const asMigrated = () =>
  new Map(
    SPORTBET_TABLES.flatMap((table) =>
      columnsOf(table).map((column): [string, string] => [
        `${table}.${column}`,
        expectedType(table, column),
      ]),
    ),
  );

describe('the schema drift check', () => {
  it("finds none in sportbet's schema at 0da316f, whatever columns it added besides", () => {
    const found = asMigrated();
    found.set('users.locale', 'varchar(5)');
    found.set('games.reminder_sent', 'tinyint(1)');
    expect(driftOf(found)).toEqual([]);
  });

  it('names a read column that is missing', () => {
    const found = asMigrated();
    found.delete('users.username');
    expect(driftOf(found)).toEqual(['users.username: missing']);
  });

  it('names a read column whose type changed', () => {
    const found = asMigrated();
    found.set('point_standings.final_points', 'decimal(10,4)');
    expect(driftOf(found)).toEqual([
      'point_standings.final_points: expected double, found decimal(10,4)',
    ]);
  });
});
```

Create `tools/migrate/test/reader.test.ts`:

```ts
// The whole reader on a synthetic dump built from sportbet's golden scenario
// - never production data - on a real MySQL from the pinned image and a real
// Postgres. The fetch step is the one seam: it hands over the fixture file.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  createDb,
  findTournamentBySlug,
  loadTournamentInputs,
  loadTournamentPoints,
  type DbHandle,
  type PointsSource,
} from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import {
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  snapshotOf,
} from '@sportbet/domain/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderReport } from '../src/report';
import { runReader, WORKSPACE_PREFIX, type ReaderResult } from '../src/run';
import {
  DUMP_IDS,
  renderDump,
  SENTINELS,
  syntheticDump,
  UNSCORED_GAME,
} from './fixtures/sportbet-dump';

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true });
const volumes = () => docker('volume', 'ls', '-q').split('\n').filter(Boolean);
const workspaces = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(WORKSPACE_PREFIX));

let result: ReaderResult;
let output = '';
let volumesBefore: string[] = [];
let database: DbHandle;
let tournament: Tournament;

beforeAll(async () => {
  volumesBefore = volumes();
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  try {
    result = await runReader({
      fetcher: {
        fetch: (directory) => {
          const path = join(directory, 'backup.sql.gz');
          writeFileSync(path, gzipSync(renderDump(syntheticDump())));
          return Promise.resolve({ objectName: OBJECT, path });
        },
      },
      keep: true,
      now: () => new Date('2026-09-29T12:00:00Z'),
    });
    process.stdout.write(renderReport(result.report));
    process.stdout.write(JSON.stringify(result.report));
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
  if (result.kept === null) {
    throw new Error(
      `the reader kept no database: ${String(result.report.problem)}`,
    );
  }
  database = createDb(result.kept.url);
  const found = await findTournamentBySlug(database.db, 'golden-el');
  if (found === undefined) throw new Error('golden-el was not loaded');
  tournament = found;
});

afterAll(async () => {
  await database.close();
  await result.kept?.stop();
});

const points = async (source: PointsSource) => {
  const rows = await loadTournamentPoints(database.db, tournament, source);
  return snapshotOf(
    { ...rows, odds: rows.odds.filter(({ game }) => game !== UNSCORED_GAME) },
    DUMP_IDS,
  );
};

describe('the reader, end to end on a synthetic dump', () => {
  it('reports the dump it read, and exits 1: the fixture has refusals', () => {
    expect(result.report.dump).toMatchObject({
      object: OBJECT,
      ageHours: 9,
      stale: false,
      engine: 'mysql 26.7.0',
      image: 'mysql:26.7.0',
    });
    expect(result.report.problem).toBeNull();
    expect(result.report.exitStatus).toBe(1);
  });

  it("counts every table's rows: in the dump, read, loaded, skipped and refused", () => {
    const counts = Object.fromEntries(
      result.report.tables.map(
        ({ table, inDump, read, loaded, skipped, refused }) => [
          table,
          { inDump, read, loaded, skipped, refused },
        ],
      ),
    );
    const euroleagueOnly = (
      inDump: number,
      loaded: number,
      footballRows: number,
    ) => ({
      inDump,
      read: inDump,
      loaded,
      skipped: { 'not-euroleague': footballRows },
      refused: {},
    });
    expect(counts).toEqual({
      tournaments: euroleagueOnly(2, 1, 1),
      events: euroleagueOnly(3, 2, 1),
      teams: euroleagueOnly(6, 4, 2),
      games: euroleagueOnly(5, 4, 1),
      game_odds: {
        inDump: 7,
        read: 7,
        loaded: 4,
        skipped: { 'not-euroleague': 1, 'duplicate-equal': 1 },
        refused: { 'duplicate-key': 1 },
      },
      users: {
        inDump: 6,
        read: 6,
        loaded: 4,
        skipped: { 'in-no-loaded-tournament': 2 },
        refused: {},
      },
      user_settings: {
        inDump: 6,
        read: 6,
        loaded: 4,
        skipped: { 'user-not-loaded': 2 },
        refused: {},
      },
      leagues: euroleagueOnly(2, 1, 1),
      league_members: euroleagueOnly(6, 4, 2),
      prediction_results: {
        inDump: 14,
        read: 14,
        loaded: 10,
        skipped: { 'not-euroleague': 2 },
        refused: { orphan: 1, 'bad-generated': 1 },
      },
      prediction_standings: euroleagueOnly(9, 8, 1),
      prediction_survivals: {
        inDump: 14,
        read: 14,
        loaded: 5,
        skipped: { 'not-euroleague': 2, 'seeded-slot-without-event': 7 },
        refused: {},
      },
      point_results: euroleagueOnly(10, 9, 1),
      point_standings: euroleagueOnly(9, 8, 1),
      point_survivals: euroleagueOnly(6, 5, 1),
    });
  });

  it('loads the golden inputs, mapped through sportbetColumns and the stored factories', async () => {
    const loaded = await loadTournamentInputs(database.db, tournament, {
      odds: 'from-votes',
      survival: 'picks',
    });
    const golden = goldenInputs({}, DUMP_IDS);
    expect(loaded.season.rounds).toEqual(golden.season.rounds);
    expect(
      loaded.season.games.filter(({ id }) => id !== UNSCORED_GAME),
    ).toEqual(golden.season.games);
    expect(loaded.players).toEqual(golden.players);
    expect(loaded.standings).toEqual(golden.standings);
    expect(loaded.outcomes.teams).toEqual(golden.outcomes.teams);
    expect(loaded.survival).toEqual(golden.survival);
  });

  it("loads production's points rows as golden-points.json's 25 Euroleague entries", async () => {
    expect(await points('production')).toEqual(GOLDEN_POINTS);
  });

  it('recalculates the sportbet rows to golden-points.json, from the stored odds and survival rows', async () => {
    expect(await points('sportbet')).toEqual(GOLDEN_POINTS);
  });

  it('recalculates the ruled rows as the catalogue lists, every place unscored while the table is not marked final (R-14)', async () => {
    // sportbet does not record whether its table is final, so the reader
    // loads it as not final; the ruled set then pays no place yet (ST-8,
    // R-14, unscoredPlaceStoresNull). Everything else is the catalogue's.
    const notFinal = {
      ...GOLDEN_POINTS_RULED,
      point_standings: Object.fromEntries(
        Object.entries(GOLDEN_POINTS_RULED.point_standings).map(
          ([key, row]) => [
            key,
            { ...row, group_position_points: null, group_position_odds: null },
          ],
        ),
      ),
    };
    expect(await points('ruled')).toEqual(notFinal);
    expect(result.report.recalculations).toEqual([
      { tournament: 2, rules: 'sportbet', refusal: null },
      { tournament: 2, rules: 'ruled', refusal: null },
    ]);
  });

  it('prints no sentinel name, surname, email or IP address, in the report or the JSON report', () => {
    expect(output).toContain('sportbet production-copy load report');
    expect(SENTINELS.filter((sentinel) => output.includes(sentinel))).toEqual(
      [],
    );
    expect(output).not.toContain('@');
  });

  it('loads no sentinel into Postgres: a pg_dump of it holds none', () => {
    const url = new URL(result.kept?.url ?? '');
    const dumped = execFileSync(
      'docker',
      [
        'exec',
        '-e',
        'PGPASSWORD',
        result.kept?.containerId ?? '',
        'pg_dump',
        '--username',
        decodeURIComponent(url.username),
        url.pathname.slice(1),
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
      },
    );
    expect(dumped).toContain('COPY public.players');
    expect(SENTINELS.filter((sentinel) => dumped.includes(sentinel))).toEqual(
      [],
    );
    expect(dumped).not.toContain('@');
  });

  it('stores exactly the id and the username of a player', async () => {
    const columns = await database.db.execute(
      "select column_name from information_schema.columns where table_name = 'players' order by ordinal_position",
    );
    expect(
      z
        .array(z.object({ column_name: z.string() }))
        .parse(columns.rows)
        .map(({ column_name }) => column_name),
    ).toEqual(['id', 'username']);
  });

  it('leaves nothing behind once the kept Postgres is stopped: no dump, no labelled container, no volume', async () => {
    await database.close();
    database = { db: database.db, close: () => Promise.resolve() };
    expect(workspaces()).toEqual([]);
    expect(await result.kept?.stop()).toEqual([]);
    expect(docker('ps', '-a', '-q', '--filter', 'label=sportbet-migrate')).toBe(
      '',
    );
    expect(
      volumes().filter((volume) => !volumesBefore.includes(volume)),
    ).toEqual([]);
    expect(existsSync(join(tmpdir(), 'backup.sql.gz'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
pnpm test:migrate 2>&1 | grep -E "FAIL|Error|Test Files|Tests "
```

Expected: `src/containers.test.ts`, `src/sportbet-read.test.ts` and `test/reader.test.ts` fail with `Error: Cannot find module` (`./containers`, `./sportbet-read`, `../src/run`); `Test Files  3 failed | 6 passed (9)`, `Tests  47 passed (47)`.

- [ ] **Step 3: The containers and the MySQL read**

Create `tools/migrate/src/containers.ts`:

```ts
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { POSTGRES_IMAGE } from '@sportbet/db/migrations';
import { ok, refuse, type Result } from '@sportbet/domain';
import {
  MySqlContainer,
  type StartedMySqlContainer,
} from '@testcontainers/mysql';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';

/**
 * Production's MySQL: HeatWave `sportbet-db` reports 26.7.0. Bumped
 * deliberately when HeatWave's is; a dump from another major.minor is
 * refused (checkDump).
 */
export const MYSQL_IMAGE = 'mysql:26.7.0';
export const MYSQL_VERSION = '26.7.0';

/** Every container the reader starts carries this label, and only those. */
export const LABEL = 'sportbet-migrate';

const MYSQL_DATABASE = 'sportbet';

/** A random per-run password, held only in memory. */
const password = () => randomBytes(24).toString('hex');

/** Publishes the container's ports on the loopback interface only. */
function loopbackOnly(hostConfig: {
  PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[]>;
}): void {
  for (const bindings of Object.values(hostConfig.PortBindings ?? {})) {
    for (const binding of bindings) binding.HostIp = '127.0.0.1';
  }
}

class LoopbackMySqlContainer extends MySqlContainer {
  protected override beforeContainerCreated(): Promise<void> {
    loopbackOnly(this.hostConfig);
    return Promise.resolve();
  }
}

class LoopbackPostgreSqlContainer extends PostgreSqlContainer {
  protected override beforeContainerCreated(): Promise<void> {
    loopbackOnly(this.hostConfig);
    return Promise.resolve();
  }
}

/**
 * A throwaway MySQL to restore the dump into: its data directory on tmpfs
 * (the image's volume path, so no Docker volume is made), a random root
 * password, loopback only, labelled.
 */
export async function startMySql(): Promise<StartedMySqlContainer> {
  return new LoopbackMySqlContainer(MYSQL_IMAGE)
    .withDatabase(MYSQL_DATABASE)
    .withRootPassword(password())
    .withUserPassword(password())
    .withTmpFs({ '/var/lib/mysql': 'rw' })
    .withLabels({ [LABEL]: 'mysql' })
    .start();
}

/** The throwaway Postgres the reader loads: tmpfs data, loopback, random password, labelled. */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new LoopbackPostgreSqlContainer(POSTGRES_IMAGE)
    .withPassword(password())
    .withTmpFs({ '/var/lib/postgresql': 'rw' })
    .withLabels({ [LABEL]: 'postgres' })
    .start();
}

/** A connection URL on the loopback address the ports are published on. */
export const postgresUrl = (container: StartedPostgreSqlContainer) =>
  `postgres://${encodeURIComponent(container.getUsername())}:${encodeURIComponent(container.getPassword())}@127.0.0.1:${String(container.getPort())}/${container.getDatabase()}`;

/**
 * What a failed load may say: the mysql client's exit code and the dump's
 * line number, never its message, which quotes the statement near the
 * error and so could quote a row of `users`.
 */
export function scrubbedLoadError(exitCode: number, stderr: string): string {
  const line = /\bat line (\d+)/.exec(stderr)?.[1];
  return `the mysql client exited with ${String(exitCode)}${line === undefined ? '' : ` at dump line ${line}`}`;
}

/**
 * Restores the gzipped dump into the container's database: the file is
 * decompressed as it is streamed into the `mysql` client inside the
 * container (`docker exec -i`), so the dump is never written inside it.
 * The root password goes by environment, never on a command line.
 */
export async function restoreDump(
  container: StartedMySqlContainer,
  gzipped: string,
): Promise<Result<null, string>> {
  const client = spawn(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'MYSQL_PWD',
      container.getId(),
      'mysql',
      '--user=root',
      '--default-character-set=utf8mb4',
      MYSQL_DATABASE,
    ],
    {
      env: { ...process.env, MYSQL_PWD: container.getRootPassword() },
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    },
  );
  let stderr = '';
  client.stderr.setEncoding('utf8');
  client.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<number>((resolve, reject) => {
    client.on('error', reject);
    client.on('close', (code) => {
      resolve(code ?? -1);
    });
  });
  try {
    await pipeline(createReadStream(gzipped), createGunzip(), client.stdin);
  } catch {
    // The client stopped reading; its exit code says why.
  }
  const code = await exited;
  return code === 0 ? ok(null) : refuse(scrubbedLoadError(code, stderr));
}

/** The MySQL connection the reader reads through: loopback, root, the restored database. */
export const mysqlConnection = (container: StartedMySqlContainer) => ({
  host: '127.0.0.1',
  port: container.getPort(),
  user: 'root',
  password: container.getRootPassword(),
  database: MYSQL_DATABASE,
});

/** The ids of every container, running or not, that carries the reader's label. */
export async function labelledContainers(): Promise<string[]> {
  const client = await getContainerRuntimeClient();
  const containers = await client.container.dockerode.listContainers({
    all: true,
    filters: { label: [LABEL] },
  });
  return containers.map(({ Id }) => Id);
}

/** Removes every container that carries the reader's label; returns how many. */
export async function removeLabelledContainers(): Promise<number> {
  const client = await getContainerRuntimeClient();
  const ids = await labelledContainers();
  for (const id of ids) {
    await client.container.dockerode
      .getContainer(id)
      .remove({ force: true, v: true });
  }
  return ids.length;
}
```

Create `tools/migrate/src/sportbet-read.ts`:

```ts
import mysql, { type Connection, type ConnectionOptions } from 'mysql2/promise';
import { z } from 'zod';
import {
  columnsOf,
  expectedType,
  ORDER_BY,
  READ_COLUMNS,
  SPORTBET_TABLES,
  type SportbetRows,
  type SportbetTable,
} from './read-columns';

/**
 * A connection that hands every value over as READ_COLUMNS parses it:
 * DATE and DATETIME as text (dateStrings), a `double` as the shortest text
 * that reads back as it, and a BLOB (`generated`) as its bytes read one
 * character each, so an unexpected byte is kept and refused, not guessed.
 */
export function openSportbet(options: ConnectionOptions): Promise<Connection> {
  return mysql.createConnection({
    ...options,
    dateStrings: true,
    typeCast: (field, next) => {
      if (field.type === 'DOUBLE') return field.string();
      if (field.type === 'BLOB')
        return field.buffer()?.toString('latin1') ?? null;
      return next();
    },
  });
}

const quoted = (name: string) => `\`${name.replaceAll('`', '``')}\``;

const described = z.array(
  z.object({ table: z.string(), column: z.string(), type: z.string() }),
);

/**
 * Every read column the restored database lacks, or holds with another
 * type than sportbet's migrations at 0da316f give it, as `table.column:
 * why`, from the columns found (`table.column` to its column_type). A
 * column sportbet added later is not the reader's concern.
 */
export function driftOf(found: ReadonlyMap<string, string>): string[] {
  return SPORTBET_TABLES.flatMap((table) =>
    columnsOf(table).flatMap((column) => {
      const expected = expectedType(table, column);
      const actual = found.get(`${table}.${column}`);
      if (actual === undefined) return [`${table}.${column}: missing`];
      return actual === expected
        ? []
        : [`${table}.${column}: expected ${expected}, found ${actual}`];
    }),
  );
}

/** The schema drift of the restored database (driftOf). */
export async function schemaDrift(connection: Connection): Promise<string[]> {
  const [rows] = await connection.query(
    `select table_name as \`table\`, column_name as \`column\`, column_type as \`type\`
     from information_schema.columns where table_schema = database()`,
  );
  return driftOf(
    new Map(
      described
        .parse(rows)
        .map(({ table, column, type }) => [`${table}.${column}`, type]),
    ),
  );
}

/** Every table's rows, READ_COLUMNS only, in key order; and each table's row count. */
export async function readSportbet(connection: Connection): Promise<{
  readonly rows: SportbetRows;
  readonly inDump: ReadonlyMap<SportbetTable, number>;
}> {
  const select = async (table: SportbetTable): Promise<unknown[]> => {
    const [rows] = await connection.query(
      `select ${columnsOf(table).map(quoted).join(', ')} from ${quoted(table)} order by ${ORDER_BY[table]}`,
    );
    return z.array(z.unknown()).parse(rows);
  };
  const inDump = new Map<SportbetTable, number>();
  for (const table of SPORTBET_TABLES) {
    const [counted] = await connection.query(
      `select count(*) as \`rows\` from ${quoted(table)}`,
    );
    const [only] = z.array(z.object({ rows: z.int() })).parse(counted);
    inDump.set(table, only?.rows ?? 0);
  }
  return {
    rows: {
      tournaments: z
        .array(READ_COLUMNS.tournaments)
        .parse(await select('tournaments')),
      events: z.array(READ_COLUMNS.events).parse(await select('events')),
      teams: z.array(READ_COLUMNS.teams).parse(await select('teams')),
      games: z.array(READ_COLUMNS.games).parse(await select('games')),
      game_odds: z
        .array(READ_COLUMNS.game_odds)
        .parse(await select('game_odds')),
      users: z.array(READ_COLUMNS.users).parse(await select('users')),
      user_settings: z
        .array(READ_COLUMNS.user_settings)
        .parse(await select('user_settings')),
      leagues: z.array(READ_COLUMNS.leagues).parse(await select('leagues')),
      league_members: z
        .array(READ_COLUMNS.league_members)
        .parse(await select('league_members')),
      prediction_results: z
        .array(READ_COLUMNS.prediction_results)
        .parse(await select('prediction_results')),
      prediction_standings: z
        .array(READ_COLUMNS.prediction_standings)
        .parse(await select('prediction_standings')),
      prediction_survivals: z
        .array(READ_COLUMNS.prediction_survivals)
        .parse(await select('prediction_survivals')),
      point_results: z
        .array(READ_COLUMNS.point_results)
        .parse(await select('point_results')),
      point_standings: z
        .array(READ_COLUMNS.point_standings)
        .parse(await select('point_standings')),
      point_survivals: z
        .array(READ_COLUMNS.point_survivals)
        .parse(await select('point_survivals')),
    },
    inDump,
  };
}
```

- [ ] **Step 4: The run and the command**

Create `tools/migrate/src/run.ts`:

```ts
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@sportbet/db';
import { MIGRATIONS_FOLDER, runMigrations } from '@sportbet/db/migrations';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';
import {
  labelledContainers,
  MYSQL_IMAGE,
  MYSQL_VERSION,
  mysqlConnection,
  postgresUrl,
  removeLabelledContainers,
  restoreDump,
  startMySql,
  startPostgres,
} from './containers';
import { checkDump } from './dump';
import { backupAge, type BackupFetcher } from './fetch';
import { loadMapped, pointsRowCounts, recalculateLoaded } from './load';
import { mapSportbet } from './map';
import { emptyReport, exitStatusOf, type Report } from './report';
import { openSportbet, readSportbet, schemaDrift } from './sportbet-read';

/** Every temporary directory the reader makes starts so, under the OS temp directory. */
export const WORKSPACE_PREFIX = 'sportbet-migrate-';

export interface ReaderOptions {
  /** Where the dump comes from: the reader's one seam. */
  readonly fetcher: BackupFetcher;
  /** Keep the loaded Postgres running after the report (`--keep`). */
  readonly keep: boolean;
  readonly now: () => Date;
}

/** The Postgres a `--keep` run leaves running: no email or name in it. */
export interface KeptDatabase {
  readonly url: string;
  readonly containerId: string;
  /** Stops and removes it; resolves to the labelled containers left after. */
  readonly stop: () => Promise<string[]>;
}

export interface ReaderResult {
  readonly report: Report;
  readonly kept: KeptDatabase | null;
}

/** What a run has made so far, so a failure or an interrupt removes it all. */
export class RunResources {
  workspace: string | null = null;
  dump: string | null = null;
  mysql: StartedMySqlContainer | null = null;
  postgres: StartedPostgreSqlContainer | null = null;

  /** Deletes the dump and the temporary directory, and stops both containers. */
  async release({ keepPostgres = false } = {}): Promise<void> {
    if (this.dump !== null) rmSync(this.dump, { force: true });
    this.dump = null;
    if (this.workspace !== null) {
      rmSync(this.workspace, { recursive: true, force: true });
    }
    this.workspace = null;
    await this.mysql?.stop({ remove: true, removeVolumes: true });
    this.mysql = null;
    if (!keepPostgres) {
      await this.postgres?.stop({ remove: true, removeVolumes: true });
      this.postgres = null;
    }
  }
}

/** Deletes the temporary directories and labelled containers a crashed run left. */
async function removeLeftovers(): Promise<string[]> {
  const directories = readdirSync(tmpdir()).filter((name) =>
    name.startsWith(WORKSPACE_PREFIX),
  );
  for (const name of directories) {
    rmSync(join(tmpdir(), name), { recursive: true, force: true });
  }
  const containers = await removeLabelledContainers();
  return [
    `preflight removed ${String(directories.length)} leftover temporary directories and ${String(containers)} leftover containers`,
  ];
}

/** The first line of an error's message: never a row value (the reader's own messages name none). */
const describe = (error: unknown) =>
  error instanceof Error
    ? `${error.name}: ${error.message.split('\n')[0] ?? ''}`
    : 'an unknown error';

/**
 * The production-copy reader (spec 2.2): fetch the latest backup, check it,
 * restore it into a throwaway MySQL, check the schema, read READ_COLUMNS
 * only, map every value through the domain, load a throwaway Postgres
 * through the repositories, recalculate under both rule sets, report, and
 * delete the dump and both containers. It takes no database URL: its only
 * target is the Postgres container it starts itself.
 */
export async function runReader(
  options: ReaderOptions,
  resources: RunResources = new RunResources(),
): Promise<ReaderResult> {
  let report: Report = emptyReport();
  const cleanup: string[] = [];
  try {
    await getContainerRuntimeClient();
    cleanup.push(...(await removeLeftovers()));

    resources.workspace = mkdtempSync(join(tmpdir(), WORKSPACE_PREFIX));
    const fetched = await options.fetcher.fetch(resources.workspace);
    resources.dump = fetched.path;
    const facts = checkDump(readFileSync(fetched.path), MYSQL_VERSION);
    if (!facts.ok) {
      throw new Error(`the dump was refused: ${facts.refusal}`);
    }
    const age = backupAge(fetched.objectName, options.now());
    report = {
      ...report,
      dump: {
        object: fetched.objectName,
        bytes: facts.value.bytes,
        sha256: facts.value.sha256,
        ageHours: age.hours,
        stale: age.stale,
        engine: facts.value.engine,
        image: MYSQL_IMAGE,
      },
    };

    resources.mysql = await startMySql();
    const restored = await restoreDump(resources.mysql, fetched.path);
    rmSync(fetched.path, { force: true });
    resources.dump = null;
    if (!restored.ok) {
      throw new Error(`the dump did not load: ${restored.refusal}`);
    }
    const connection = await openSportbet(mysqlConnection(resources.mysql));
    let read: Awaited<ReturnType<typeof readSportbet>>;
    try {
      const drift = await schemaDrift(connection);
      if (drift.length > 0) {
        throw new Error(`sportbet's schema drifted: ${drift.join('; ')}`);
      }
      read = await readSportbet(connection);
    } finally {
      await connection.end();
    }
    await resources.mysql.stop({ remove: true, removeVolumes: true });
    resources.mysql = null;

    const mapped = mapSportbet(read.rows);
    report = {
      ...report,
      tables: mapped.tables.map((table) => ({
        ...table,
        inDump: read.inDump.get(table.table) ?? 0,
      })),
      notices: mapped.notices,
    };

    resources.postgres = await startPostgres();
    const url = postgresUrl(resources.postgres);
    await runMigrations(url, MIGRATIONS_FOLDER);
    const { db, close } = createDb(url);
    try {
      await loadMapped(db, mapped);
      const tournaments = mapped.tournaments.map(
        ({ tournament }) => tournament,
      );
      const recalculations = await recalculateLoaded(db, tournaments);
      report = {
        ...report,
        recalculations,
        points: await pointsRowCounts(db, tournaments),
      };
    } finally {
      await close();
    }
  } catch (error) {
    report = { ...report, problem: describe(error) };
  }

  const keep = options.keep && report.problem === null;
  try {
    await resources.release({ keepPostgres: keep });
  } catch (error) {
    report = { ...report, problem: report.problem ?? describe(error) };
  }
  const leftovers = await labelledContainers();
  const expected = keep && resources.postgres !== null ? 1 : 0;
  cleanup.push(
    keep
      ? 'the dump, its temporary directory and the MySQL container are deleted; the Postgres container is kept (--keep)'
      : 'the dump, its temporary directory and both containers are deleted',
  );
  if (leftovers.length !== expected) {
    report = {
      ...report,
      problem:
        report.problem ??
        `${String(leftovers.length - expected)} labelled container(s) remain after the run`,
    };
  }
  report = { ...report, cleanup };
  report = { ...report, exitStatus: exitStatusOf(report) };

  const postgres = keep ? resources.postgres : null;
  return {
    report,
    kept:
      postgres === null
        ? null
        : {
            url: postgresUrl(postgres),
            containerId: postgres.getId(),
            stop: async () => {
              await resources.release();
              return labelledContainers();
            },
          },
  };
}
```

Create `tools/migrate/src/bin/migrate.ts`:

```ts
// The production-copy reader, run by hand on the owner's PC:
//   pnpm --filter @sportbet/migrate --silent start [--keep] [--json]
// It takes no database URL and reads no DATABASE_URL: its only target is the
// Postgres container it starts itself (spec 2.2).
import { parseArgs } from 'node:util';
import { findOciCli, ociFetcher } from '../fetch';
import { renderReport } from '../report';
import { runReader, RunResources } from '../run';

const { values } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
  strict: true,
});

const resources = new RunResources();
const interrupted = (signal: NodeJS.Signals) => {
  process.stderr.write(
    `reader: ${signal}, deleting the dump and the containers\n`,
  );
  void resources.release().finally(() => process.exit(2));
};
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);

const cli = await findOciCli();
if (cli === undefined) {
  process.stderr.write(
    'reader: no OCI CLI found (OCI_CLI, oci on the PATH, or ~/bin/oci.exe)\n',
  );
  process.exit(2);
}

const { report, kept } = await runReader(
  { fetcher: ociFetcher(cli), keep: values.keep, now: () => new Date() },
  resources,
);
process.stdout.write(
  values.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report),
);

if (kept !== null) {
  process.removeAllListeners('SIGINT');
  process.stdout.write(
    `\nThe loaded Postgres is kept until you press Ctrl-C (ids, usernames, predictions and points; no email or name):\n${kept.url}\n`,
  );
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      resolve();
    });
  });
  const left = await kept.stop();
  process.stdout.write(
    left.length === 0
      ? 'cleanup the Postgres container is deleted\n'
      : `cleanup ${String(left.length)} labelled container(s) remain\n`,
  );
  process.exit(left.length === 0 ? report.exitStatus : 2);
}
process.exit(report.exitStatus);
```

Create `tools/migrate/build.mjs`:

```js
// Bundles the reader into one ESM file, as packages/db bundles its bins: the
// workspace packages export .ts sources, which Node cannot load on its own.
// The container tooling and the MySQL driver stay external (they are this
// package's own dependencies, loaded from its node_modules); db's migrations
// are copied beside dist/, where its bundled MIGRATIONS_FOLDER points.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/bin/migrate.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  external: ['testcontainers', '@testcontainers/*', 'mysql2', 'pg-native'],
  // pg is CommonJS and calls require(); an ESM bundle has to provide one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

rmSync('migrations', { recursive: true, force: true });
cpSync('../../packages/db/migrations', 'migrations', { recursive: true });
```

The package gains its `build` and `start` scripts.

Replace the contents of `tools/migrate/package.json` with:

```json
{
  "name": "@sportbet/migrate",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p .",
    "test": "vitest run",
    "build": "node build.mjs",
    "start": "node build.mjs && node dist/migrate.mjs"
  },
  "dependencies": {
    "@sportbet/db": "workspace:*",
    "@sportbet/domain": "workspace:*",
    "@testcontainers/mysql": "12.1.0",
    "@testcontainers/postgresql": "12.1.0",
    "mysql2": "3.24.5",
    "testcontainers": "12.1.0",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/node": "26.6.3",
    "esbuild": "0.28.2",
    "typescript": "6.0.3",
    "vitest": "5.0.2"
  }
}
```

- [ ] **Step 5: Run the tests and checks**

```bash
pnpm format && pnpm lint && pnpm typecheck
pnpm test:migrate 2>&1 | grep -E "Test Files|Tests "
docker ps -a -q --filter label=sportbet-migrate | wc -l
```

Expected: lint and typecheck clean; `Test Files  9 passed (9)` and `Tests  62 passed (62)` (the end-to-end test starts its own MySQL and Postgres and takes about 15 seconds after the images are pulled); and `0` labelled containers after the run.

- [ ] **Step 6: The bundle loads without fetching anything**

```bash
pnpm build 2>&1 | grep -E "build: Done|rror"
ls tools/migrate/dist tools/migrate/migrations
node tools/migrate/dist/migrate.mjs --no-such-flag 2>&1 | grep -o "ERR_PARSE_ARGS_UNKNOWN_OPTION" | head -1
git status --short
```

Expected: every package's `build: Done`; `migrate.mjs` in `dist/` and db's migrations copied beside it (`0000_init.sql`, `0001_tournament-season.sql`, `0002_core-schema.sql`, `meta`); `ERR_PARSE_ARGS_UNKNOWN_OPTION` - the bundle resolves every import and stops at the argument parser, before it looks for the OCI CLI; and `git status` lists only this task's files (`dist/` and `tools/migrate/migrations/` are ignored).

- [ ] **Step 7: Commit**

```bash
git add tools/migrate
git commit -m "$(cat <<'EOF'
feat(migrate): the production-copy reader - containers, restore, drift check, run, command (#9)

The end-to-end test runs it on a synthetic dump built from the golden
scenario only; it never fetches the production backup.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Record the rules

**Files:**
- Modify: `CLAUDE.md`, `docs/decisions.md`

- [ ] **Step 1: CLAUDE.md - the code rules**

In `CLAUDE.md`, replace:

```markdown
- `packages/domain` imports only `zod`; `packages/db` never imports web code;
  `apps/web` reaches the database only through `@sportbet/db`, and never its
  `/testing` entry outside tests. Lint enforces it, including relative paths.
- A difference between sportbet's rules and the owner's rulings goes in
  `RuleSet` (`packages/domain/src/rules/rule-set.ts`), nowhere else: one
```

with:

```markdown
- `packages/domain` imports only `zod`; `packages/db` never imports web code;
  `apps/web` reaches the database only through `@sportbet/db`, and never its
  `/testing` entry outside tests. `tools/migrate` (the production-copy
  reader) sits beside web: migrate -> db -> domain, and nothing imports
  migrate. Lint enforces it, including relative paths.
- A difference between sportbet's rules and the owner's rulings goes in
  `RuleSet` (`packages/domain/src/rules/rule-set.ts`), nowhere else: one
```

In `CLAUDE.md`, replace:

```markdown
- Invalid input to a domain factory or method is a typed refusal (a
  `Result`), never an exception; an impossible state throws.
- Pages only load data (parse params, call a query) and return one
  component; markup lives in components, which have component tests.
```

with:

```markdown
- Invalid input to a domain factory or method is a typed refusal (a
  `Result`), never an exception; an impossible state throws.
- Every points row (`game_odds`, `match_points`, `standings_points`,
  `survival_points`) carries its `points_source` - `production`, `sportbet`
  or `ruled` - named by the caller of every repository function, never
  defaulted, so a parity run can never overwrite or be read as the live
  `ruled` rows. Migrated rows keep sportbet's ids (saved with
  `overridingSystemValue`, then `advanceIdentitySequences`).
- Pages only load data (parse params, call a query) and return one
  component; markup lives in components, which have component tests.
```

In `CLAUDE.md`, replace:

```markdown
  optional max length, and its own accepted and refused examples; the Zod
  schema comes from it, a pattern with a quote is refused, and so is an
  example the schema disagrees with. Each area lists its CHECKs as
  `InvariantCheck`s beside its table (e.g. `tournamentInvariantChecks`) and
  builds the table's checks from that list with `invariantCheck`
```

with:

```markdown
  optional max length, and its own accepted and refused examples; the Zod
  schema comes from it, a pattern with a quote is refused, and so is an
  example the schema disagrees with. A rule on a whole number is a
  `defineRangeInvariant` beside it (e.g. `scoreSideInvariant`): a minimum,
  an optional maximum and its examples, rendered into the CHECK from
  validated integers; the domain's factories use its schema too. Each area lists its CHECKs as
  `InvariantCheck`s beside its table (e.g. `tournamentInvariantChecks`) and
  builds the table's checks from that list with `invariantCheck`
```

In `CLAUDE.md`, replace:

```markdown
  CI on real Postgres 18, before the deploy; E2E and smoke run again against
  staging after it. Write invisible characters in tests as escapes.
- Migrations: change `packages/db/src/**/schema.ts`, then
  `pnpm --filter @sportbet/db db:generate --name <what>`; review and commit the
```

with:

```markdown
  CI on real Postgres 18, before the deploy; E2E and smoke run again against
  staging after it. Write invisible characters in tests as escapes.
- The production-copy reader (`tools/migrate`) takes production data only
  from the latest nightly backup in the Oracle bucket, reads only
  `READ_COLUMNS` (`users`: `id` and `username`, never a name or email),
  loads only the throwaway Postgres it starts itself - it has no database
  URL option - and deletes the dump and both containers after every run. Its
  tests use only the synthetic dump built from the golden scenario; nothing
  of production goes to Vercel, Neon, GitHub, commits or logs.
- Migrations: change `packages/db/src/**/schema.ts`, then
  `pnpm --filter @sportbet/db db:generate --name <what>`; review and commit the
```

- [ ] **Step 2: decisions.md - what the core-schema spec settled**

In `docs/decisions.md`, replace:

```markdown
  Library, Testcontainers, Playwright (E2E). Database and feature tests run in
  CI against the same Postgres 18 image staging runs.
```

with:

```markdown
  Library, Testcontainers, Playwright (E2E). Database and feature tests run in
  CI against the same Postgres 18 image staging runs.

## Settled in the core-schema spec

Recorded in `docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`
(issue #9), where each choice carries its reason:

- **Ids:** every migrated entity keeps sportbet's id as its primary key
  (identity columns, saved with `overriding system value`, sequences moved
  past the loaded ids).
- **Points sources:** every derived row carries a `points_source`
  (`production`, `sportbet`, `ruled`) in its key, named by every caller.
- **The reader's tooling:** Testcontainers at runtime for its MySQL and
  Postgres, `mysql2` to read the restored copy, one esbuild bundle like
  `db`'s bins.
```

- [ ] **Step 3: Check and commit**

```bash
pnpm format:check 2>&1 | tail -1
git add CLAUDE.md docs/decisions.md
git commit -m "$(cat <<'EOF'
docs: the reader's layering and data rules, points sources, range invariants (#9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: `All matched files use Prettier code style!` (Prettier skips Markdown here), and the commit.

---

### Task 19: Verify everything, review, push, watch CI

- [ ] **Step 1: The whole check, as CI runs it**

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
git log --oneline 30545d1..HEAD | wc -l
```

Expected: `Done`; `All matched files use Prettier code style!`; lint silent and `4` packages typechecked; `3` packages built; unit `Test Files  29 passed (29)`, `Tests  512 passed (512)`; component `Test Files  4 passed (4)`, `Tests  5 passed (5)`; db `Test Files  10 passed (10)`, `Tests  198 passed (198)`; migrate `Test Files  9 passed (9)`, `Tests  62 passed (62)`; feature `Test Files  3 passed (3)`, `Tests  9 passed (9)`; `0` changed files; `18` commits since `30545d1`.

- [ ] **Step 2: Review.** Run the `mp-code-review` skill against `30545d1..HEAD` (Standards and Spec, the spec being `docs/superpowers/specs/2026-09-30-core-schema-and-reader-design.md`) and fix what it confirms, each fix its own commit ending with the same trailer and `#9`, re-running Step 1 after the last. Then run `improve-codebase-architecture` over `packages/db/src/` and `tools/migrate/src/` and present its report to the owner; act on no candidate unless the owner picks one.

- [ ] **Step 3: Push, and watch the run to the end**

```bash
git push origin main
sleep 10
run=$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run" --exit-status
```

Expected: the run succeeds: `check` (now with `pnpm test:migrate`, which pulls `mysql:26.7.0` on the GitHub-hosted runner and runs the reader on the synthetic dump only), `image`, `e2e`, `staging` (Neon's migration applies `0001_tournament-season`, which backfills staging's two seeded tournaments, then `0002_core-schema`) and `smoke`. If a job fails, read it with `gh run view "$run" --log-failed`, fix the cause, commit and push again; never re-run a failed job to make it pass.

- [ ] **Step 4: Report on #9.** Comment on #9 with: the green run's link; the test counts per suite; the golden master reproduced across the database and by the reader on the synthetic dump (and the ruled rows paying no places while the table is not marked final); the privacy checks the end-to-end test makes; the design decisions listed at the top of this plan; and the two owner questions below. Tick each acceptance criterion of #9 that now holds, with its evidence. Leave #9 open: it closes when the owner has run the reader once on the latest backup and read its report (Task 20), as the spec's "Done when" says.

---

### Task 20 (by hand, the owner): run the reader on the latest backup

Not part of this plan's execution and not part of CI: only the owner runs it, on the owner's PC, with the OCI CLI already authenticated for the `sportbet-db-backup` bucket (read access the owner holds). Nothing of what it reads leaves the PC.

- [ ] **Step 1: Before the run.** Docker Desktop is running; `oci os object list --bucket-name sportbet-db-backup --namespace axox7rtziknk --region eu-stockholm-1 --prefix sportbet-web/ --limit 1` answers. A tournament with no end date in the old admin loads with none and is not refused (the owner's answer to the first question, 2026-09-30).

- [ ] **Step 2: Run it.** From the repository root:

```text
pnpm --filter @sportbet/migrate --silent start
```

(`--json` prints the same report as one JSON object; `--keep` keeps the loaded Postgres running and prints its URL until Ctrl-C, for `\d players` or a `pg_dump` search for an `@`.) The reader downloads the latest daily backup into a private temporary directory, checks it, restores it into its own MySQL container, deletes the local file, reads `READ_COLUMNS` only, loads its own Postgres container, recalculates, prints the report and deletes the dump and both containers.

- [ ] **Step 3: Read the report.** Exit 0 means nothing was refused, 1 that something was (each refusal is listed by reason; a non-player row by its sportbet id), 2 that the run could not complete (the report says why). Every table's `read` equals `loaded` plus its skips and refusals.

- [ ] **Step 4: Check that nothing is left.**

```text
docker ps -a --filter label=sportbet-migrate
docker volume ls
dir %TEMP%\sportbet-migrate-*
git status
```

Expected: no container, no new volume, no `sportbet-migrate-*` directory, a clean working tree. The report's cleanup lines say the same, and the run fails if they are not true.

- [ ] **Step 5: Tell #9 it ran.** Note on #9 only that the run completed and its exit status; the report itself stays on the PC (spec 2.2: nothing of the production data goes to GitHub). Then #9 can close.

---

## Owner answers (2026-09-30, 2026-10-01)

1. **The season's end date** (the spec's first answer). The question: sportbet's `end_date` is optional, and the reader refused a tournament without one (`tournament-without-end-date`) and every row of it. The owner's answer: a Euroleague tournament's end date cannot be known when it starts (it depends on the playoff schedule and the number of rounds), so it may have none and the reader must not refuse it. The rule is the owner's (2026-10-01): a tournament with no end date stays open, not finished and not frozen, until an admin sets its date. sportbet finishes a tournament by date only when `end_date` is set (`Tournament::effectiveStatus`; it also finishes one by its status or once every game is scored, which R-21 overrides). Done after the plan ran: `Tournament.endsOn` and `Season.endsAt` are nullable, a season with none is not finished (R-21) nor frozen (R-22, LR-6), `sportbetColumns` reads `end_date: null` as none, and migration `0005_tournament-end-date-optional` drops `ends_on`'s `NOT NULL` (0001, on staging, is unchanged). The tasks above keep the text they ran with.
2. **Whether production's standings table is final.** The owner's answer: by an admin's act in the new app, so the load keeps `standings_table_final` false and no code changes. The question as it was asked: sportbet does not record it, so the reader loads `standings_table_final` false, as the spec says. Under R-14 the ruled set then pays no table position until the final table is entered: the `ruled` rows the reader derives have every place unscored (the synthetic run shows exactly this for the golden scenario's four exact places). Parity (`sportbet` against `production`) is unaffected. At switch-over, is the table final by an admin's act in the new app, or should the load mark it final once every regular-season game (rounds 1-38) has a result? No rule states which; this plan invents none.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| sportbet's ids kept as primary keys; `generated always` identities, `overridingSystemValue`, sequences moved past the loaded ids | 7, 8 (`advanceIdentitySequences`), 11, 16 |
| `points_source` (`production`, `sportbet`, `ruled`) in every derived table's key, built from `RULE_SET_NAMES`; every repository call names its source | 3, 7, 11 |
| Enums `format`, `stage`, `prediction_origin`, `points_source` from domain constants, each tested against its constant | 3, 7 |
| Numbers: `numeric(8,2)` points and odds, `numeric(10,4)` standings; `decimalUnits` refusing extra places; no float in or out | 3, 7, 8, 11 |
| `tournaments` gains `ends_on`, `standings_deadline_round`, `survival`, `standings_table_final`; staging's seeded rows backfilled | 4 |
| `rounds`, `teams`, `team_outcomes`, `games`, `players`, `tournament_players`, `match_predictions`, `standings_predictions`, `survival_picks`, `game_odds`, `match_points`, `standings_points`, `survival_points` with the spec's columns, keys, composite tournament keys and stored shapes | 7 |
| `defineRangeInvariant`, rendered by `invariantCheck`, proven by `describeInvariantCheck` on `smallint`, `integer` and `numeric`; the factories read the invariants' schemas with unchanged refusals | 1, 2, 4, 7 |
| `INVARIANT_CHECKS` plus `NON_INVARIANT_CHECKS` equal the database's CHECKs; each cross-column CHECK accepted and refused by name | 7 |
| Repositories per area, parsing rows with Zod and refusing through the stored factories by table, key and refusal; every function takes the Db or a transaction | 8, 9, 10, 11 |
| `loadTournamentInputs` with explicit `reads`, one read transaction; `saveTournamentPoints` replacing one source; `PointsRows` and `StoredMatchRow` | 3, 11, 12 |
| `runMigrations`, `MIGRATIONS_FOLDER`, `POSTGRES_IMAGE` available at runtime without `@sportbet/db/testing` | 12 (`@sportbet/db/migrations`) |
| The golden scenario and `golden-points.json`'s entries in `@sportbet/domain/testing`; the golden master across the database under both rule sets | 6, 12 |
| `tools/migrate` package and layering (migrate -> db -> domain; nothing imports migrate); esbuild bundle; `start` runs it | 13, 17 |
| Preflight (Docker, OCI CLI, leftovers); fetch of the latest daily backup; 26-hour warning; gzip, marker and engine checks | 14, 17 |
| Restore into `mysql:26.7.0` on tmpfs, random password, loopback, labelled; a load failure reported as exit code and line only | 17 |
| Schema drift check against sportbet's types at `0da316f` | 13 (`READ_COLUMNS` types), 17 (`driftOf`) |
| `READ_COLUMNS` the only place sportbet columns are named; `users` read as `id` and `username` only; forbidden tables never read | 13 |
| The map: every value through `sportbetColumns` and a stored factory; scope skips, stages, odds duplicates, every refusal and `depends-on-refused`; reconciliation per table | 5, 15 |
| Load in one transaction through the repositories; recalculate under both rule sets, refusals reported; row counts per source | 16 |
| The report (dump facts, per-table counts, ids only for non-player rows, points per source, recalculation refusals, cleanup, exit 0/1/2); `--json`; never written to a file | 16, 17 |
| Cleanup in `finally` and on SIGINT/SIGTERM; labelled-container check; `--keep` keeps only the Postgres | 17 |
| Idempotent load; deterministic order | 16 (`load.test.ts`), 13 (`ORDER_BY`) |
| Reader unit tests: map quirks, latest-object choice and the 26-hour warning, dump checks, `READ_COLUMNS`, error scrubbing | 13, 14, 15, 17 |
| End to end on a synthetic dump only (golden scenario, a football tournament, equal and differing duplicate odds, a blank odds row, an orphan prediction, a `generated` of '2', seeded slots, a user in no tournament, sentinel personal data); counts, loaded rows, production and sportbet rows equal to `golden-points.json`, ruled rows, exit 1, nothing left behind | 15, 17 |
| No sentinel in stdout, stderr, the JSON report or a `pg_dump` of the Postgres; `players` has exactly `id` and `username` | 17 |
| CI runs `pnpm test:migrate`; CI never reaches Oracle | 13, 19 |
| `.gitignore` gains `*.sql`, `*.sql.gz`, `sportbet-migrate-*` | 13 |
| `CLAUDE.md` and `docs/decisions.md` records | 18 |
| The owner runs the reader once on the latest backup | 20 (by hand) |

Where the plan departs from the spec's letter, the reason is in "Design decisions this plan makes" above: two migrations; the `@sportbet/db/migrations` entry; no `games_recorded_winner_fk`; non-overlapping survival CHECKs; the dump streamed into the container's client instead of copied onto its tmpfs; loopback binding by a Testcontainers subclass; and the ruled rows paying no places while the table is not marked final.
