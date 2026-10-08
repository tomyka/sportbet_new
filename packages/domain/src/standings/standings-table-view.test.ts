import { describe, expect, it } from 'vitest';
import { at, standingsSeason, team, teamPick } from '../testing';
import { StandingsTable } from './standings-table';
import { standingsCounts } from './standings-view';

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

type TableInput = Parameters<typeof StandingsTable.at>[0];

const ladder = (rows: TableInput['rows'], over: Partial<TableInput> = {}) =>
  StandingsTable.at({
    teams: TEAMS,
    rows,
    now: NOW,
    season: SEASON,
    ...over,
  }).view();

describe('StandingsTable.view (standings.blade.php)', () => {
  it('standings page: saved places first, then unplaced teams by name', () => {
    expect(
      ladder([teamPick('3', { place: 1 })]).rows.map((row) => row.name),
    ).toEqual(['Real', 'Olympiacos', 'Zalgiris']);
    expect(
      ladder([
        teamPick('1', { place: 1 }),
        teamPick('3', { place: 2 }),
        teamPick('2', { place: 3 }),
      ]).rows.map((row) => row.name),
    ).toEqual(['Zalgiris', 'Real', 'Olympiacos']);
  });

  it("standings page: names compare as sportbet's sortBy does, byte by byte (case first, accents after z)", () => {
    const named = [
      'Anadolu Efes',
      'Žalgiris',
      'AS Monaco',
      'Zenit',
      'ALBA Berlin',
    ].map((name, index) => ({ id: team(String(index + 1)), name }));
    expect(
      StandingsTable.at({
        teams: named,
        rows: [],
        now: NOW,
        season: SEASON,
      })
        .view()
        .rows.map((row) => row.name),
    ).toEqual([
      'ALBA Berlin',
      'AS Monaco',
      'Anadolu Efes',
      'Zenit',
      'Žalgiris',
    ]);
  });

  it('standings page: two rows stored with one place (legacy) are drawn by name', () => {
    expect(
      ladder([
        teamPick('1', { place: 1 }),
        teamPick('3', { place: 1 }),
        teamPick('2', { place: 1 }),
      ]).rows.map((row) => row.name),
    ).toEqual(['Olympiacos', 'Real', 'Zalgiris']);
  });

  it('standings page: places compare as numbers (2 before 10)', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      id: team(String(index + 1)),
      name: `Team ${String(index + 1)}`,
    }));
    expect(
      StandingsTable.at({
        teams: many,
        rows: [teamPick('1', { place: 10 }), teamPick('2', { place: 2 })],
        now: NOW,
        season: SEASON,
      })
        .view()
        .rows.slice(0, 2)
        .map((row) => row.place),
    ).toEqual([2, 10]);
  });

  it('standings page: a stored place 0 is placed, first', () => {
    expect(
      ladder([teamPick('2', { place: 0 })]).rows.map((row) => row.name),
    ).toEqual(['Olympiacos', 'Real', 'Zalgiris']);
  });

  it('standings page: a team with no row is shown blank, both ticks open, the final place shut', () => {
    expect(ladder([]).rows[0]).toEqual({
      team: OLY,
      name: 'Olympiacos',
      place: null,
      playOffs: null,
      finalFour: null,
      finalPlace: null,
      boxes: { playOffs: true, finalFour: true, finalPlace: false },
    });
  });

  it('standings page: a row of a team not in the tournament is not shown or counted', () => {
    const page = ladder([teamPick('9', { place: 1, playOffs: true })]);
    expect(page.rows.map((row) => row.team)).toEqual([OLY, REA, ZAL]);
    expect(page.counts.places).toBe(0);
    expect(page.placesSaved).toBe(false);
  });

  it('standings page (R-79): placesSaved only once any place is', () => {
    expect(ladder([]).placesSaved).toBe(false);
    expect(ladder([teamPick('1', { playOffs: true })]).placesSaved).toBe(false);
    expect(ladder([teamPick('1', { place: 2 })]).placesSaved).toBe(true);
  });

  it('standings page: the counters - places, ticks and final places, out of the table, 8, 4 and 2', () => {
    const page = ladder([
      teamPick('1', {
        place: 1,
        playOffs: true,
        finalFour: true,
        finalPlace: 1,
      }),
      teamPick('2', { place: 2, playOffs: true, finalFour: false }),
    ]);
    expect(page.counts).toEqual({
      places: 2,
      playOffs: 2,
      finalFour: 1,
      finalPlaces: 1,
    });
    expect(page.totals).toEqual({
      places: 3,
      playOffs: 8,
      finalFour: 4,
      finalPlaces: 2,
    });
  });

  it('standings page (R-80): open until the deadline, closed from it, no line without one', () => {
    expect(ladder([]).closes).toEqual({ state: 'open', at: DEADLINE });
    expect(ladder([], { now: DEADLINE }).closes).toEqual({ state: 'closed' });
    expect(ladder([], { season: standingsSeason(null) }).closes).toEqual({
      state: 'never',
    });
  });
});

describe('standingsCounts (the badges: Vieta, 1/4, 1/2, F)', () => {
  it('standings page: counts saved places, ticked boxes and named final places', () => {
    expect(
      standingsCounts([
        teamPick('1', {
          place: 1,
          playOffs: true,
          finalFour: true,
          finalPlace: 1,
        }),
        teamPick('2', {
          place: 0,
          playOffs: true,
          finalFour: true,
          finalPlace: 2,
        }),
        teamPick('3', { playOffs: true, finalFour: false }),
        teamPick('4', { playOffs: false }),
        teamPick('5'),
      ]),
    ).toEqual({ places: 2, playOffs: 3, finalFour: 2, finalPlaces: 2 });
  });

  it('standings page: no rows count nothing', () => {
    expect(standingsCounts([])).toEqual({
      places: 0,
      playOffs: 0,
      finalFour: 0,
      finalPlaces: 0,
    });
  });
});
