import { describe, expect, it } from 'vitest';
import { at, standingsSeason, team, teamPick } from '../testing';
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
const SEASON = standingsSeason(DEADLINE);

const ladder = (
  rows: Parameters<typeof standingsLadder>[0]['rows'],
  over: Partial<Parameters<typeof standingsLadder>[0]> = {},
) =>
  standingsLadder({
    teams: TEAMS,
    rows,
    now: NOW,
    season: SEASON,
    ...over,
  });

describe('standingsLadder (standings.blade.php)', () => {
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
      standingsLadder({
        teams: named,
        rows: [],
        now: NOW,
        season: SEASON,
      }).rows.map((row) => row.name),
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
      standingsLadder({
        teams: many,
        rows: [teamPick('1', { place: 10 }), teamPick('2', { place: 2 })],
        now: NOW,
        season: SEASON,
      })
        .rows.slice(0, 2)
        .map((row) => row.place),
    ).toEqual([2, 10]);
  });

  it('standings page: a stored place 0 is placed, first', () => {
    expect(
      ladder([teamPick('2', { place: 0 })]).rows.map((row) => row.name),
    ).toEqual(['Olympiacos', 'Real', 'Zalgiris']);
  });

  it('standings page: a team with no row is shown blank', () => {
    expect(ladder([]).rows[0]).toEqual({
      team: OLY,
      name: 'Olympiacos',
      place: null,
      playOffs: null,
      finalFour: null,
      finalPlace: null,
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
