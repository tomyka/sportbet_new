import { describe, expect, it } from 'vitest';
import type { TeamId } from '../shared/ids';
import { at, standingsSeason, team, teamPick } from '../testing';
import { StandingsTable } from './standings-table';
import type { TeamPick } from './standings-prediction';

const [A, B, C, X] = [team('1'), team('2'), team('3'), team('9')];
const TEAMS = [
  { id: A, name: 'Alba' },
  { id: B, name: 'Baskonia' },
  { id: C, name: 'Crvena zvezda' },
];
const DEADLINE = at('2026-10-21T17:00:00Z');
const SEASON = standingsSeason(DEADLINE);
/** Its one game scored: standings closed (ST-2). */
const CLOSED = standingsSeason(DEADLINE, true);
const tableAt = (season = SEASON, rows: readonly TeamPick[] = []) =>
  StandingsTable.of({ teams: TEAMS, rows, season });
const reorder = (order: readonly TeamId[], season = SEASON) =>
  tableAt(season).reorder(order);

describe('StandingsTable.reorder (reorderPredictionStandingsUser)', () => {
  it('standings reorder: each team its place in posted order, and nothing else', () => {
    expect(reorder([C, A, B])).toEqual({
      ok: true,
      value: [
        { team: C, place: 1 },
        { team: A, place: 2 },
        { team: B, place: 3 },
      ],
    });
  });

  it('standings reorder: ticks and final places are not part of the answer, whatever the rows hold', () => {
    const rows = [teamPick('1', { playOffs: true, finalFour: true })];
    expect(tableAt(SEASON, rows).reorder([B, A, C])).toEqual({
      ok: true,
      value: [
        { team: B, place: 1 },
        { team: A, place: 2 },
        { team: C, place: 3 },
      ],
    });
  });

  it('standings reorder: an unknown, a missing or a repeated team is a mismatch', () => {
    for (const order of [
      [A, B, X],
      [A, B],
      [A, B, B],
      [A, B, C, X],
    ]) {
      expect(reorder(order)).toEqual({ ok: false, refusal: 'mismatch' });
    }
  });

  it("standings reorder: closed once the deadline round's results are in, before the order is judged", () => {
    expect(reorder([A, B, C], SEASON).ok).toBe(true);
    expect(reorder([A, B], CLOSED)).toEqual({
      ok: false,
      refusal: 'closed',
    });
  });

  it('standings reorder: no deadline never closes', () => {
    expect(
      StandingsTable.of({
        teams: TEAMS,
        rows: [],
        season: standingsSeason(null),
      }).reorder([A, B, C]).ok,
    ).toBe(true);
  });
});
