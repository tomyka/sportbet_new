# Slice 9: standings predictions - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the team runs it (`docs/agent-team.md`): backend-dev takes tasks 1-7, web-dev 8-13, qa and architect review each, only the lead commits.

**Goal:** `/prediction/standings` - the Euroleague ladder a player orders, ticks and saves, with its row autosave and reorder at sportbet's URLs (#23).

**Architecture:** The domain decides every save (`standingsFormEntry`, `reorderFormEntry`, `predictStandingsRow`, `reorderStandings`) and what the page shows (`standingsLadder`). `packages/db` writes only through `saveStandingsRow` / `saveStandingsOrder`, each one transaction that seeds the player's missing rows, locks them by team and judges the deadline under the lock. `apps/web` has one page and two JSON route handlers; the ladder is a client component posting through one ordered queue.

**Tech Stack:** TypeScript, Zod, Drizzle on Postgres 18, Next.js App Router, React, Vitest (unit, db, component, feature), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-standings-predictions-design.md`. Rulings R-78, R-79, R-80.

## Decisions taken while planning (refine the spec; record them in it in Task 13)

1. **The tournament is the posted team's**, never the request's (sportbet issue 255): the row save takes the team's tournament; the reorder the tournament of its first team. A player who is not one of that tournament's players, or a team that is not stored, is "not yours".
2. **The table's upper bound is checked by `predictStandingsRow`**, first, as a field error on `groupPosition` (sportbet's `max:positionMax` needs the table): the form (`standingsFormEntry`) checks shape only, so the save stays one transaction.
3. **Field messages are Lithuanian and ours.** sportbet's field rules answer with Laravel's English defaults, which its page never shows; decision 13 wants Lithuanian. Texts in Task 8.
4. **The navigation label is sportbet's "Eiga"** (rail and tabs; `bi-table`), not "Eigos spėjimai" as the spec says; its badge label "Pateikti ne visi eigos spėjimai." exists already.
5. **One save queue on the page.** Every post (reorder or row) waits for the one before it; a tick first sends a waiting reorder. A row posts its place as last saved, so a row save can never race a reorder into "Ši vieta jau užimta kitos komandos.".
6. **E2E covers the open page only.** The staging seed's tournament has no round-5 game, so it never closes; the closed page is covered by the feature tests (Task 10).

## File structure

| File | Responsibility |
| --- | --- |
| `packages/domain/src/shared/laravel-integer.ts` (create) | Laravel's `integer` on a text, shared by the two forms |
| `packages/domain/src/prediction/prediction-form.ts` (modify) | uses the shared reader |
| `packages/domain/src/standings/standings-form.ts` (create) | `standingsFormEntry`, `reorderFormEntry` |
| `packages/domain/src/standings/predict-row.ts` (create) | `predictStandingsRow` |
| `packages/domain/src/standings/reorder.ts` (create) | `reorderStandings` |
| `packages/domain/src/standings/ladder.ts` (create) | `standingsLadder`, `StandingsPage` |
| `packages/domain/src/standings/save-throttle.ts` (create) | `standingsSaveLimits` |
| `packages/domain/src/index.ts` (modify) | exports |
| `packages/db/src/standings/page.ts` (create) | `loadStandingsPage` |
| `packages/db/src/standings/save.ts` (create) | `saveStandingsRow`, `saveStandingsOrder` |
| `packages/db/src/index.ts` (modify) | exports |
| `packages/db/test/standings-save.test.ts`, `standings-page.test.ts` (create) | db tests |
| `apps/web/src/components/standings/standings-protocol.ts` (create) | wire format, both routes |
| `apps/web/src/components/standings/standings-answer.ts` (create) | reading answers, posting |
| `apps/web/src/server/standings/save-standings.ts`, `texts.ts` (create) | the two use cases |
| `apps/web/src/app/prediction/standings/route.ts`, `reorder/route.ts`, `page.tsx` (create) | handlers and page (see Task 9 for the path clash) |
| `apps/web/src/components/standings/ticks.ts`, `ladder-moves.ts`, `save-queue.ts` (create) | pure client logic |
| `apps/web/src/components/standings/standings-view.tsx`, `ladder.tsx` (create) | markup |
| `apps/web/src/components/shell/{shell-paths,nav-entries,icon}.ts(x)`, `server/sign-in/guarded-pages.ts` (modify) | path, entry, icon, return |
| `apps/web/tests/feature/standings.test.ts` (create) | routes and page |
| `apps/web/e2e/standings.spec.ts` (create) | the journey |
| `CLAUDE.md`, the spec (modify) | the write path, lock order, decisions above |

Run commands from the repo root. Domain tests: `pnpm --filter @sportbet/domain test -- <file>`; db: `pnpm --filter @sportbet/db test -- <file>` (needs Docker); component: `pnpm --filter @sportbet/web test:component -- <file>`; feature: `pnpm --filter @sportbet/web test:feature -- <file>` (builds the app); e2e: `pnpm test:e2e`.

---

### Task 1: Laravel's `integer`, shared

**Files:**
- Create: `packages/domain/src/shared/laravel-integer.ts`, `packages/domain/src/shared/laravel-integer.test.ts`
- Modify: `packages/domain/src/prediction/prediction-form.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/shared/laravel-integer.test.ts
import { describe, expect, it } from 'vitest';
import { laravelInteger } from './laravel-integer';

describe("laravelInteger (Laravel's `integer`, FILTER_VALIDATE_INT)", () => {
  it.each([
    ['0', 0],
    ['1', 1],
    ['+1', 1],
    ['-3', -3],
    ['20', 20],
  ])('%s is %d', (text, value) => {
    expect(laravelInteger(text)).toBe(value);
  });

  it.each(['', '01', '1.0', '1e1', ' 1', 'x', '99999999999999999999'])(
    '%j is not one',
    (text) => {
      expect(laravelInteger(text)).toBeNull();
    },
  );
});
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './laravel-integer'`)

Run: `pnpm --filter @sportbet/domain test -- src/shared/laravel-integer.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/shared/laravel-integer.ts
/** Laravel's `integer` (FILTER_VALIDATE_INT): an optional sign, no leading zero. */
const LARAVEL_INTEGER = /^[+-]?(?:0|[1-9]\d*)$/u;

/**
 * A posted field as Laravel's `integer` reads it, once TrimStrings has run:
 * the whole number, or null when it is not one (or not a safe integer).
 */
