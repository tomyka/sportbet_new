import { describe, expect, it } from 'vitest';
import type { FillInDice } from '../fill-in/fill-in';
import type { TeamId } from '../shared/ids';
import { at, seededDice, standingsSeason, team, teamPick } from '../testing';
import {
  type FinalPlace,
  type StandingsStage,
  type TeamPick,
} from './standings-prediction';
import {
  StandingsTable,
  type StandingsEntry,
  type StandingsView,
  type StandingsViewRow,
} from './standings-table';

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
const SEASON = standingsSeason(DEADLINE);

const tableOf = (rows: readonly TeamPick[], now = NOW) =>
  StandingsTable.at({ teams: TEAMS, rows, season: SEASON, now });

const rowOf = (view: StandingsView, id: TeamId): StandingsViewRow => {
  const found = view.rows.find((row) => row.team === id);
  if (found === undefined) throw new Error(`no row of ${id}`);
  return found;
};

describe('StandingsTable.at', () => {
  it('standings table: a stored row breaking R-78 is shown mended (keptChain), as sportbet does on load', () => {
    const view = tableOf([
      teamPick('1', { playOffs: false, finalFour: true, finalPlace: 1 }),
    ]).view();
    expect(rowOf(view, ZAL)).toMatchObject({
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
  });

  it("standings table: an open table's boxes follow the stage counts and the chain", () => {
    const view = tableOf([
      teamPick('1', { playOffs: true, finalFour: true }),
    ]).view();
    expect(rowOf(view, ZAL).boxes).toEqual({
      playOffs: true,
      finalFour: true,
      finalPlace: true,
    });
    expect(rowOf(view, OLY).boxes).toEqual({
      playOffs: true,
      finalFour: true,
      finalPlace: false,
    });
  });

  it('standings table: a full stage shuts its unticked boxes, and the Final Four of a team off a full play-off stage', () => {
    const teams = Array.from({ length: 10 }, (_, index) => ({
      id: team(String(index + 1)),
      name: `Team ${String(index + 1)}`,
    }));
    const rows = teams.map(({ id }, index) => ({
      team: id,
      place: null,
      playOffs: index < 8,
      finalFour: index < 2,
      finalPlace: null,
    }));
    const view = StandingsTable.at({
      teams,
      rows,
      season: SEASON,
      now: NOW,
    }).view();
    expect(rowOf(view, team('9')).boxes).toEqual({
      playOffs: false,
      finalFour: false,
      finalPlace: false,
    });
    expect(rowOf(view, team('3')).boxes).toMatchObject({
      playOffs: true,
      finalFour: true,
    });
  });

  it('standings table: closed (ST-2), every box is shut', () => {
    const view = tableOf(
      [teamPick('1', { playOffs: true, finalFour: true })],
      DEADLINE,
    ).view();
    for (const row of view.rows) {
      expect(row.boxes).toEqual({
        playOffs: false,
        finalFour: false,
        finalPlace: false,
      });
    }
  });
});

describe('StandingsTable.entryOf (what the page posts)', () => {
  it('standings table: a row as shown - mended, its place as last saved - is what the page posts', () => {
    const table = tableOf([
      teamPick('1', {
        place: 3,
        playOffs: false,
        finalFour: true,
        finalPlace: 1,
      }),
    ]);
    expect(table.entryOf(ZAL)).toEqual({
      team: ZAL,
      place: 3,
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
    expect(table.withTick(ZAL, 'finalFour', true).entryOf(ZAL)).toEqual({
      team: ZAL,
      place: 3,
      playOffs: true,
      finalFour: true,
      finalPlace: null,
    });
  });

  it("standings table: a never-saved tick posts unticked (the ladder's `cb.checked ? 1 : 0`); a blank place and final place post blank", () => {
    expect(tableOf([]).entryOf(OLY)).toEqual({
      team: OLY,
      place: null,
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
    expect(
      tableOf([teamPick('2', { playOffs: true })]).entryOf(OLY),
    ).toMatchObject({ playOffs: true, finalFour: false });
  });

  it("standings table: a stored final place 3 or 4 (football's) cannot be posted: an impossible state", () => {
    const table = tableOf([
      teamPick('1', { playOffs: true, finalFour: true, finalPlace: 3 }),
    ]);
    expect(() => table.entryOf(ZAL)).toThrow();
  });

  it('standings table: a team not in the table is an impossible state', () => {
    expect(() => tableOf([]).entryOf(team('9'))).toThrow();
  });
});

describe('StandingsTable edits (the page)', () => {
  it('standings table: withTick follows R-78 - ticking the Final Four ticks the play-offs', () => {
    const view = tableOf([]).withTick(OLY, 'finalFour', true).view();
    expect(rowOf(view, OLY)).toMatchObject({
      playOffs: true,
      finalFour: true,
    });
    expect(rowOf(view, OLY).boxes.finalPlace).toBe(true);
    expect(view.counts).toMatchObject({ playOffs: 1, finalFour: 1 });
  });

  it('standings table: withTick unticking the play-offs clears the Final Four and the final place', () => {
    const view = tableOf([
      teamPick('2', { playOffs: true, finalFour: true, finalPlace: 2 }),
    ])
      .withTick(OLY, 'playOffs', false)
      .view();
    expect(rowOf(view, OLY)).toMatchObject({
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
  });

  it('standings table: withFinalPlace names or clears a final place', () => {
    const table = tableOf([
      teamPick('2', { playOffs: true, finalFour: true }),
    ]).withFinalPlace(OLY, 1);
    expect(rowOf(table.view(), OLY).finalPlace).toBe(1);
    expect(table.view().counts.finalPlaces).toBe(1);
    expect(
      rowOf(table.withFinalPlace(OLY, null).view(), OLY).finalPlace,
    ).toBeNull();
  });

  it("standings table: withSavedOrder records an accepted reorder - each row's place its index + 1 (R-79: places saved)", () => {
    const view = tableOf([
      teamPick('1', { playOffs: true, finalFour: true, finalPlace: 1 }),
    ])
      .withSavedOrder([REA, ZAL, OLY])
      .view();
    expect(
      view.rows.map((row) => [row.team, row.place, row.finalPlace]),
    ).toEqual([
      [REA, 1, null],
      [ZAL, 2, 1],
      [OLY, 3, null],
    ]);
    expect(view.placesSaved).toBe(true);
    expect(view.counts.places).toBe(3);
  });

  it('standings table: withSavedOrder writes the places reorder decides', () => {
    const table = tableOf([]);
    const order = [OLY, REA, ZAL];
    const decided = table.reorder(order);
    expect(decided.ok).toBe(true);
    const saved = table.withSavedOrder(order).view();
    expect(
      saved.rows.map((row) => ({ team: row.team, place: row.place })),
    ).toEqual(decided.ok ? decided.value : []);
  });

  it('standings table: withSavedOrder of anything but the whole table is an impossible state', () => {
    expect(() => tableOf([]).withSavedOrder([REA, ZAL])).toThrow();
  });

  it('standings table: withOrder back to the saved order is the rollback - places as saved', () => {
    const saved = tableOf([]).withSavedOrder([REA, ZAL, OLY]);
    const rolledBack = saved
      .withOrder([OLY, ZAL, REA])
      .withOrder([REA, ZAL, OLY]);
    expect(rolledBack.view()).toEqual(saved.view());
  });

  it('standings table: withOrder shows the order; no place changes until it is saved', () => {
    const view = tableOf([teamPick('1', { place: 1 })])
      .withOrder([REA, ZAL, OLY])
      .view();
    expect(view.rows.map((row) => [row.team, row.place])).toEqual([
      [REA, null],
      [ZAL, 1],
      [OLY, null],
    ]);
    expect(view.placesSaved).toBe(true);
  });

  it('standings table: withOrder of anything but the whole table is an impossible state', () => {
    expect(() => tableOf([]).withOrder([REA, ZAL])).toThrow();
    expect(() => tableOf([]).withOrder([REA, ZAL, ZAL])).toThrow();
  });

  it('standings table: an edit of a team not in the table is an impossible state', () => {
    expect(() => tableOf([]).withTick(team('9'), 'playOffs', true)).toThrow();
    expect(() => tableOf([]).withFinalPlace(team('9'), 1)).toThrow();
  });

  it('standings table: edits leave the table they were made on as it was', () => {
    const table = tableOf([]);
    table.withTick(ZAL, 'playOffs', true).withOrder([REA, OLY, ZAL]);
    expect(table.view()).toEqual(tableOf([]).view());
  });
});

describe('StandingsTable: what the session needs', () => {
  it("standings table: withBoxesOf puts a refused row's ticks and final place back, keeping the table's place, mended", () => {
    const table = tableOf([
      teamPick('2', {
        place: 1,
        playOffs: true,
        finalFour: true,
        finalPlace: 2,
      }),
    ])
      .withSavedOrder([ZAL, OLY, REA])
      .withTick(OLY, 'playOffs', false);
    const before = teamPick('2', {
      place: 1,
      playOffs: true,
      finalFour: true,
      finalPlace: 2,
    });
    expect(rowOf(table.withBoxesOf(OLY, before).view(), OLY)).toMatchObject({
      place: 2,
      playOffs: true,
      finalFour: true,
      finalPlace: 2,
    });
    const broken = teamPick('2', {
      playOffs: false,
      finalFour: true,
      finalPlace: 1,
    });
    expect(rowOf(table.withBoxesOf(OLY, broken).view(), OLY)).toMatchObject({
      place: 2,
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
    expect(() => table.withBoxesOf(team('9'), before)).toThrow();
  });

  it('standings table: the view says whether the ladder may be reordered and whether to offer saving the shown order (R-79)', () => {
    expect(tableOf([])).toSatisfy((table: StandingsTable) => {
      const view = table.view();
      return view.reorderable && view.offerSaveShown;
    });
    const saved = tableOf([teamPick('1', { place: 1 })]).view();
    expect([saved.reorderable, saved.offerSaveShown]).toEqual([true, false]);
    const closed = tableOf([], DEADLINE).view();
    expect([closed.reorderable, closed.offerSaveShown]).toEqual([false, false]);
    const never = StandingsTable.at({
      teams: TEAMS,
      rows: [],
      season: standingsSeason(null),
      now: NOW,
    }).view();
    expect([never.reorderable, never.offerSaveShown]).toEqual([true, true]);
  });

  it('standings table: withLastSavedOrder shows the last saved order again (the rollback), places as saved', () => {
    const saved = tableOf([]).withSavedOrder([REA, ZAL, OLY]);
    const moved = saved
      .withOrder([OLY, ZAL, REA])
      .withTick(ZAL, 'playOffs', true);
    const back = moved.withLastSavedOrder().view();
    expect(back.rows.map((row) => [row.team, row.place])).toEqual([
      [REA, 1],
      [ZAL, 2],
      [OLY, 3],
    ]);
    expect(rowOf(back, ZAL).playOffs).toBe(true);
  });

  it('standings table: with no order saved yet, withLastSavedOrder shows the order the table was built in', () => {
    const table = tableOf([teamPick('3', { place: 1 })]);
    const built = table.view().rows.map((row) => row.team);
    expect(
      table
        .withOrder([...built].reverse())
        .withLastSavedOrder()
        .view()
        .rows.map((row) => row.team),
    ).toEqual(built);
    const copy = StandingsTable.fromView(
      table.withOrder([OLY, REA, ZAL]).view(),
    );
    expect(
      copy
        .withOrder([ZAL, OLY, REA])
        .withLastSavedOrder()
        .view()
        .rows.map((row) => row.team),
    ).toEqual([OLY, REA, ZAL]);
  });
});

describe('StandingsTable.fromView (the page copy)', () => {
  it('standings table: the view is plain data - JSON carries it whole', () => {
    const view = tableOf([
      teamPick('1', { place: 2, playOffs: true, finalFour: true }),
    ]).view();
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('standings table: fromView rebuilds the table its view came from', () => {
    for (const now of [NOW, DEADLINE]) {
      const table = tableOf(
        [
          teamPick('1', { place: 2, playOffs: true, finalFour: true }),
          teamPick('3', { place: 1 }),
        ],
        now,
      ).withOrder([OLY, REA, ZAL]);
      expect(StandingsTable.fromView(table.view()).view()).toEqual(
        table.view(),
      );
    }
  });

  it('standings table: a table from a view decides as the table did', () => {
    const table = tableOf([
      teamPick('1', { place: 1, playOffs: true, finalFour: true }),
    ]);
    const copy = StandingsTable.fromView(table.view());
    const taken: StandingsEntry = {
      team: OLY,
      place: 1,
      playOffs: null,
      finalFour: null,
      finalPlace: null,
    };
    expect(copy.saveRow(taken)).toEqual(table.saveRow(taken));
    expect(copy.reorder([REA, OLY, ZAL])).toEqual(
      table.reorder([REA, OLY, ZAL]),
    );
  });

  it("standings table: a view's totals and flags are the table's own, not the view's it was rebuilt from", () => {
    const view = tableOf([]).view();
    const tampered = {
      ...view,
      totals: { places: 99, playOffs: 99, finalFour: 99, finalPlaces: 99 },
      counts: { places: 7, playOffs: 7, finalFour: 7, finalPlaces: 7 },
      placesSaved: true,
      reorderable: false,
      offerSaveShown: false,
    };
    expect(StandingsTable.fromView(tampered).view()).toEqual(view);
  });

  it('standings table: a closed view stays closed', () => {
    const copy = StandingsTable.fromView(tableOf([], DEADLINE).view());
    expect(copy.reorder([ZAL, OLY, REA])).toEqual({
      ok: false,
      refusal: 'closed',
    });
  });
});

// The guarantee slice 9 kept only by agreement between the page and the
// save: every box the view shows open, changed as the page changes it and
// posted with the row as shown, is accepted by the save.

const STAGES: readonly StandingsStage[] = ['playOffs', 'finalFour'];

/** A random tick: never saved, unticked or ticked. */
const tickOf = (dice: FillInDice): boolean | null =>
  [null, false, true][dice.roll(2)] ?? null;

/**
 * A stored table as production may hold one: places 0, shared or past the
 * table, ticks and final places breaking R-78, stages past full and final
 * places held twice (sportbet's stored data predates its enforced counts).
 */
function randomRows(
  dice: FillInDice,
  teams: readonly TeamId[],
): readonly TeamPick[] {
  return teams.flatMap((id) => {
    if (dice.roll(5) === 0) return [];
    const placeRoll = dice.roll(teams.length + 2);
    const finalRoll = dice.roll(4);
    const finalPlace: FinalPlace | null =
      finalRoll === 1 || finalRoll === 2 ? finalRoll : null;
    return [
      {
        team: id,
        place: placeRoll <= teams.length + 1 && dice.coin() ? placeRoll : null,
        playOffs: dice.roll(3) === 0 ? tickOf(dice) : true,
        finalFour: tickOf(dice),
        finalPlace,
      },
    ];
  });
}

describe('StandingsTable: the view never offers a box the save refuses', () => {
  const tables = Array.from({ length: 150 }, (_, seed) => {
    const dice = seededDice(seed + 1);
    const size = 4 + dice.roll(10);
    const teams = Array.from({ length: size }, (_, index) => ({
      id: team(String(index + 1)),
      name: `Team ${String(index + 1)}`,
    }));
    const rows = randomRows(
      dice,
      teams.map(({ id }) => id),
    );
    return StandingsTable.at({ teams, rows, season: SEASON, now: NOW });
  });

  it('standings table: every open tick, changed through withTick and posted, is accepted by saveRow', () => {
    let checked = 0;
    for (const table of tables) {
      for (const row of table.view().rows) {
        for (const stage of STAGES) {
          if (!row.boxes[stage]) continue;
          const edited = table.withTick(row.team, stage, row[stage] !== true);
          const posted = edited.entryOf(row.team);
          // The posted row travels with the answer, so a failure names it.
          expect({ posted, saved: table.saveRow(posted) }).toMatchObject({
            saved: { ok: true },
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('standings table: every open final place box, set to a place no other row holds or to its own, is accepted by saveRow', () => {
    let checked = 0;
    for (const table of tables) {
      const view = table.view();
      for (const row of view.rows) {
        if (!row.boxes.finalPlace) continue;
        const held = view.rows
          .filter((other) => other.team !== row.team)
          .map((other) => other.finalPlace);
        for (const place of [null, 1, 2] as const) {
          // A place another row holds is taken, unless the row shows it already.
          if (
            place !== null &&
            place !== row.finalPlace &&
            held.includes(place)
          ) {
            continue;
          }
          const edited = table.withFinalPlace(row.team, place);
          const posted = edited.entryOf(row.team);
          // The posted row travels with the answer, so a failure names it.
          expect({ posted, saved: table.saveRow(posted) }).toMatchObject({
            saved: { ok: true },
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('standings table: any shown order, saved, is accepted by reorder', () => {
    for (const table of tables) {
      const shown = table.view().rows.map((row) => row.team);
      const reversed = [...shown].reverse();
      expect(table.withOrder(reversed).reorder(reversed).ok).toBe(true);
    }
  });
});
