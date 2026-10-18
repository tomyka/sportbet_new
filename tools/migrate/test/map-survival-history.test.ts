import { roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { mapSportbet, type Mapped, type MappedTournament } from '../src/map';
import {
  DUMP_IDS,
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  type Dump,
  type DumpRow,
} from './fixtures/sportbet-dump';

// sportbet keeps `point_survivals` as the history (one row per resolved round
// per player, forever) and `prediction_survivals` as the live run only: a loss
// nulls every event a player holds in that tournament. The new
// `survival_picks` is the history (R-5), so the reader rebuilds a resolved
// round's pick from its `point_survivals` row where no live pick covers it.

const map = (dump: Dump) => mapSportbet(readRows(dump));

const euroleague = (mapped: Mapped): MappedTournament => {
  const found = mapped.tournaments.find(
    ({ tournament }) => tournament.id === EUROLEAGUE,
  );
  if (found === undefined) throw new Error('no Euroleague tournament mapped');
  return found;
};

type Edit = (current: readonly DumpRow[]) => readonly DumpRow[];

/** The dump with its survival tables' rows changed. */
function changed(edits: {
  prediction_survivals?: Edit;
  point_survivals?: Edit;
}): Dump {
  const dump = syntheticDump();
  return {
    ...dump,
    prediction_survivals: (edits.prediction_survivals ?? ((rows) => rows))(
      dump.prediction_survivals,
    ),
    point_survivals: (edits.point_survivals ?? ((rows) => rows))(
      dump.point_survivals,
    ),
  };
}

const user = (name: 'ada' | 'ben' | 'cai' | 'dan') => IDS.player(name);
const team = (name: 'ZAL' | 'OLY' | 'REA' | 'FEN') => IDS.team(name);

/** The slot of a player's team, its event set (or null: detached). */
const slot =
  (name: 'ada' | 'ben' | 'cai' | 'dan', of: 'ZAL' | 'OLY' | 'REA' | 'FEN') =>
  (event: number | null) =>
  (rows: readonly DumpRow[]): readonly DumpRow[] =>
    rows.map((row) =>
      row['user_id'] === user(name) && row['team_id'] === team(of)
        ? { ...row, event_id: event }
        : row,
    );

const compose =
  (...edits: ((rows: readonly DumpRow[]) => readonly DumpRow[])[]) =>
  (rows: readonly DumpRow[]): readonly DumpRow[] =>
    edits.reduce((current, edit) => edit(current), rows);

/** A player's mapped run, as (round, team) pairs. */
const runOf = (mapped: Mapped, name: 'ada' | 'ben' | 'cai' | 'dan') =>
  euroleague(mapped)
    .runs.get(DUMP_IDS.player(name))
    ?.picks.map(({ round, team: picked }) => [round, picked]);

const FEN = DUMP_IDS.team('FEN');
const ZAL = DUMP_IDS.team('ZAL');
const OLY = DUMP_IDS.team('OLY');

/**
 * ben knocked out in round 1 and continuing in round 2 (a loss detached his
 * round-1 pick, then he picked ZAL); dan's picks are all detached (history
 * only); ada is mid-streak with both picks live; cai's only pick is pending
 * in round 2, with no history row.
 */
const afterLosses = () =>
  changed({
    prediction_survivals: compose(
      slot('ben', 'FEN')(null),
      slot('ben', 'ZAL')(IDS.event(2)),
      slot('dan', 'FEN')(null),
      slot('dan', 'ZAL')(null),
      (rows) => [
        ...rows,
        {
          id: 90,
          user_id: user('cai'),
          team_id: team('OLY'),
          event_id: IDS.event(2),
        },
      ],
    ),
    point_survivals: (rows) =>
      rows.map((row) =>
        row['user_id'] === user('ben') ? { ...row, survival_points: 0 } : row,
      ),
  });

describe('map: the survival history rebuilds the picks sportbet detached', () => {
  it("map: a resolved round's pick is rebuilt from its point_survivals row, beside the live picks", () => {
    const mapped = map(afterLosses());
    expect(runOf(mapped, 'ada')).toEqual([
      [roundNo(1), FEN],
      [roundNo(2), ZAL],
    ]);
    expect(runOf(mapped, 'ben')).toEqual([
      [roundNo(1), FEN],
      [roundNo(2), ZAL],
    ]);
    expect(runOf(mapped, 'dan')).toEqual([
      [roundNo(1), FEN],
      [roundNo(2), ZAL],
    ]);
    expect(runOf(mapped, 'cai')).toEqual([[roundNo(2), OLY]]);
  });

  it('map: the rebuilt picks are counted as added rows, which reconcile adds to the stored count', () => {
    // ben round 1, dan rounds 1 and 2: their slots hold no event.
    expect(map(afterLosses()).added.survival_picks).toBe(3);
  });

  it('map: the report counts the rebuilt picks, numbers only', () => {
    expect(map(afterLosses()).notices).toContain(
      'survival_picks: 3 past picks rebuilt from point_survivals (a resolved round keeps no live pick, R-5); 0 rounds kept the live pick where the stored row names another team; 0 rounds not rebuilt, as point_survivals holds several rows for one player and round',
    );
  });

  it('map: nothing is rebuilt where every resolved round has its live pick', () => {
    const mapped = map(
      changed({
        prediction_survivals: compose(
          slot('dan', 'FEN')(IDS.event(1)),
          slot('dan', 'ZAL')(IDS.event(2)),
        ),
      }),
    );
    expect(mapped.added.survival_picks).toBe(0);
    expect(mapped.notices).toContain(
      'survival_picks: 0 past picks rebuilt from point_survivals (a resolved round keeps no live pick, R-5); 0 rounds kept the live pick where the stored row names another team; 0 rounds not rebuilt, as point_survivals holds several rows for one player and round',
    );
  });

  it('map: a live pick and a history row naming different teams keep the live pick, and are counted', () => {
    const mapped = map(
      changed({
        point_survivals: (rows) =>
          rows.map((row) =>
            row['user_id'] === user('ada') && row['event_id'] === IDS.event(1)
              ? { ...row, team_id: team('OLY') }
              : row,
          ),
      }),
    );
    expect(runOf(mapped, 'ada')).toEqual([
      [roundNo(1), FEN],
      [roundNo(2), ZAL],
    ]);
    expect(mapped.added.survival_picks).toBe(2);
    expect(mapped.notices).toContainEqual(
      expect.stringContaining('1 rounds kept the live pick'),
    );
  });

  it('map: several history rows for one player and round, with no live pick, rebuild nothing, and are counted', () => {
    const mapped = map(
      changed({
        prediction_survivals: slot('ben', 'FEN')(null),
        point_survivals: (rows) => [
          ...rows,
          {
            id: 90,
            user_id: user('ben'),
            event_id: IDS.event(1),
            team_id: team('OLY'),
            survival_points: 12,
          },
        ],
      }),
    );
    expect(runOf(mapped, 'ben')).toBeUndefined();
    expect(mapped.added.survival_picks).toBe(2);
    expect(mapped.notices).toContainEqual(
      expect.stringContaining('1 rounds not rebuilt'),
    );
  });

  it('map: a history row that did not load rebuilds no pick', () => {
    const mapped = map(
      changed({
        prediction_survivals: slot('ben', 'FEN')(null),
        point_survivals: (rows) =>
          rows.map((row) =>
            row['user_id'] === user('ben') ? { ...row, team_id: 9999 } : row,
          ),
      }),
    );
    expect(runOf(mapped, 'ben')).toBeUndefined();
  });
});