export function laravelInteger(text: string): number | null {
  if (!LARAVEL_INTEGER.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}
```

In `prediction-form.ts` delete the `LARAVEL_INTEGER` constant and rewrite `sideOf`:

```ts
import { laravelInteger } from '../shared/laravel-integer';

/** One trimmed field: blank, a score in range, or refused. */
function sideOf(text: string): number | null | 'refused' {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value !== null && value >= PREDICTION_MIN && value <= PREDICTION_MAX
    ? value
    : 'refused';
}
```

- [ ] **Step 4: Run both tests, expect PASS**

Run: `pnpm --filter @sportbet/domain test -- src/shared/laravel-integer.test.ts src/prediction/prediction-form.test.ts`

- [ ] **Step 5: Commit** - `refactor(domain): Laravel's integer read once, for every posted form (#23)`

---

### Task 2: The two forms

**Files:**
- Create: `packages/domain/src/standings/standings-form.ts`, `standings-form.test.ts`

The row form is UpdatePredictionStandingRequest's `rules()` without the place's upper bound (decision 2): `teamID` required and whole (`idFromText`), `groupPosition` blank or a whole number from 1, `quarterfinal` / `semifinal` blank, 0 or 1, `final` blank, 1 or 2. Every failing field is listed, in that order. The reorder form is ReorderPredictionStandingsRequest: `order` at least one id, each an id, all distinct.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/standings/standings-form.test.ts
import { describe, expect, it } from 'vitest';
import { reorderFormEntry, standingsFormEntry } from './standings-form';

const row = (fields: Partial<Record<'team' | 'place' | 'playOffs' | 'finalFour' | 'finalPlace', string>>) =>
  standingsFormEntry({
    team: '11',
    place: '',
    playOffs: '',
    finalFour: '',
    finalPlace: '',
    ...fields,
  });

describe('standingsFormEntry (UpdatePredictionStandingRequest::rules)', () => {
  it('a blank row: the team, everything else null (never saved)', () => {
    expect(row({})).toEqual({
      ok: true,
      value: { team: 11, place: null, playOffs: null, finalFour: null, finalPlace: null },
    });
  });

  it('a full row: the place, both ticks as posted, the final place', () => {
    expect(row({ place: '3', playOffs: '1', finalFour: '0', finalPlace: '2' })).toEqual({
      ok: true,
      value: { team: 11, place: 3, playOffs: true, finalFour: false, finalPlace: 2 },
    });
  });

  it('teamID is required and an id', () => {
    expect(row({ team: '' })).toEqual({ ok: false, errors: [{ field: 'team', problem: 'not-an-id' }] });
    expect(row({ team: '0' })).toEqual({ ok: false, errors: [{ field: 'team', problem: 'not-an-id' }] });
  });

  it('a place from 1; a tick 0 or 1; a final place 1 or 2', () => {
    expect(row({ place: '0' })).toEqual({ ok: false, errors: [{ field: 'place', problem: 'bad-place' }] });
    expect(row({ playOffs: '2' })).toEqual({ ok: false, errors: [{ field: 'playOffs', problem: 'bad-tick' }] });
    expect(row({ finalFour: 'on' })).toEqual({ ok: false, errors: [{ field: 'finalFour', problem: 'bad-tick' }] });
    expect(row({ finalPlace: '3' })).toEqual({ ok: false, errors: [{ field: 'finalPlace', problem: 'bad-final-place' }] });
  });

  it("every failing field, in the rules' order", () => {
    expect(row({ team: 'x', finalPlace: '0', place: '-1', playOffs: '01' })).toEqual({
      ok: false,
      errors: [
        { field: 'team', problem: 'not-an-id' },
        { field: 'place', problem: 'bad-place' },
        { field: 'playOffs', problem: 'bad-tick' },
        { field: 'finalPlace', problem: 'bad-final-place' },
      ],
    });
  });
});

describe('reorderFormEntry (ReorderPredictionStandingsRequest)', () => {
  it('the ids in posted order', () => {
    expect(reorderFormEntry(['12', '11'])).toEqual({ ok: true, value: [12, 11] });
  });

  it('none, one not an id, or one twice: refused', () => {
    expect(reorderFormEntry([])).toEqual({ ok: false, problem: 'empty' });
    expect(reorderFormEntry(['11', 'x'])).toEqual({ ok: false, problem: 'not-an-id' });
    expect(reorderFormEntry(['11', '11'])).toEqual({ ok: false, problem: 'repeated' });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (module missing)

Run: `pnpm --filter @sportbet/domain test -- src/standings/standings-form.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/standings/standings-form.ts
import { idFromText } from '../shared/ids';
import { laravelInteger } from '../shared/laravel-integer';
import type { FinalPlace } from './standings-prediction';

/** A posted row field: teamID, groupPosition, quarterfinal, semifinal, final. */
export type StandingsField = 'team' | 'place' | 'playOffs' | 'finalFour' | 'finalPlace';

export type StandingsFieldProblem =
  | 'not-an-id'
  | 'bad-place'
  | 'bad-tick'
  | 'bad-final-place'
  | 'beyond-table';

export interface StandingsFieldError {
  readonly field: StandingsField;
  readonly problem: StandingsFieldProblem;
}

/** A row as the form passed it; null is a field posted blank. */
export interface StandingsRowEntry {
  readonly team: number;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: Exclude<FinalPlace, 3 | 4> | null;
}

export type StandingsFormCheck =
  | { readonly ok: true; readonly value: StandingsRowEntry }
  | { readonly ok: false; readonly errors: readonly StandingsFieldError[] };

const tickOf = (text: string): boolean | null | 'refused' => {
  if (text === '') return null;
  const value = laravelInteger(text);
  return value === 0 ? false : value === 1 ? true : 'refused';
};

/**
 * UpdatePredictionStandingRequest::rules() on the trimmed fields, in its
 * order, every failing field listed (Laravel reports each). The place's
 * upper bound - the table's size - is predictStandingsRow's first check,
 * since it needs the team's tournament.
 */
export function standingsFormEntry(fields: Readonly<Record<StandingsField, string>>): StandingsFormCheck {
  const errors: StandingsFieldError[] = [];
  const team = idFromText(fields.team);
  if (!team.ok) errors.push({ field: 'team', problem: 'not-an-id' });
  const placeValue = fields.place === '' ? null : laravelInteger(fields.place);
  if (fields.place !== '' && (placeValue === null || placeValue < 1)) {
    errors.push({ field: 'place', problem: 'bad-place' });
  }
  const playOffs = tickOf(fields.playOffs);
  if (playOffs === 'refused') errors.push({ field: 'playOffs', problem: 'bad-tick' });
  const finalFour = tickOf(fields.finalFour);
  if (finalFour === 'refused') errors.push({ field: 'finalFour', problem: 'bad-tick' });
  const finalValue = fields.finalPlace === '' ? null : laravelInteger(fields.finalPlace);
  const finalPlace = finalValue === 1 || finalValue === 2 ? finalValue : null;
  if (fields.finalPlace !== '' && finalPlace === null) {
    errors.push({ field: 'finalPlace', problem: 'bad-final-place' });
  }
  if (!team.ok || errors.length > 0 || playOffs === 'refused' || finalFour === 'refused') {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { team: team.value, place: placeValue, playOffs, finalFour, finalPlace },
  };
}

export type ReorderFormCheck =
  | { readonly ok: true; readonly value: readonly number[] }
  | { readonly ok: false; readonly problem: 'empty' | 'not-an-id' | 'repeated' };

/** ReorderPredictionStandingsRequest: `order` required, at least one, each an id, distinct. */
export function reorderFormEntry(order: readonly string[]): ReorderFormCheck {
  if (order.length === 0) return { ok: false, problem: 'empty' };
  const ids: number[] = [];
  for (const text of order) {
    const id = idFromText(text);
    if (!id.ok) return { ok: false, problem: 'not-an-id' };
    ids.push(id.value);
  }
  if (new Set(ids).size !== ids.length) return { ok: false, problem: 'repeated' };
  return { ok: true, value: ids };
}
```

- [ ] **Step 4: Run it, expect PASS**
- [ ] **Step 5: Commit** - `feat(domain): standingsFormEntry and reorderFormEntry - sportbet's standings forms (#23)`

---

### Task 3: `predictStandingsRow`

**Files:**
- Create: `packages/domain/src/standings/predict-row.ts`, `predict-row.test.ts`

Refusals, in order: `not-yours` (no target: the team is not stored or the player is not one of its tournament's), `beyond-table` (place > the table's teams), `place-taken`, `play-offs-full`, `final-four-full`, `final-place-taken`, `final-four-without-play-offs` (R-78), `final-place-without-final-four` (R-78), `closed` (deadline reached: `deadline !== null && now >= deadline`). Conflicts compare with the player's other rows in the tournament only. Unticking or a blank is never a conflict. Accepted: the `TeamPick` to store, exactly as posted.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/standings/predict-row.test.ts
import { describe, expect, it } from 'vitest';
import { at, team } from '../testing';
import { predictStandingsRow } from './predict-row';
import type { TeamPick } from './standings-prediction';

const TEAMS = Array.from({ length: 20 }, (_, index) => team(String(index + 1)));
const ZAL = team('1');
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');

const pick = (index: number, over: Partial<TeamPick> = {}): TeamPick => ({
  team: TEAMS[index] ?? ZAL,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

const decide = (
  entry: Partial<Omit<TeamPick, 'team'>>,
  rows: readonly TeamPick[] = [],
  now = NOW,
) =>
  predictStandingsRow({
    entry: { team: ZAL, place: null, playOffs: null, finalFour: null, finalPlace: null, ...entry },
    target: { teams: TEAMS, rows },
    now,
    deadline: DEADLINE,
  });

const refusalOf = (result: ReturnType<typeof decide>) => (result.ok ? null : result.refusal);

describe('predictStandingsRow (updatePredictionStandingsUser)', () => {
  it('accepted: the row as posted', () => {
    expect(decide({ place: 3, playOffs: true, finalFour: false })).toEqual({
      ok: true,
      value: { team: ZAL, place: 3, playOffs: true, finalFour: false, finalPlace: null },
    });
  });

  it('standings: a team not of the tournament, or a player not in it, is not yours', () => {
    expect(
      refusalOf(
        predictStandingsRow({
          entry: pick(0),
          target: null,
          now: NOW,
          deadline: DEADLINE,
        }),
      ),
    ).toBe('not-yours');
  });

  it('standings: a place beyond the table is refused (max:positionMax)', () => {
    expect(refusalOf(decide({ place: 21 }))).toBe('beyond-table');
    expect(decide({ place: 20 }).ok).toBe(true);
  });

  it('standings: a place another team holds is taken; the row\'s own old place is not', () => {
    expect(refusalOf(decide({ place: 3 }, [pick(1, { place: 3 })]))).toBe('place-taken');
    expect(decide({ place: 3 }, [pick(0, { place: 3 })]).ok).toBe(true);
  });

  it('standings: a ninth play-off tick, a fifth Final Four tick are refused; unticking never', () => {
    const eight = TEAMS.slice(1, 9).map((_, index) => pick(index + 1, { playOffs: true }));
    expect(refusalOf(decide({ playOffs: true }, eight))).toBe('play-offs-full');
    expect(decide({ playOffs: false }, eight).ok).toBe(true);
    const four = TEAMS.slice(1, 5).map((_, index) => pick(index + 1, { playOffs: true, finalFour: true }));
    expect(refusalOf(decide({ playOffs: true, finalFour: true }, four))).toBe('final-four-full');
  });

  it('standings: a final place another team holds is taken', () => {
    expect(
      refusalOf(decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [pick(1, { finalPlace: 1 })])),
    ).toBe('final-place-taken');
  });

  it('standings (R-78): a Final Four tick needs a play-off tick', () => {
    expect(refusalOf(decide({ finalFour: true }))).toBe('final-four-without-play-offs');
    expect(refusalOf(decide({ playOffs: false, finalFour: true }))).toBe('final-four-without-play-offs');
  });

  it('standings (R-78): a final place needs a Final Four tick', () => {
    expect(refusalOf(decide({ playOffs: true, finalPlace: 2 }))).toBe('final-place-without-final-four');
    expect(decide({ playOffs: true, finalFour: true, finalPlace: 2 }).ok).toBe(true);
  });

  it('standings deadline: open until the deadline instant, closed at it (ST-2)', () => {
    expect(decide({ place: 1 }, [], at('2026-10-21T16:59:59Z')).ok).toBe(true);
    expect(refusalOf(decide({ place: 1 }, [], DEADLINE))).toBe('closed');
  });

  it('standings deadline: none means never closed', () => {
    expect(
      predictStandingsRow({ entry: pick(0, { place: 1 }), target: { teams: TEAMS, rows: [] }, now: NOW, deadline: null }).ok,
    ).toBe(true);
  });

  it("refusals in sportbet's order: the conflicts before the chain, the deadline last", () => {
    const after = at('2026-10-22T00:00:00Z');
    expect(refusalOf(decide({ place: 3, finalFour: true }, [pick(1, { place: 3 })], after))).toBe('place-taken');
    expect(refusalOf(decide({ finalFour: true }, [], after))).toBe('final-four-without-play-offs');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @sportbet/domain test -- src/standings/predict-row.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/domain/src/standings/predict-row.ts
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import { STANDINGS_COUNTS, type StandingsStage, type TeamPick } from './standings-prediction';

export type StandingsRowRefusal =
  | 'not-yours'
  | 'beyond-table'
  | 'place-taken'
  | 'play-offs-full'
  | 'final-four-full'
  | 'final-place-taken'
  | 'final-four-without-play-offs'
  | 'final-place-without-final-four'
  | 'closed';

/** The tournament a row is saved in: its teams and the player's rows there. */
export interface StandingsTarget {
  readonly teams: readonly TeamId[];
  readonly rows: readonly TeamPick[];
}

/** Whether standings are closed at `now` (ST-2): from the deadline instant on; none never closes. */
export const standingsClosedAt = (now: Instant, deadline: Instant | null): boolean =>
  deadline !== null && now >= deadline;

/**
 * updatePredictionStandingsUser once the form has passed: the table's
 * size (the rules' max), StandingsRules::rowConflicts against the player's
 * other rows in the tournament (the Euroleague format enforces them), the
 * stage chain (R-78), then the deadline, re-read for this save (ST-2).
 * Accepted: the row to store, as posted - a blank place or final place
 * null, a posted tick as posted, a tick not posted null.
 */
export function predictStandingsRow(input: {
  readonly entry: TeamPick;
  readonly target: StandingsTarget | null;
  readonly now: Instant;
  readonly deadline: Instant | null;
}): Result<TeamPick, StandingsRowRefusal> {
  const { entry, target, now, deadline } = input;
  if (target === null || !target.teams.includes(entry.team)) return refuse('not-yours');
  if (entry.place !== null && entry.place > target.teams.length) return refuse('beyond-table');
  const others = target.rows.filter((row) => row.team !== entry.team);
  if (entry.place !== null && others.some((row) => row.place === entry.place)) {
    return refuse('place-taken');
  }
  const full = (stage: StandingsStage, count: number) =>
    entry[stage] === true && others.filter((row) => row[stage] === true).length >= count;
  if (full('playOffs', STANDINGS_COUNTS.playOffs)) return refuse('play-offs-full');
  if (full('finalFour', STANDINGS_COUNTS.finalFour)) return refuse('final-four-full');
  if (entry.finalPlace !== null && others.some((row) => row.finalPlace === entry.finalPlace)) {
    return refuse('final-place-taken');
  }
  if (entry.finalFour === true && entry.playOffs !== true) {
    return refuse('final-four-without-play-offs');
  }
  if (entry.finalPlace !== null && entry.finalFour !== true) {
    return refuse('final-place-without-final-four');
  }
  if (standingsClosedAt(now, deadline)) return refuse('closed');
  return ok(entry);
}
```

R-78 holds under both rule sets because `predictStandingsRow` takes no `RuleSet`: the spec's "the chain under both rule sets" is the signature itself, so no `sportbetRules` / `ruledRules` case is needed.

- [ ] **Step 4: Run it, expect PASS**
- [ ] **Step 5: Commit** - `feat(domain): predictStandingsRow - sportbet's conflicts, the stage chain (R-78), the deadline (#23)`

---

### Task 4: `reorderStandings`

**Files:**
- Create: `packages/domain/src/standings/reorder.ts`, `reorder.test.ts`

Order of checks as reorderPredictionStandingsUser: `not-yours` (no target), `closed`, then `mismatch` (StandingsReorder::accepts: every posted team one of the tournament's, every team named once - the form has refused repeats already, but a repeat is a mismatch here too).

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/standings/reorder.test.ts
import { describe, expect, it } from 'vitest';
import { at, team } from '../testing';
import { reorderStandings } from './reorder';

const [A, B, C, X] = [team('1'), team('2'), team('3'), team('9')];
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');
const reorder = (order: readonly typeof A[], now = NOW) =>
  reorderStandings({ order, target: { teams: [A, B, C] }, now, deadline: DEADLINE });

describe('reorderStandings (reorderPredictionStandingsUser)', () => {
  it('each team its place in posted order, and nothing else', () => {
    expect(reorder([C, A, B])).toEqual({
      ok: true,
      value: [
        { team: C, place: 1 },
        { team: A, place: 2 },
        { team: B, place: 3 },
      ],
    });
  });

  it('an unknown, a missing or a repeated team is a mismatch', () => {
    for (const order of [[A, B, X], [A, B], [A, B, B]]) {
      expect(reorder(order)).toEqual({ ok: false, refusal: 'mismatch' });
    }
  });

  it('closed from the deadline, before the order is judged', () => {
    expect(reorder([A, B], DEADLINE)).toEqual({ ok: false, refusal: 'closed' });
  });

  it('no target: not yours', () => {
    expect(reorderStandings({ order: [A], target: null, now: NOW, deadline: null })).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
  });
});
```

(If `Result`'s refusal key is not `refusal`, match `packages/domain/src/shared/result.ts`.)

- [ ] **Step 2: Run it, expect FAIL**
- [ ] **Step 3: Implement**

```ts
// packages/domain/src/standings/reorder.ts
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import { standingsClosedAt } from './predict-row';

export type ReorderRefusal = 'not-yours' | 'closed' | 'mismatch';

export interface PlacedTeam {
  readonly team: TeamId;
  readonly place: number;
}

/**
 * reorderPredictionStandingsUser: the whole table in its new order. Closed
 * from the deadline (ST-2); the order must name every team of the
 * tournament once (StandingsReorder::accepts). Accepted: each team's place,
 * 1.. in posted order - only places: ticks and final places are untouched.
 */
export function reorderStandings(input: {
  readonly order: readonly TeamId[];
  readonly target: { readonly teams: readonly TeamId[] } | null;
  readonly now: Instant;
  readonly deadline: Instant | null;
}): Result<readonly PlacedTeam[], ReorderRefusal> {
  const { order, target, now, deadline } = input;
  if (target === null) return refuse('not-yours');
  if (standingsClosedAt(now, deadline)) return refuse('closed');
  const named = new Set(order);
  if (
    named.size !== order.length ||
    order.length !== target.teams.length ||
    !target.teams.every((team) => named.has(team))
  ) {
    return refuse('mismatch');
  }
  return ok(order.map((team, index) => ({ team, place: index + 1 })));
}
```

- [ ] **Step 4: Run it, expect PASS**
- [ ] **Step 5: Commit** - `feat(domain): reorderStandings - the whole table, places only (#23)`

---

### Task 5: `standingsLadder` and `standingsSaveLimits`

**Files:**
- Create: `packages/domain/src/standings/ladder.ts`, `ladder.test.ts`, `save-throttle.ts`, `save-throttle.test.ts`
- Modify: `packages/domain/src/index.ts`

The page's rows in sportbet's order (saved place ascending; unplaced last; ties by name, `localeCompare(…, 'lt')`), the counters, whether any place is saved (R-79), and the deadline line (R-80).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/domain/src/standings/ladder.test.ts
import { describe, expect, it } from 'vitest';
import { at, team } from '../testing';
import { standingsLadder } from './ladder';

const ZAL = team('1');
const OLY = team('2');
const REA = team('3');
const TEAMS = [
  { id: ZAL, name: 'Zalgiris' },
  { id: OLY, name: 'Olympiacos' },
  { id: REA, name: 'Real' },
];
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');
const blank = { playOffs: null, finalFour: null, finalPlace: null };

describe('standingsLadder (standings.blade.php)', () => {
  it('saved places first, then unplaced teams by name', () => {
    const ladder = standingsLadder({
      teams: TEAMS,
      rows: [{ team: REA, place: 1, ...blank }],
      now: NOW,
      deadline: DEADLINE,
    });
    expect(ladder.rows.map((row) => row.name)).toEqual(['Real', 'Olympiacos', 'Zalgiris']);
  });

  it('a team with no row is shown blank', () => {
    const ladder = standingsLadder({ teams: TEAMS, rows: [], now: NOW, deadline: DEADLINE });
    expect(ladder.rows[0]).toEqual({ team: OLY, name: 'Olympiacos', place: null, ...blank });
  });

  it('R-79: placesSaved only once any place is', () => {
    expect(standingsLadder({ teams: TEAMS, rows: [], now: NOW, deadline: DEADLINE }).placesSaved).toBe(false);
    expect(
      standingsLadder({ teams: TEAMS, rows: [{ team: ZAL, place: 2, ...blank }], now: NOW, deadline: DEADLINE })
        .placesSaved,
    ).toBe(true);
  });

  it('the counters: places, ticks and final places, out of the table, 8, 4 and 2', () => {
    const ladder = standingsLadder({
      teams: TEAMS,
      rows: [
        { team: ZAL, place: 1, playOffs: true, finalFour: true, finalPlace: 1 },
        { team: OLY, place: 2, playOffs: true, finalFour: false, finalPlace: null },
      ],
      now: NOW,
      deadline: DEADLINE,
    });
    expect(ladder.counts).toEqual({ places: 2, playOffs: 2, finalFour: 1, finalPlaces: 1 });
    expect(ladder.totals).toEqual({ places: 3, playOffs: 8, finalFour: 4, finalPlaces: 2 });
  });

  it('R-80: open until the deadline, closed from it, no line without one', () => {
    expect(standingsLadder({ teams: TEAMS, rows: [], now: NOW, deadline: DEADLINE }).closes).toEqual({
      state: 'open',
      at: DEADLINE,
    });
    expect(standingsLadder({ teams: TEAMS, rows: [], now: DEADLINE, deadline: DEADLINE }).closes).toEqual({
      state: 'closed',
    });
    expect(standingsLadder({ teams: TEAMS, rows: [], now: NOW, deadline: null }).closes).toEqual({
      state: 'never',
    });
  });
});
```

```ts
// packages/domain/src/standings/save-throttle.test.ts
import { describe, expect, it } from 'vitest';
import { player } from '../testing';
import { standingsSaveLimits } from './save-throttle';

describe('standingsSaveLimits', () => {
  it('120 saves a minute per player, both routes together', () => {
    expect(standingsSaveLimits(player('7'))).toEqual([
      { key: 'standings-save:player:7', maxAttempts: 120, windowSeconds: 60 },
    ]);
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**
- [ ] **Step 3: Implement**

```ts
// packages/domain/src/standings/ladder.ts
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { standingsClosedAt } from './predict-row';
import { STANDINGS_COUNTS, type TeamPick } from './standings-prediction';

export interface LadderRow extends TeamPick {
  readonly name: string;
}

/** R-80: what the page says of the deadline. */
export type StandingsCloses =
  | { readonly state: 'open'; readonly at: Instant }
  | { readonly state: 'closed' }
  | { readonly state: 'never' };

interface Counts {
  readonly places: number;
  readonly playOffs: number;
  readonly finalFour: number;
  readonly finalPlaces: number;
}

/** What /prediction/standings shows a player. */
export interface StandingsPage {
  readonly rows: readonly LadderRow[];
  /** R-79: any of the player's places is saved. */
  readonly placesSaved: boolean;
  readonly counts: Counts;
  readonly totals: Counts;
  readonly closes: StandingsCloses;
}

/**
 * standings.blade.php's ladder: rows by saved place, unplaced teams last,
 * ties by name; the badges' counts; R-79's and R-80's states.
 */
export function standingsLadder(input: {
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly rows: readonly TeamPick[];
  readonly now: Instant;
  readonly deadline: Instant | null;
}): StandingsPage {
  const { teams, rows, now, deadline } = input;
  const byTeam = new Map(rows.map((row) => [row.team, row]));
  const ladder = teams
    .map((team): LadderRow => {
      const row = byTeam.get(team.id);
      return {
        team: team.id,
        name: team.name,
        place: row?.place ?? null,
        playOffs: row?.playOffs ?? null,
        finalFour: row?.finalFour ?? null,
        finalPlace: row?.finalPlace ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, 'lt'),
    );
  const count = (test: (row: LadderRow) => boolean) => ladder.filter(test).length;
  return {
    rows: ladder,
    placesSaved: ladder.some((row) => row.place !== null),
    counts: {
      places: count((row) => row.place !== null),
      playOffs: count((row) => row.playOffs === true),
      finalFour: count((row) => row.finalFour === true),
      finalPlaces: count((row) => row.finalPlace !== null),
    },
    totals: {
      places: teams.length,
      playOffs: STANDINGS_COUNTS.playOffs,
      finalFour: STANDINGS_COUNTS.finalFour,
      finalPlaces: STANDINGS_COUNTS.finalPlaces,
    },
    closes:
      deadline === null
        ? { state: 'never' }
        : standingsClosedAt(now, deadline)
          ? { state: 'closed' }
          : { state: 'open', at: deadline },
  };
}
```

```ts
// packages/domain/src/standings/save-throttle.ts
import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The standings saves' throttle: 120 accepted saves a minute per player,
 * the row save and the reorder together, checked before anything is read.
 * Not sportbet's (it has none): slice 6's hardening. 120, not
 * predictionSaveLimits' 60, as a ladder move is a save; the page sends one
 * reorder once arrow presses pause.
 */
export function standingsSaveLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [{ key: `standings-save:player:${player}`, maxAttempts: 120, windowSeconds: 60 }];
}
```

In `packages/domain/src/index.ts`, beside the other standings exports, add:

```ts
export {
  reorderFormEntry,
  standingsFormEntry,
  type ReorderFormCheck,
  type StandingsField,
  type StandingsFieldError,
  type StandingsFieldProblem,
  type StandingsFormCheck,
  type StandingsRowEntry,
} from './standings/standings-form';
export {
  predictStandingsRow,
  standingsClosedAt,
  type StandingsRowRefusal,
  type StandingsTarget,
} from './standings/predict-row';
export { reorderStandings, type PlacedTeam, type ReorderRefusal } from './standings/reorder';
export {
  standingsLadder,
  type LadderRow,
  type StandingsCloses,
  type StandingsPage,
} from './standings/ladder';
export { standingsSaveLimits } from './standings/save-throttle';
```

- [ ] **Step 4: Run the domain suite, expect PASS**

Run: `pnpm --filter @sportbet/domain test && pnpm --filter @sportbet/domain typecheck`

- [ ] **Step 5: Commit** - `feat(domain): standingsLadder (R-79, R-80) and standingsSaveLimits (#23)`

---

### Task 6: `loadStandingsPage`

**Files:**
- Create: `packages/db/src/standings/page.ts`, `packages/db/test/standings-page.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/test/standings-page.test.ts
import { at, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadStandingsPage } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, G7, G8, G9, G10_OPEN, OTHER, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-05T12:00:00Z');
/** Round 2's first tip-off (game 8) closes standings when the deadline round is 2. */
const ROUND_TWO = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, ROUND_TWO);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await client.query(
    'insert into standings_predictions (player_id, team_id, place, play_offs) values (1, 13, 1, true), (2, 11, 1, null)',
  );
});

describe('loadStandingsPage', () => {
  it("the player's own rows only, every team listed, by place then name", async () => {
    const page = await loadStandingsPage(db, { player: ADA, tournament: ROUND_TWO, now: NOW });
    expect(page.rows.map((row) => [row.name, row.place])).toEqual([
      ['Real', 1],
      ['Fenerbahce', null],
      ['Olympiacos', null],
      ['Zalgiris', null],
    ]);
    expect(page.rows[0]?.playOffs).toBe(true);
    expect(page.placesSaved).toBe(true);
  });

  it("the deadline: the deadline round's first tip-off", async () => {
    const page = await loadStandingsPage(db, { player: ADA, tournament: ROUND_TWO, now: NOW });
    expect(page.closes).toEqual({ state: 'open', at: G8.tipOff });
  });

  it("none of another tournament's rows leaks in", async () => {
    await saveTournament(db, OTHER);
    await client.query("insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')");
    await client.query('insert into standings_predictions (player_id, team_id, place) values (1, 41, 1)');
    const page = await loadStandingsPage(db, { player: ADA, tournament: ROUND_TWO, now: NOW });
    expect(page.rows.map((row) => row.name)).not.toContain('Partizan');
    expect(page.counts.places).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @sportbet/db test -- test/standings-page.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/db/src/standings/page.ts
import {
  standingsLadder,
  type Instant,
  type PlayerId,
  type StandingsPage,
  type Tournament,
} from '@sportbet/domain';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';
import { playerRowsIn } from './save';

/**
 * PredictionStandingController::getPredictionStandingsUser: the
 * tournament's teams with the player's own rows (a team with none shown
 * blank), and the deadline (Season.standingsDeadline, ST-2), as
 * standingsLadder lays them out.
 */
export async function loadStandingsPage(
  db: Executor,
  input: { readonly player: PlayerId; readonly tournament: Tournament; readonly now: Instant },
): Promise<StandingsPage> {
  const { player, tournament, now } = input;
  const teams = await listTeams(db, tournament);
  const rows = await playerRowsIn(db, player, tournament.id);
  const season = await loadSeason(db, tournament);
  return standingsLadder({ teams, rows, now, deadline: season.standingsDeadline() });
}
```

`playerRowsIn` is written in Task 7 (same folder); do Task 7's Step 3 helper first if running this task alone. Export from `packages/db/src/index.ts`:

```ts
export { loadStandingsPage } from './standings/page';
```

- [ ] **Step 4: Run it, expect PASS** (after Task 7's helper exists)
- [ ] **Step 5: Commit** with Task 7.

---

### Task 7: `saveStandingsRow` and `saveStandingsOrder`

**Files:**
- Create: `packages/db/src/standings/save.ts`, `packages/db/test/standings-save.test.ts`
- Modify: `packages/db/src/index.ts`

Each save is one transaction (a savepoint when `db` is one):

1. `set local lock_timeout = '5s'`.
2. Find the team's tournament (`teams.tournament_id`); the player must have a `tournament_players` row there. Neither: the domain's `not-yours` (call it with `target: null`).
3. Seed the player's missing rows for every team of the tournament (`insert ... on conflict do nothing`), then `select ... for update` the player's rows of the tournament, ordered by team: the lock.
4. Judge at the later of `now` and `databaseClock(tx)` (`../prediction/save`), with the deadline from `loadSeason(tx, tournament).standingsDeadline()`.
5. Decide (`predictStandingsRow` / `reorderStandings`) and write: the row save writes the row's five columns; the reorder writes only `place`.

No recalculation, no status change, no tournament lock (spec, Lead decisions).

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/test/standings-save.test.ts
import { at, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { saveStandingsOrder, saveStandingsRow } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, CAI, G7, G8, G9, G10_OPEN, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-05T12:00:00Z');
const ROUND_TWO = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };
const atClock = (instant = NOW) => () => Promise.resolve(instant);

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, ROUND_TWO);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA);
});

const rows = async () =>
  z
    .array(
      z.object({
        team_id: z.int(),
        place: z.int().nullable(),
        play_offs: z.boolean().nullable(),
        final_four: z.boolean().nullable(),
        final_place: z.int().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select team_id, place, play_offs, final_four, final_place from standings_predictions where player_id = 1 order by team_id',
        )
      ).rows,
    );

const entry = (team: number, over: object = {}) => ({
  team,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

describe('saveStandingsRow', () => {
  it("writes the row, seeding the player's missing rows blank", async () => {
    const saved = await saveStandingsRow(
      db,
      { player: ADA, entry: entry(11, { place: 2, playOffs: true, finalFour: false }), now: NOW },
      atClock(),
    );
    expect(saved.ok).toBe(true);
    expect(await rows()).toEqual([
      { team_id: 11, place: 2, play_offs: true, final_four: false, final_place: null },
      { team_id: 12, place: null, play_offs: null, final_four: null, final_place: null },
      { team_id: 13, place: null, play_offs: null, final_four: null, final_place: null },
      { team_id: 14, place: null, play_offs: null, final_four: null, final_place: null },
    ]);
  });

  it('a player not in the tournament, or a team not stored: not yours, nothing written', async () => {
    expect(await saveStandingsRow(db, { player: CAI, entry: entry(11, { place: 1 }), now: NOW }, atClock())).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await saveStandingsRow(db, { player: ADA, entry: entry(99, { place: 1 }), now: NOW }, atClock())).toEqual({
      ok: false,
      refusal: 'not-yours',
    });
    expect(await rows()).toEqual([]);
  });

  it("the deadline is judged at the database's time once the rows are locked", async () => {
    expect(
      await saveStandingsRow(db, { player: ADA, entry: entry(11, { place: 1 }), now: NOW }, atClock(G8.tipOff)),
    ).toEqual({ ok: false, refusal: 'closed' });
  });

  it('a conflict with another of the player\'s rows is refused', async () => {
    await saveStandingsRow(db, { player: ADA, entry: entry(11, { place: 1 }), now: NOW }, atClock());
    expect(
      await saveStandingsRow(db, { player: ADA, entry: entry(12, { place: 1 }), now: NOW }, atClock()),
    ).toEqual({ ok: false, refusal: 'place-taken' });
  });
});

describe('saveStandingsOrder', () => {
  it('writes places only: ticks and final places stay', async () => {
    await saveStandingsRow(
      db,
      { player: ADA, entry: entry(11, { playOffs: true, finalFour: true, finalPlace: 1 }), now: NOW },
      atClock(),
    );
    const saved = await saveStandingsOrder(db, { player: ADA, order: [14, 13, 12, 11], now: NOW }, atClock());
    expect(saved.ok).toBe(true);
    expect((await rows()).map((row) => [row.team_id, row.place, row.final_place])).toEqual([
      [11, 4, 1],
      [12, 3, null],
      [13, 2, null],
      [14, 1, null],
    ]);
  });

  it('an order that is not the whole table is a mismatch; after the deadline closed', async () => {
    expect(await saveStandingsOrder(db, { player: ADA, order: [11, 12], now: NOW }, atClock())).toEqual({
      ok: false,
      refusal: 'mismatch',
    });
    expect(
      await saveStandingsOrder(db, { player: ADA, order: [11, 12, 13, 14], now: NOW }, atClock(G8.tipOff)),
    ).toEqual({ ok: false, refusal: 'closed' });
  });

  it('a lock held past 5 s fails the save (lock_not_available)', async () => {
    await saveStandingsRow(db, { player: ADA, entry: entry(11), now: NOW }, atClock());
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select * from standings_predictions where player_id = 1 for update');
      await expect(
        saveStandingsOrder(db, { player: ADA, order: [11, 12, 13, 14], now: NOW }, atClock()),
      ).rejects.toMatchObject({ cause: { code: '55P03' } });
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  }, 15_000);
});
```

(`client.connect()` assumes `useTestDatabase` hands out a `pg.Pool`: check `packages/db/src/testing`, and hold the lock the way `prediction-save.test.ts`'s lock-timeout case does.)

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @sportbet/db test -- test/standings-save.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/db/src/standings/save.ts
import {
  predictStandingsRow,
  reorderStandings,
  type Instant,
  type PlacedTeam,
  type PlayerId,
  type ReorderRefusal,
  type Result,
  type StandingsRowEntry,
  type StandingsRowRefusal,
  type TeamPick,
} from '@sportbet/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { keyOf, teamOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { databaseClock, type DatabaseClock } from '../prediction/save';
import { loadSeason } from '../season/repository';
import { teams } from '../team/schema';
import { findTournamentById } from '../tournament/repository';
import { standingsPredictions } from './schema';

const pickRows = z.array(
  z.object({
    team: z.int(),
    place: z.int().nullable(),
    playOffs: z.boolean().nullable(),
    finalFour: z.boolean().nullable(),
    finalPlace: z.int().nullable(),
  }),
);

const columns = {
  team: standingsPredictions.teamId,
  place: standingsPredictions.place,
  playOffs: standingsPredictions.playOffs,
  finalFour: standingsPredictions.finalFour,
  finalPlace: standingsPredictions.finalPlace,
};

/** Rows as TeamPicks; a final place outside 1-2 (a stored 3 or 4) is read as stored. */
const picksOf = (rows: unknown): TeamPick[] =>
  pickRows.parse(rows).map((row) => ({
    team: teamOf(row.team),
    place: row.place,
    playOffs: row.playOffs,
    finalFour: row.finalFour,
    finalPlace: row.finalPlace === 1 || row.finalPlace === 2 || row.finalPlace === 3 || row.finalPlace === 4 ? row.finalPlace : null,
  }));

/** The player's standings rows of the tournament's teams, by team (unlocked: the page's read). */
export async function playerRowsIn(db: Executor, player: PlayerId, tournament: number): Promise<TeamPick[]> {
  return picksOf(
    await db
      .select(columns)
      .from(standingsPredictions)
      .innerJoin(teams, eq(teams.id, standingsPredictions.teamId))
      .where(and(eq(standingsPredictions.playerId, keyOf(player, 'player')), eq(teams.tournamentId, tournament)))
      .orderBy(asc(standingsPredictions.teamId)),
  );
}

const tournamentOfTeam = z.array(z.object({ tournament: z.int() }));

interface Locked {
  readonly tournament: number;
  readonly teams: ReturnType<typeof teamOf>[];
  readonly rows: TeamPick[];
  readonly deadline: Instant | null;
  readonly judgedAt: Instant;
}

/**
 * The save's target, locked: the team's tournament (issue 255: the row's,
 * never the request's), the player one of its players, their rows seeded
 * where missing and locked by team (FOR UPDATE), the deadline, and the
 * moment judged at - the later of `now` and the database's time once the
 * lock is held. Null: not the player's (no such team, or not playing).
 */
async function lockTarget(
  tx: Executor,
  player: PlayerId,
  team: number,
  now: Instant,
  clock: DatabaseClock,
): Promise<Locked | null> {
  const [found] = tournamentOfTeam.parse(
    await tx.select({ tournament: teams.tournamentId }).from(teams).where(eq(teams.id, team)),
  );
  if (found === undefined) return null;
  const playerKey = keyOf(player, 'player');
  const playing = await tx
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(and(eq(tournamentPlayers.playerId, playerKey), eq(tournamentPlayers.tournamentId, found.tournament)));
  if (playing.length === 0) return null;
  const tournament = await findTournamentById(tx, found.tournament);
  if (tournament === undefined) {
    throw new Error(`standings save: tournament ${String(found.tournament)} is not stored`);
  }
  const teamKeys = z
    .array(z.object({ id: z.int() }))
    .parse(await tx.select({ id: teams.id }).from(teams).where(eq(teams.tournamentId, found.tournament)).orderBy(asc(teams.id)))
    .map(({ id }) => id);
  // Missing rows first (a team added after joining has none), so every row
  // the save may judge exists to be locked.
  await tx
    .insert(standingsPredictions)
    .values(teamKeys.map((teamId) => ({ playerId: playerKey, teamId })))
    .onConflictDoNothing();
  const rows = picksOf(
    await tx
      .select(columns)
      .from(standingsPredictions)
      .where(and(eq(standingsPredictions.playerId, playerKey), inArray(standingsPredictions.teamId, teamKeys)))
      .orderBy(asc(standingsPredictions.teamId))
      .for('update'),
  );
  const season = await loadSeason(tx, tournament);
  const lockedAt = await clock(tx);
  return {
    tournament: found.tournament,
    teams: teamKeys.map(teamOf),
    rows,
    deadline: season.standingsDeadline(),
    judgedAt: lockedAt > now ? lockedAt : now,
  };
}

/**
 * updatePredictionStandingsUser in one transaction, as the form passed it
 * (standingsFormEntry): the target locked (lockTarget), the row decided by
 * predictStandingsRow and written - its five columns, as posted. Nothing
 * is recalculated (no stage is decided while standings are open) and no
 * status changes. A lock waited for past 5 s fails the save (55P03).
 */
export async function saveStandingsRow(
  db: Executor,
  save: { readonly player: PlayerId; readonly entry: StandingsRowEntry; readonly now: Instant },
  clock: DatabaseClock = databaseClock,
): Promise<Result<TeamPick, StandingsRowRefusal>> {
  const { player, entry, now } = save;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    const target = await lockTarget(tx, player, entry.team, now, clock);
    const decided = predictStandingsRow({
      entry: { ...entry, team: teamOf(entry.team) },
      target: target === null ? null : { teams: target.teams, rows: target.rows },
      now: target?.judgedAt ?? now,
      deadline: target?.deadline ?? null,
    });
    if (!decided.ok) return decided;
    const row = decided.value;
    await tx
      .update(standingsPredictions)
      .set({ place: row.place, playOffs: row.playOffs, finalFour: row.finalFour, finalPlace: row.finalPlace })
      .where(
        and(eq(standingsPredictions.playerId, keyOf(player, 'player')), eq(standingsPredictions.teamId, entry.team)),
      );
    return decided;
  });
}

/**
 * reorderPredictionStandingsUser in one transaction: the target is the
 * first posted team's tournament, locked as a row save locks it; the order
 * decided by reorderStandings; only `place` is written.
 */
export async function saveStandingsOrder(
  db: Executor,
  save: { readonly player: PlayerId; readonly order: readonly number[]; readonly now: Instant },
  clock: DatabaseClock = databaseClock,
): Promise<Result<readonly PlacedTeam[], ReorderRefusal>> {
  const { player, order, now } = save;
  const [first] = order;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    const target = first === undefined ? null : await lockTarget(tx, player, first, now, clock);
    const decided = reorderStandings({
      order: order.map(teamOf),
      target: target === null ? null : { teams: target.teams },
      now: target?.judgedAt ?? now,
      deadline: target?.deadline ?? null,
    });
    if (!decided.ok) return decided;
    for (const { team, place } of decided.value) {
      await tx
        .update(standingsPredictions)
        .set({ place })
        .where(
          and(
            eq(standingsPredictions.playerId, keyOf(player, 'player')),
            eq(standingsPredictions.teamId, keyOf(team, 'team')),
          ),
        );
    }
    return decided;
  });
}
```

Notes for the implementer:
- `teamOf` and `keyOf` are in `packages/db/src/edge.ts`; check `keyOf`'s exact signature (`keyOf(id: string, what: string)`) - `TeamId` is a branded string, so `keyOf(team, 'team')` is right; `PlayerId` likewise.
- Two places changing between the `update`s of a reorder could clash with a unique index on (player, place) if one exists - there is none (`standings_predictions` keeps sportbet's lack of one); leave it so.
- `Result`'s refusal property: match `packages/domain/src/shared/result.ts` in the tests.

Export from `packages/db/src/index.ts`:

```ts
export { saveStandingsOrder, saveStandingsRow } from './standings/save';
```

- [ ] **Step 4: Run both db tests, expect PASS; then the db suite and typecheck**

Run: `pnpm --filter @sportbet/db test -- test/standings-save.test.ts test/standings-page.test.ts && pnpm --filter @sportbet/db typecheck`

- [ ] **Step 5: Commit** - `feat(db): saveStandingsRow and saveStandingsOrder - one transaction, rows seeded and locked by team, judged under the lock; loadStandingsPage (#23)`

---

### Task 8: The wire format and the use cases

**Files:**
- Create: `apps/web/src/components/standings/standings-protocol.ts`, `apps/web/src/server/standings/texts.ts`, `apps/web/src/server/standings/save-standings.ts`, `apps/web/src/server/standings/save-standings.test.ts`
- Modify: `apps/web/src/components/shell/shell-paths.ts`

Texts (sportbet's where it has them, ours for the field rules - decision 3):

```ts
// apps/web/src/server/standings/texts.ts
/** The standings saves' texts: sportbet's (StandingsRules, the controller; lang/lt.json), R-78's, and the field rules'. */
export const STANDINGS_TEXTS = {
  placeTaken: 'Ši vieta jau užimta kitos komandos.',
  playOffsFull: '1/4 etape jau pažymėta 8 komandų.',
  finalFourFull: '1/2 etape jau pažymėta 4 komandų.',
  finalPlaceTaken: 'Ši finalo vieta jau užimta kitos komandos.',
  finalFourWithoutPlayOffs: 'Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.',
  finalPlaceWithoutFinalFour: 'Finalo vietą galima nurodyti tik komandai, pažymėtai 1/2 etape.',
  notThisPrediction: 'Šios prognozės išsaugoti negalima.',
  closed: 'Prognozių laikas baigėsi.',
  mismatch: 'Eilė nesutampa su jūsų lentele.',
  placeFromOne: 'Vieta turi būti teigiamas skaičius.',
  beyondTable: 'Tokios vietos lentelėje nėra.',
  badTick: 'Žymė turi būti 0 arba 1.',
  badFinalPlace: 'Finalo vieta turi būti 1 arba 2.',
  badOrder: 'Eilė neteisinga.',
} as const;
```

Protocol:

```ts
// apps/web/src/components/standings/standings-protocol.ts
import { z } from 'zod';

// The standings saves' wire format, written once: the routes build their
// answers from these types, and the page posts and parses with them.

/** The row save's fields, as sportbet's page names them (teamID for its prediction_standingID). */
export const STANDINGS_FIELDS = {
  team: 'teamID',
  place: 'groupPosition',
  playOffs: 'quarterfinal',
  finalFour: 'semifinal',
  finalPlace: 'final',
} as const;

/** The reorder's field: jQuery's `order[]`. */
export const ORDER_FIELD = 'order[]';

export interface StandingsRowRequest {
  readonly team: number;
  readonly place: number | null;
  readonly playOffs: boolean | null;
  readonly finalFour: boolean | null;
  readonly finalPlace: number | null;
}

const tick = (value: boolean | null) => (value === null ? '' : value ? '1' : '0');

export function standingsRowBody(row: StandingsRowRequest): URLSearchParams {
  return new URLSearchParams({
    [STANDINGS_FIELDS.team]: String(row.team),
    [STANDINGS_FIELDS.place]: row.place === null ? '' : String(row.place),
    [STANDINGS_FIELDS.playOffs]: tick(row.playOffs),
    [STANDINGS_FIELDS.finalFour]: tick(row.finalFour),
    [STANDINGS_FIELDS.finalPlace]: row.finalPlace === null ? '' : String(row.finalPlace),
  });
}

export function reorderBody(order: readonly number[]): URLSearchParams {
  const body = new URLSearchParams();
  for (const team of order) body.append(ORDER_FIELD, String(team));
  return body;
}

/** 200: sportbet's PredictionSaveResponse. */
export const standingsSavedSchema = z.object({ success: z.literal(true) });

/** 422 from the rules or the conflicts: Laravel's summary, each field's messages. */
export const standingsFieldErrorsSchema = z.object({
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string())),
});

/** 422 refusal, 429, 503. */
export const standingsRefusalSchema = z.object({ success: z.literal(false), message: z.string() });

export type StandingsSaveAnswer =
  | { readonly status: 200; readonly body: z.infer<typeof standingsSavedSchema> }
  | {
      readonly status: 422;
      readonly body: z.infer<typeof standingsFieldErrorsSchema> | z.infer<typeof standingsRefusalSchema>;
    }
  | { readonly status: 429 | 503; readonly body: z.infer<typeof standingsRefusalSchema> };
```

Shell paths (add to `shell-paths.ts`):

```ts
/** "Eiga": the player's standings prediction (sportbet's route 'prediction.standings', slice 9). */
export const STANDINGS_PATH = '/prediction/standings';

/** Where the ladder posts a row (sportbet posts to the page's own address; see Task 9). */
export const STANDINGS_SAVE_PATH = '/prediction/standings/save';

/** Where the ladder posts its order (sportbet's route 'prediction.standings.reorder'). */
export const STANDINGS_REORDER_PATH = '/prediction/standings/reorder';
```

The use cases mirror `server/predictions/save-prediction.ts` (read it first): form, then the throttle (`throttle(db, standingsSaveLimits(player), now)` - a refused form does not count), then the db save inside `try`/`catch` for `isLockTimeout` (import `busyAnswer`, `isLockTimeout`, `refusedAnswer`, `throttledAnswer` from `../predictions/save-prediction`; they are the same answers).

```ts
// apps/web/src/server/standings/save-standings.ts
import { saveStandingsOrder, saveStandingsRow, type Db } from '@sportbet/db';
import {
  reorderFormEntry,
  standingsFormEntry,
  standingsSaveLimits,
  type Instant,
  type PlayerId,
  type StandingsField,
  type StandingsFieldError,
  type StandingsRowRefusal,
} from '@sportbet/domain';
// StandingsField types the use case's `fields` below.
import { STANDINGS_FIELDS, type StandingsSaveAnswer } from '../../components/standings/standings-protocol';
import { busyAnswer, isLockTimeout, refusedAnswer, throttledAnswer } from '../predictions/save-prediction';
import { validationBody } from '../request/laravel-answers';
import { throttle } from '../sign-in/throttle';
import { STANDINGS_TEXTS } from './texts';

const FIELD_MESSAGES: Readonly<Record<StandingsFieldError['problem'], string>> = {
  'not-an-id': STANDINGS_TEXTS.notThisPrediction,
  'bad-place': STANDINGS_TEXTS.placeFromOne,
  'beyond-table': STANDINGS_TEXTS.beyondTable,
  'bad-tick': STANDINGS_TEXTS.badTick,
  'bad-final-place': STANDINGS_TEXTS.badFinalPlace,
};

/** The fields' refusals as Laravel's 422, under sportbet's field names. */
export function standingsValidationAnswer(errors: readonly StandingsFieldError[]): StandingsSaveAnswer {
  return {
    status: 422,
    body: validationBody(
      errors.map((error) => ({ field: STANDINGS_FIELDS[error.field], message: FIELD_MESSAGES[error.problem] })),
    ),
  };
}

/** A conflict or the chain: Laravel's 422 under the row's id field, as rowConflicts adds them. */
const conflictAnswer = (message: string): StandingsSaveAnswer => ({
  status: 422,
  body: validationBody([{ field: STANDINGS_FIELDS.team, message }]),
});

const ROW_REFUSALS: Readonly<Record<Exclude<StandingsRowRefusal, 'beyond-table'>, () => StandingsSaveAnswer>> = {
  'not-yours': () => refusedAnswer(STANDINGS_TEXTS.notThisPrediction),
  'place-taken': () => conflictAnswer(STANDINGS_TEXTS.placeTaken),
  'play-offs-full': () => conflictAnswer(STANDINGS_TEXTS.playOffsFull),
  'final-four-full': () => conflictAnswer(STANDINGS_TEXTS.finalFourFull),
  'final-place-taken': () => conflictAnswer(STANDINGS_TEXTS.finalPlaceTaken),
  'final-four-without-play-offs': () => conflictAnswer(STANDINGS_TEXTS.finalFourWithoutPlayOffs),
  'final-place-without-final-four': () => conflictAnswer(STANDINGS_TEXTS.finalPlaceWithoutFinalFour),
  closed: () => refusedAnswer(STANDINGS_TEXTS.closed),
};

/**
 * updatePredictionStandingsUser as a use case: the form (Laravel's 422 for
 * every failing field), the throttle (120 a minute, standingsSaveLimits;
 * only posts the form passed count), then saveStandingsRow, whose refusals
 * are sportbet's answers - the table's size a field error, a conflict or
 * the chain (R-78) Laravel's 422 under the row's field, "not yours" and
 * "closed" `{success: false, message}`. A lock waited for past 5 s: 503.
 */
export async function saveStandingsRowFromForm(
  db: Db,
  input: { readonly player: PlayerId; readonly fields: Readonly<Record<StandingsField, string>>; readonly now: Instant },
): Promise<StandingsSaveAnswer> {
  const checked = standingsFormEntry(input.fields);
  if (!checked.ok) return standingsValidationAnswer(checked.errors);
  const verdict = await throttle(db, standingsSaveLimits(input.player), input.now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Awaited<ReturnType<typeof saveStandingsRow>>;
  try {
    saved = await saveStandingsRow(db, { player: input.player, entry: checked.value, now: input.now });
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  if (saved.ok) return { status: 200, body: { success: true } };
  if (saved.refusal === 'beyond-table') {
    // The table's size is not known to the form: the save reads it.
    return standingsValidationAnswer([{ field: 'place', problem: 'beyond-table' }]);
  }
  return ROW_REFUSALS[saved.refusal]();
}

/**
 * reorderPredictionStandingsUser as a use case: the form (one 422 under
 * `order`), the throttle, then saveStandingsOrder: "not yours", "closed"
 * and "mismatch" are sportbet's `{success: false, message}`.
 */
export async function saveStandingsOrderFromForm(
  db: Db,
  input: { readonly player: PlayerId; readonly order: readonly string[]; readonly now: Instant },
): Promise<StandingsSaveAnswer> {
  const checked = reorderFormEntry(input.order);
  if (!checked.ok) {
    return { status: 422, body: validationBody([{ field: 'order', message: STANDINGS_TEXTS.badOrder }]) };
  }
  const verdict = await throttle(db, standingsSaveLimits(input.player), input.now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  let saved: Awaited<ReturnType<typeof saveStandingsOrder>>;
  try {
    saved = await saveStandingsOrder(db, { player: input.player, order: checked.value, now: input.now });
  } catch (error) {
    if (isLockTimeout(error)) return busyAnswer();
    throw error;
  }
  if (saved.ok) return { status: 200, body: { success: true } };
  switch (saved.refusal) {
    case 'not-yours':
      return refusedAnswer(STANDINGS_TEXTS.notThisPrediction);
    case 'closed':
      return refusedAnswer(STANDINGS_TEXTS.closed);
    case 'mismatch':
      return refusedAnswer(STANDINGS_TEXTS.mismatch);
  }
}
```

- [ ] **Step 1: Write the failing test** (`save-standings.test.ts`), the pure parts only - the routes are covered by the feature tests in Task 10:

```ts
import { describe, expect, it } from 'vitest';
import { standingsValidationAnswer } from './save-standings';

describe("standingsValidationAnswer (Laravel's 422 for UpdatePredictionStandingRequest)", () => {
  it("each field under sportbet's name; the message the first, then Laravel's count", () => {
    expect(
      standingsValidationAnswer([
        { field: 'place', problem: 'bad-place' },
        { field: 'finalPlace', problem: 'bad-final-place' },
      ]),
    ).toEqual({
      status: 422,
      body: {
        message: 'Vieta turi būti teigiamas skaičius. (and 1 more error)',
        errors: {
          groupPosition: ['Vieta turi būti teigiamas skaičius.'],
          final: ['Finalo vieta turi būti 1 arba 2.'],
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm --filter @sportbet/web test:component -- src/server/standings/save-standings.test.ts` (unit tests under `src/` run in the component config; check `vitest.component.config.ts`'s `include` and use whichever config picks up `src/server/**/*.test.ts`, as `save-prediction.test.ts` does).

- [ ] **Step 3: Implement** the three files as above.
- [ ] **Step 4: Run it, expect PASS**; `pnpm --filter @sportbet/web typecheck`.
- [ ] **Step 5: Commit** - `feat(web): the standings saves' wire format and use cases - sportbet's answers, R-78's texts (#23)`

---

### Task 9: The two routes

**Files:**
- Create: `apps/web/src/app/prediction/standings/save/route.ts`, `apps/web/src/app/prediction/standings/reorder/route.ts`

Next cannot serve a page and a POST handler at one path (slice 6, decision 1), so the row save posts to `/prediction/standings/save` (`STANDINGS_SAVE_PATH`), as the results save does; the reorder keeps sportbet's `/prediction/standings/reorder`.

```ts
// apps/web/src/app/prediction/standings/save/route.ts
import { STANDINGS_FIELDS } from '../../../../components/standings/standings-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { signedInPlayer } from '../../../../server/request-context';
import { formText } from '../../../../server/request/form-input';
import { refuseCrossSite } from '../../../../server/request/route-responses';
import { saveStandingsRowFromForm } from '../../../../server/standings/save-standings';

/**
 * The ladder's row save (sportbet's POST /prediction/standings), from this
 * site only. A guest: 401, sportbet's `auth` to a JSON request.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await signedInPlayer();
  if (signedIn === null) return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  const form = await request.formData().catch(() => new FormData());
  const answer = await saveStandingsRowFromForm(getDb(), {
    player: signedIn.player,
    fields: {
      team: formText(form, STANDINGS_FIELDS.team),
      place: formText(form, STANDINGS_FIELDS.place),
      playOffs: formText(form, STANDINGS_FIELDS.playOffs),
      finalFour: formText(form, STANDINGS_FIELDS.finalFour),
      finalPlace: formText(form, STANDINGS_FIELDS.finalPlace),
    },
    now: now(),
  });
  return Response.json(answer.body, { status: answer.status });
}
```

```ts
// apps/web/src/app/prediction/standings/reorder/route.ts
import { ORDER_FIELD } from '../../../../components/standings/standings-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { signedInPlayer } from '../../../../server/request-context';
import { refuseCrossSite } from '../../../../server/request/route-responses';
import { saveStandingsOrderFromForm } from '../../../../server/standings/save-standings';

/** The ladder's order (sportbet's POST /prediction/standings/reorder), from this site only. */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await signedInPlayer();
  if (signedIn === null) return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  const form = await request.formData().catch(() => new FormData());
  const order = form.getAll(ORDER_FIELD).map((value) => (typeof value === 'string' ? value.trim() : ''));
  const answer = await saveStandingsOrderFromForm(getDb(), { player: signedIn.player, order, now: now() });
  return Response.json(answer.body, { status: answer.status });
}
```

- [ ] **Step 1-4:** written test-first in Task 10's feature file (the routes need the built app). Typecheck: `pnpm --filter @sportbet/web typecheck`.
- [ ] **Step 5: Commit** with Task 10.

---

### Task 10: The page, its entry, its return; feature tests

**Files:**
- Create: `apps/web/src/app/prediction/standings/page.tsx`, `apps/web/tests/feature/standings.test.ts`
- Modify: `apps/web/src/server/sign-in/guarded-pages.ts`, `apps/web/src/components/shell/nav-entries.ts`, `apps/web/src/components/shell/icon.tsx`, and their tests (`nav-entries.test.ts`, `guarded-pages.test.ts`)

Guarded page (in `GuardedPageArgs` and `GUARDED_PAGES`):

```ts
  /** The standings prediction: bare. */
  readonly standings: [];
```

```ts
  standings: {
    path: () => STANDINGS_PATH,
    matches: (path) => path === STANDINGS_PATH,
  },
```

Navigation entry, after "Spėjimai" (sportbet's rail, bottom tabs and menu all list it):

```ts
  {
    // partials/rail.blade.php's "Eiga" (bi-table); the menu calls it
    // "Turnyro eiga", the tabs "Eiga".
    label: 'Eiga',
    href: STANDINGS_PATH,
    icon: 'table',
    audience: 'player',
    group: 'main',
    surfaces: ['rail', 'menu', 'tabs'],
    badge: 'standings',
  },
```

Icon: add `'table'` to `IconName` and its path from `bootstrap-icons@1.11.1/icons/table.svg` (copy the `d` exactly from the package: `pnpm dlx` is not needed - fetch `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/icons/table.svg` and copy its path).

Page:

```tsx
// apps/web/src/app/prediction/standings/page.tsx
import { loadStandingsPage } from '@sportbet/db';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PLAYER_HOME } from '../../../components/shell/shell-paths';
import { StandingsView } from '../../../components/standings/standings-view';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';
import { signInAndReturn } from '../../../server/sign-in/guarded-pages';

/**
 * PredictionStandingController::getPredictionStandingsUser behind
 * sportbet's `auth`: a guest signs in and comes back; a player with no
 * tournament goes home; a player sees their own ladder of the request's
 * tournament (R-28).
 */
export default async function PredictionStandingsPage() {
  await connection();
  const context = await requestContext();
  if (context.player === null) redirect(signInAndReturn('standings'));
  if (context.tournament === null) redirect(PLAYER_HOME);
  const page = await loadStandingsPage(getDb(), {
    player: context.player.id,
    tournament: context.tournament.tournament,
    now: now(),
  });
  return <StandingsView page={page} />;
}
```

(Check what `/prediction/results` does with no tournament - it renders `PredictionsView` with `page={null}`. sportbet redirects to `/`; follow sportbet: `redirect(PLAYER_HOME)` is wrong if `/main` itself needs a tournament - use `redirect('/')`.)

- [ ] **Step 1: Write the failing feature tests** in `apps/web/tests/feature/standings.test.ts`, modelled on `prediction-save.test.ts` (read it and `tests/support/predictions.ts` first). `SOONER` has teams 411 and 412 and its deadline 40 days away; `CLOSED`'s deadline passed yesterday. Cases, each one `it`:

```ts
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { Browser, documentOf, type Page } from '../support/browser';
import { jonasPlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();
const SAVE = '/prediction/standings/save';
const REORDER = '/prediction/standings/reorder';
const json = (page: Page): unknown => JSON.parse(page.html);

const row = (team: number, fields: Record<string, string> = {}) => {
  const body = new FormData();
  body.set('teamID', String(team));
  for (const [name, value] of Object.entries({ groupPosition: '', quarterfinal: '', semifinal: '', final: '', ...fields })) {
    body.set(name, value);
  }
  return body;
};
const order = (...teams: number[]) => {
  const body = new FormData();
  for (const team of teams) body.append('order[]', String(team));
  return body;
};
const rows = async () =>
  z
    .array(z.object({ team_id: z.int(), place: z.int().nullable(), play_offs: z.boolean().nullable() }))
    .parse((await client.query('select team_id, place, play_offs from standings_predictions where player_id = 1 order by team_id')).rows);

describe('POST /prediction/standings/save (updatePredictionStandingsUser)', () => {
  it('saved: 200 {success: true}, the row written', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.post(SAVE, row(411, { groupPosition: '1', quarterfinal: '1', semifinal: '0' }));
    expect(page.status).toBe(200);
    expect(json(page)).toEqual({ success: true });
    expect(await rows()).toEqual([
      { team_id: 411, place: 1, play_offs: true },
      { team_id: 412, place: null, play_offs: null },
    ]);
  });

  it("a field refused: Laravel's 422 under sportbet's name", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.post(SAVE, row(411, { final: '3' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({ message: 'Finalo vieta turi būti 1 arba 2.', errors: { final: ['Finalo vieta turi būti 1 arba 2.'] } });
  });

  it('beyond the table: 422 on groupPosition', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.post(SAVE, row(411, { groupPosition: '3' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({ message: 'Tokios vietos lentelėje nėra.', errors: { groupPosition: ['Tokios vietos lentelėje nėra.'] } });
  });

  it('a place taken: 422 under teamID', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await browser.post(SAVE, row(411, { groupPosition: '1' }));
    const page = await browser.post(SAVE, row(412, { groupPosition: '1' }));
    expect(json(page)).toEqual({ message: 'Ši vieta jau užimta kitos komandos.', errors: { teamID: ['Ši vieta jau užimta kitos komandos.'] } });
  });

  it('R-78: a Final Four tick without a play-off tick is refused', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.post(SAVE, row(411, { quarterfinal: '0', semifinal: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toMatchObject({ errors: { teamID: ['Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.'] } });
  });

  it('after the deadline: "Prognozių laikas baigėsi."', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const page = await browser.post(SAVE, row(431, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({ success: false, message: 'Prognozių laikas baigėsi.' });
  });

  it("another tournament's team: not yours", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const page = await browser.post(SAVE, row(431, { groupPosition: '1' }));
    expect(json(page)).toEqual({ success: false, message: 'Šios prognozės išsaugoti negalima.' });
  });

  it('a guest: 401; another site: 403', async () => {
    const guest = new Browser(baseUrl);
    expect((await guest.post(SAVE, row(411))).status).toBe(401);
    // Copy prediction-save.test.ts's cross-site case (its Origin header helper) for the 403.
  });
});

describe('POST /prediction/standings/reorder (reorderPredictionStandingsUser)', () => {
  it('saved: places only', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    await browser.post(SAVE, row(411, { quarterfinal: '1' }));
    const page = await browser.post(REORDER, order(412, 411));
    expect(json(page)).toEqual({ success: true });
    expect(await rows()).toEqual([
      { team_id: 411, place: 2, play_offs: true },
      { team_id: 412, place: 1, play_offs: null },
    ]);
  });

  it('not the whole table: "Eilė nesutampa su jūsų lentele."; a repeat: 422 on order', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    expect(json(await browser.post(REORDER, order(411)))).toEqual({ success: false, message: 'Eilė nesutampa su jūsų lentele.' });
    expect((await browser.post(REORDER, order(411, 411))).status).toBe(422);
  });
});

describe('GET /prediction/standings', () => {
  it('a guest signs in and comes back', async () => {
    const page = await new Browser(baseUrl).get('/prediction/standings');
    // Assert as prediction-game.test.ts asserts its guest redirect: /login?intended=%2Fprediction%2Fstandings
    expect(page.status).toBe(307);
  });

  it('a player: the ladder, the save-order button (R-79) and the closing time (R-80)', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const document = documentOf(await browser.get('/prediction/standings'));
    expect(document.querySelectorAll('[data-testid="ladder-row"]')).toHaveLength(2);
    expect(document.body.textContent).toContain('Išsaugoti šią tvarką');
    expect(document.body.textContent).toContain('Prognozės užsidaro');
  });

  it('closed: "Prognozės uždarytos.", every control disabled', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, CLOSED);
    const document = documentOf(await browser.get('/prediction/standings'));
    expect(document.body.textContent).toContain('Prognozės uždarytos.');
    for (const control of document.querySelectorAll('[data-testid="ladder-row"] input, [data-testid="ladder-row"] button')) {
      expect(control.hasAttribute('disabled')).toBe(true);
    }
  });
});
```

Adjust the redirect assertion and the `Browser` constructor to what `tests/support/browser.ts` offers (read it); keep each case's intent.

- [ ] **Step 2: Run, expect FAIL** - `pnpm --filter @sportbet/web test:feature -- tests/feature/standings.test.ts`
- [ ] **Step 3: Implement** the page, entry, icon, guarded page (components from Task 11 must exist for the page; do Task 11 before running).
- [ ] **Step 4: Run, expect PASS**, plus `nav-entries.test.ts` (it checks every href has a page) and the guarded-pages tests.
- [ ] **Step 5: Commit** - `feat(web): /prediction/standings, its row save and reorder routes; "Eiga" in the navigation; the return after sign-in (#23)`

---

### Task 11: The ladder

**Files:**
- Create: `apps/web/src/components/standings/ticks.ts`, `ticks.test.ts`, `ladder-moves.ts`, `ladder-moves.test.ts`, `save-queue.ts`, `save-queue.test.ts`, `standings-answer.ts`, `standings-answer.test.ts`, `standings-view.tsx`, `standings-view.test.tsx`, `ladder.tsx`, `ladder.test.tsx`

Read first: `components/predictions/score-autosave.tsx` (posting, `router.refresh()`), `prediction-editor.tsx` (markup and tokens), `components/format/vilnius-time.ts`, `apps/web/src/app/tokens.css`, and sportbet's `resources/views/prediction/standings.blade.php` (markup, classes, texts). Colours only through tokens (`token-guard.test.ts`).

**`ticks.ts`** - R-78's chain and the full stages, pure:

```ts
import type { LadderRow } from '@sportbet/domain';

export type TickField = 'playOffs' | 'finalFour';

/** A row after a tick changes (R-78): Final Four ticks play-offs; unticking play-offs clears Final Four and the final place; unticking Final Four clears the final place. */
export function afterTick(row: LadderRow, field: TickField, checked: boolean): LadderRow {
  if (field === 'finalFour') {
    return checked
      ? { ...row, finalFour: true, playOffs: true }
      : { ...row, finalFour: false, finalPlace: null };
  }
  return checked
    ? { ...row, playOffs: true }
    : { ...row, playOffs: false, finalFour: row.finalFour === true ? false : row.finalFour, finalPlace: null };
}

/** Whether a box is disabled while open: an unticked box whose stage is full, or whose tick would overfill play-offs. */
export function tickDisabled(rows: readonly LadderRow[], row: LadderRow, field: TickField): boolean {
  if (row[field] === true) return false;
  const ticked = (stage: TickField) => rows.filter((each) => each[stage] === true).length;
  if (field === 'playOffs') return ticked('playOffs') >= 8;
  return ticked('finalFour') >= 4 || (row.playOffs !== true && ticked('playOffs') >= 8);
}

/** The final place box is open only on a Final Four team (R-78). */
export const finalPlaceDisabled = (row: LadderRow): boolean => row.finalFour !== true;
```

Tests (`ticks.test.ts`) - one `it` per rule: ticking Final Four ticks play-offs; unticking play-offs clears Final Four and the final place; unticking Final Four clears the final place; a ninth play-off box disabled, a ticked one never; a fifth Final Four box disabled; Final Four on a non-play-off team disabled when play-offs are full; the final place box disabled off the Final Four.

**`ladder-moves.ts`** - moving in the order:

```ts
/** The order with the item at `from` moved to `to` (both indexes in range); the input untouched. */
export function moved<T>(order: readonly T[], from: number, to: number): T[] {
  const next = [...order];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

/** psAnnounce's text: ":team - :position vieta iš :total". */
export const announcement = (team: string, position: number, total: number): string =>
  `${team} - ${String(position)} vieta iš ${String(total)}`;
```

Tests: up, down, to the top, to the bottom, unchanged; the announcement text.

**`save-queue.ts`** - decision 5:

```ts
/**
 * Every post the ladder makes, one at a time and in order: a post starts
 * only once the one before it has answered, so a row save never meets the
 * places of a reorder still in flight. `run` takes a thunk, so a row's
 * body is built when it is sent, from the places last saved.
 */
export function saveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(post: () => Promise<T>): Promise<T> {
    const next = tail.then(post, post);
    tail = next.catch(() => undefined);
    return next;
  };
}
```

Test: two posts run in order (the second's thunk is called only after the first resolves), and a rejected post does not stop the next.

**`standings-answer.ts`** - as `predictions/save-answer.ts`:

```ts
import { SAVE_NOT_SAVED } from '../predictions/save-protocol';
import { STANDINGS_REORDER_PATH, STANDINGS_SAVE_PATH } from '../shell/shell-paths';
import {
  reorderBody,
  standingsFieldErrorsSchema,
  standingsRefusalSchema,
  standingsRowBody,
  standingsSavedSchema,
  type StandingsRowRequest,
} from './standings-protocol';

export type StandingsOutcome = { readonly kind: 'saved' } | { readonly kind: 'refused'; readonly message: string };

/** A save's answer as the ladder shows it (R-59): 200 saved; a 422 its first message; a 429 or 503 its message; anything else "not saved". */
export function readStandingsAnswer(status: number, body: unknown): StandingsOutcome {
  const failed = { kind: 'refused', message: SAVE_NOT_SAVED } as const;
  if (status === 200) return standingsSavedSchema.safeParse(body).success ? { kind: 'saved' } : failed;
  if (status === 422) {
    const fields = standingsFieldErrorsSchema.safeParse(body);
    if (fields.success) {
      return { kind: 'refused', message: Object.values(fields.data.errors)[0]?.[0] ?? fields.data.message };
    }
  }
  if (status === 422 || status === 429 || status === 503) {
    const refusal = standingsRefusalSchema.safeParse(body);
    if (refusal.success) return { kind: 'refused', message: refusal.data.message };
  }
  return failed;
}

async function post(path: string, body: URLSearchParams): Promise<StandingsOutcome> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { Accept: 'application/json' }, body });
    return readStandingsAnswer(response.status, await response.json().catch(() => null));
  } catch {
    return { kind: 'refused', message: SAVE_NOT_SAVED };
  }
}

export const postStandingsRow = (row: StandingsRowRequest) => post(STANDINGS_SAVE_PATH, standingsRowBody(row));
export const postStandingsOrder = (order: readonly number[]) => post(STANDINGS_REORDER_PATH, reorderBody(order));
```

Tests: each answer shape, built by `save-standings.ts`'s functions where they are pure, read back (as `save-prediction.test.ts` does).

**`standings-view.tsx`** (server component): the "Lentelė" card with sportbet's header (`#`, "Vieta", "1/4", "1/2", "F"), the R-80 line (`Prognozės užsidaro ${vilniusDateTime(at)}.` / "Prognozės uždarytos." / nothing), the legend ("Vieta - tempkite eilutes arba naudokite rodykles; vieta lentelėje yra eilės numeris.", "1/4-1/2 - pažymėkite komandas, patenkančias į kiekvieną etapą.", "F - 1 - čempionas, 2 - vicečempionas."), and `<Ladder page={page} />`. Component test: the three R-80 states, the legend.

**`ladder.tsx`** (`'use client'`): state = the rows (from `page.rows`), `placesSaved`, the last saved order, a message per row, the live text. Behaviour:

- Rows in state order; the `#` column the index + 1 when `placesSaved`, "-" otherwise (sportbet's unsaved rank).
- ▲/▼ buttons, `aria-label` "Pakelti: {team}" / "Nuleisti: {team}", `aria-disabled="true"` at the ends (never `disabled` while open); a press at an end does nothing. After a move: the new order in state, the live region gets `announcement(...)` (cleared first, written after 50 ms, so a repeat is read), focus stays on the moved club's same arrow (`ref` per team and arrow, `focus()` after render), and a reorder is scheduled 400 ms after the last press (`REORDER_DELAY_MS`).
- Mouse drag: `draggable` rows, `onDragStart` / `onDragOver` (`preventDefault`) / `onDrop` -> `moved(...)`, sent at once (flushing a waiting reorder).
- Touch drag: long press 350 ms starts it (8 px of movement first cancels: a scroll), `navigator.vibrate?.(10)`, `touchmove` with `preventDefault` while live (attach the listener with `{ passive: false }` in an effect), the row under the finger is the drop target, within 60 px of the screen's top or bottom scroll 12 px a frame, `touchend` drops; presses on `input`, `button`, `label` ignored; `contextmenu` suppressed while pressing or dragging; a `dragstart` within 1500 ms of a touch ignored.
- Sending a reorder (through the queue): on success the places become index + 1 for every row and `placesSaved` true; on failure the last saved order comes back, the live region says "Tvarkos išsaugoti nepavyko, grąžinta ankstesnė.", and the card shows its error ring for 1.5 s.
- R-79: while `!placesSaved`, a notice "Lentelė dar neišsaugota. Perkelkite komandą arba išsaugokite tvarką, kokią matote." and a button "Išsaugoti šią tvarką" that sends the shown order (through the queue).
- Ticks and the final place: two checkboxes (`aria-label` "1/4: {team}", "1/2: {team}") and a number box (`min=1 max=2`, `aria-label` "F: {team}"); a change applies `afterTick` / sets the final place, then posts the row through the queue after flushing a waiting reorder; the row posts its place as last saved (null while none is). A refusal: the row's message (`role="alert"`) and the row's previous state back; a save clears the message. Disabled per `tickDisabled` / `finalPlaceDisabled`.
- Closed (`page.closes.state === 'closed'`): every input and button `disabled`, no `draggable`, no grip, no handlers.
- The counters: "Vieta: x / N", "1/4: x / 8", "1/2: x / 4", "F: x / 2", each marked done (token `ok`) when exact, else `bad`.
- After any accepted save `router.refresh()` is not needed (nothing else on the page depends on it); do not call it, so the ladder's state is not reset under the player.

Component tests (`ladder.test.tsx`, Testing Library, `fetch` stubbed with `vi.fn`): ▲ on the first row is `aria-disabled`, ▼ moves a team and announces "Olympiacos - 2 vieta iš 3"; focus stays on the moved team's ▼; the reorder posts once after arrow presses pause (fake timers), with `order[]` in the new order; a failed reorder restores the order and announces the failure; ticking 1/2 ticks 1/4 and posts `quarterfinal=1&semifinal=1`; unticking 1/4 clears 1/2 and the final place; a refusal shows its message in the row; the R-79 button posts the shown order and disappears on success; closed: every control disabled and no `draggable`.

- [ ] **Steps:** test-first, file by file in the order above (pure modules, answer, view, ladder); run `pnpm --filter @sportbet/web test:component -- src/components/standings`; then `pnpm --filter @sportbet/web typecheck && pnpm lint`.
- [ ] **Commit** - `feat(web): the standings ladder - arrows, drag and touch drag, the live region, the stage chain (R-78), save the shown order (R-79), the closing time (R-80) (#23)`

---

### Task 12: E2E

**Files:**
- Create: `apps/web/e2e/standings.spec.ts`

As `e2e/predictions.spec.ts` (read it): the seeded account in Euroleague 2026/27, two teams (Zalgiris Kaunas, Real Madrid), no round-5 game (open, no closing line - decision 6). Do not sign in more times than the address allows (sign-in.spec.ts and predictions.spec.ts already use three codes in ten minutes: if this would exceed it, add these steps to `predictions.spec.ts`'s journey instead of a new sign-in).

```ts
import { expect, test } from '@playwright/test';
import { answerCookies, scrollsSideways, signIn } from './support/newcomer';

// Standings (slice 9, #23) as the seeded account, in Euroleague 2026/27's
// two-team table (packages/db/src/seed/staging.ts).

test("the ladder: save the shown order, move a team, tick the Final Four, at 1280 and 390", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await answerCookies(page);
  await page.goto('/prediction/standings');
  await signIn(page, { username: 'savininkas', name: 'Savininkas', surname: '', email: 'e2e.player@sportbet.test' });
  await expect(page).toHaveURL('/prediction/standings');

  await page.getByRole('button', { name: 'Išsaugoti šią tvarką' }).click();
  await expect(page.getByRole('button', { name: 'Išsaugoti šią tvarką' })).toBeHidden();

  await page.getByRole('button', { name: 'Nuleisti: Real Madrid' }).click();
  await expect(page.getByRole('status')).toHaveText('Real Madrid - 2 vieta iš 2');

  await page.getByLabel('1/2: Zalgiris Kaunas').check();
  await expect(page.getByLabel('1/4: Zalgiris Kaunas')).toBeChecked();
  await page.getByLabel('F: Zalgiris Kaunas').fill('1');

  await page.reload();
  await expect(page.getByLabel('1/2: Zalgiris Kaunas')).toBeChecked();
  await expect(page.getByLabel('F: Zalgiris Kaunas')).toHaveValue('1');

  await page.setViewportSize({ width: 390, height: 800 });
  expect(await scrollsSideways(page)).toBe(false);
});
```

(Adjust names to the seed: whichever team is first after the shown order; read the ladder's first row's name instead of assuming it.)

- [ ] Run `pnpm test:e2e -- standings.spec.ts` (needs the compose stack, `infra/compose/e2e.yml`); expect PASS.
- [ ] Commit - `test(e2e): the standings ladder at 1280 and 390 (#23)`

---

### Task 13: Docs

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-08-standings-predictions-design.md`

- [ ] **CLAUDE.md**, after the match prediction paragraph, add:

```markdown
- A standings prediction is decided by `predictStandingsRow` and
  `reorderStandings` (`packages/domain/src/standings/`), after the post
  passes `standingsFormEntry` / `reorderFormEntry`, and written only by
  `saveStandingsRow` / `saveStandingsOrder` (`packages/db/src/standings/save.ts`):
  one transaction on the posted team's tournament (never the request's),
  the player's missing rows seeded, their rows locked by team and the
  deadline (`Season.standingsDeadline`, ST-2) judged under the lock; the
  stage chain play-offs -> Final Four -> final place is refused when broken
  (R-78); a reorder writes only places. A save recalculates nothing and
  switches nothing back on. Saves are limited per player
  (`standingsSaveLimits`); what the page shows is `standingsLadder`.
```

and in the lock-order paragraph, after the prediction save's sentence:

```markdown
A standings save takes no tournament or game lock: it locks only the
player's `standings_predictions` rows of the tournament, by team, and
waits at most 5 s.
```

- [ ] **The spec**: under "Lead decisions", add the six "Decisions taken while planning" above (the navigation label "Eiga", the save path `/prediction/standings/save`, the team's tournament, the bound in the domain, our field texts, the queue, the E2E scope).
- [ ] Commit - `docs: slice 9 - the standings write path and its lock in CLAUDE.md; the plan's decisions in the spec (#23)`

---

### Finish

- [ ] `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:db && pnpm test:component && pnpm test:feature` - all green.
- [ ] `mp-code-review` from b030ba4; `improve-codebase-architecture` on the new files (a new feature landed).
- [ ] Push; CI deploys staging; the owner checks the done-means on staging; close #23.
