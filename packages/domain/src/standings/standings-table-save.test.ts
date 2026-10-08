import { describe, expect, it } from 'vitest';
import { at, standingsSeason, team } from '../testing';
import type { TeamPick } from './standings-prediction';
import { StandingsTable, type StandingsEntry } from './standings-table';

const TEAMS = Array.from({ length: 20 }, (_, index) => ({
  id: team(String(index + 1)),
  name: `Team ${String(index + 1)}`,
}));
const ZAL = team('1');
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');
const SEASON = standingsSeason(DEADLINE);

/** The player's row for the index-th team; columns not named never saved. */
const pick = (index: number, over: Partial<TeamPick> = {}): TeamPick => ({
  team: TEAMS[index]?.id ?? ZAL,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

/** A posted row for ZAL; columns not named posted blank. */
const entryOf = (
  over: Partial<Omit<StandingsEntry, 'team'>> = {},
): StandingsEntry => ({
  team: ZAL,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

const decide = (
  entry: Partial<Omit<StandingsEntry, 'team'>>,
  rows: readonly TeamPick[] = [],
  now = NOW,
) =>
  StandingsTable.at({ teams: TEAMS, rows, season: SEASON, now }).saveRow(
    entryOf(entry),
  );

const refusalOf = (result: ReturnType<typeof decide>) =>
  result.ok ? null : result.refusal;

describe('StandingsTable.saveRow (updatePredictionStandingsUser)', () => {
  it('standings save: accepted is the row as posted', () => {
    expect(decide({ place: 3, playOffs: true, finalFour: false })).toEqual({
      ok: true,
      value: {
        team: ZAL,
        place: 3,
        playOffs: true,
        finalFour: false,
        finalPlace: null,
      },
    });
  });

  it('standings save: a team not in the table is not yours (a team not stored, or a player not in its tournament, has no table: the database answers it)', () => {
    expect(
      refusalOf(
        StandingsTable.at({
          teams: TEAMS,
          rows: [],
          season: SEASON,
          now: NOW,
        }).saveRow({ ...entryOf(), team: team('99') }),
      ),
    ).toBe('not-yours');
  });

  it("standings save: the row's own stored place 0 (sportbet's), posted back unchanged, is kept, not judged", () => {
    expect(
      decide({ place: 0, playOffs: true }, [pick(0, { place: 0 })]),
    ).toEqual({
      ok: true,
      value: { ...entryOf({ place: 0, playOffs: true }) },
    });
  });

  it('standings save: a place the row shares with another stored row, posted back unchanged, is kept, not judged', () => {
    expect(
      decide({ place: 3, playOffs: true }, [
        pick(0, { place: 3 }),
        pick(1, { place: 3 }),
      ]).ok,
    ).toBe(true);
  });

  it('standings save: a stored place past the table (a team since removed), posted back unchanged, is kept, not judged', () => {
    expect(
      decide({ place: 21, finalFour: false }, [pick(0, { place: 21 })]).ok,
    ).toBe(true);
  });

  it('standings save: a changed place is judged as ever, whatever the row held', () => {
    expect(refusalOf(decide({ place: 0 }, [pick(0, { place: 3 })]))).toBe(
      'place-out-of-table',
    );
    expect(refusalOf(decide({ place: 22 }, [pick(0, { place: 21 })]))).toBe(
      'place-out-of-table',
    );
    expect(
      refusalOf(
        decide({ place: 4 }, [pick(0, { place: 3 }), pick(1, { place: 4 })]),
      ),
    ).toBe('place-taken');
    expect(refusalOf(decide({ place: 0 }, []))).toBe('place-out-of-table');
  });

  it('standings save: a place outside the table is refused (min:1, max:positionMax)', () => {
    expect(refusalOf(decide({ place: 21 }))).toBe('place-out-of-table');
    expect(refusalOf(decide({ place: 0 }))).toBe('place-out-of-table');
    expect(refusalOf(decide({ place: -1 }))).toBe('place-out-of-table');
    expect(decide({ place: 1 }).ok).toBe(true);
    expect(decide({ place: 20 }).ok).toBe(true);
  });

  it("standings save: a place another team holds is taken; the row's own old place is not", () => {
    expect(refusalOf(decide({ place: 3 }, [pick(1, { place: 3 })]))).toBe(
      'place-taken',
    );
    expect(decide({ place: 3 }, [pick(0, { place: 3 })]).ok).toBe(true);
  });

  it('standings save: a blank place is never taken', () => {
    expect(decide({ place: null }, [pick(1, { place: null })]).ok).toBe(true);
  });

  it('standings save: a blank final place is never taken', () => {
    expect(
      decide({ playOffs: true, finalFour: true, finalPlace: null }, [
        pick(1, { playOffs: true, finalFour: true, finalPlace: null }),
      ]).ok,
    ).toBe(true);
  });

  it("standings save: the row's own stored ticks and final place do not fill its stage", () => {
    const ownAndSeven = [
      pick(0, { playOffs: true, finalFour: true, finalPlace: 1 }),
      ...TEAMS.slice(1, 8).map((_, index) =>
        pick(index + 1, { playOffs: true }),
      ),
    ];
    expect(
      decide({ playOffs: true, finalFour: true, finalPlace: 1 }, ownAndSeven)
        .ok,
    ).toBe(true);
    const ownAndThree = [
      pick(0, { playOffs: true, finalFour: true }),
      ...TEAMS.slice(1, 4).map((_, index) =>
        pick(index + 1, { playOffs: true, finalFour: true }),
      ),
    ];
    expect(decide({ playOffs: true, finalFour: true }, ownAndThree).ok).toBe(
      true,
    );
  });

  it("standings save: other rows' unticked or never-saved boxes do not count toward a full stage", () => {
    const unticked = TEAMS.slice(1, 13).map((_, index) =>
      pick(index + 1, { playOffs: index < 7 }),
    );
    expect(decide({ playOffs: true }, unticked).ok).toBe(true);
  });

  it('standings save: a ninth play-off tick is refused; unticking never', () => {
    const eight = TEAMS.slice(1, 9).map((_, index) =>
      pick(index + 1, { playOffs: true }),
    );
    expect(refusalOf(decide({ playOffs: true }, eight))).toBe('play-offs-full');
    expect(decide({ playOffs: false }, eight).ok).toBe(true);
    expect(decide({ playOffs: true }, eight.slice(1)).ok).toBe(true);
  });

  it('standings save: a fifth Final Four tick is refused; unticking never', () => {
    const four = TEAMS.slice(1, 5).map((_, index) =>
      pick(index + 1, { playOffs: true, finalFour: true }),
    );
    expect(refusalOf(decide({ playOffs: true, finalFour: true }, four))).toBe(
      'final-four-full',
    );
    expect(decide({ playOffs: true, finalFour: false }, four).ok).toBe(true);
  });

  it("standings save: a row's own tick on an over-full stored stage (11 play-off ticks), posted back unchanged, is not judged again", () => {
    const eleven = TEAMS.slice(0, 11).map((_, index) =>
      pick(index, { playOffs: true, finalFour: index === 0 }),
    );
    expect(decide({ playOffs: true, finalFour: false }, eleven)).toMatchObject({
      ok: true,
    });
  });

  it('standings save: a new tick on an over-full stored stage is still refused', () => {
    const eleven = TEAMS.slice(1, 12).map((_, index) =>
      pick(index + 1, { playOffs: true }),
    );
    expect(refusalOf(decide({ playOffs: true }, eleven))).toBe(
      'play-offs-full',
    );
    const fiveFinalFour = TEAMS.slice(1, 6).map((_, index) =>
      pick(index + 1, { playOffs: true, finalFour: true }),
    );
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true }, [
          ...fiveFinalFour,
          pick(0, { playOffs: true, finalFour: false }),
        ]),
      ),
    ).toBe('final-four-full');
  });

  it('standings save: a final place the row shares with another stored row, posted back unchanged, is not judged again', () => {
    expect(
      decide({ playOffs: true, finalFour: true, finalPlace: 1, place: 2 }, [
        pick(0, { playOffs: true, finalFour: true, finalPlace: 1 }),
        pick(1, { playOffs: true, finalFour: true, finalPlace: 1 }),
      ]),
    ).toMatchObject({ ok: true });
  });

  it('standings save: a final place changed to one another stored row holds is still taken', () => {
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [
          pick(0, { playOffs: true, finalFour: true, finalPlace: 2 }),
          pick(1, { playOffs: true, finalFour: true, finalPlace: 1 }),
          pick(2, { playOffs: true, finalFour: true, finalPlace: 1 }),
        ]),
      ),
    ).toBe('final-place-taken');
  });

  it('standings save: a stored Final Four tick the page shows mended (no play-off tick) is new when ticked, so judged', () => {
    const four = TEAMS.slice(1, 5).map((_, index) =>
      pick(index + 1, { playOffs: true, finalFour: true }),
    );
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true }, [
          ...four,
          pick(0, { playOffs: false, finalFour: true }),
        ]),
      ),
    ).toBe('final-four-full');
  });

  it('standings save: a final place another team holds is taken', () => {
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [
          pick(1, { playOffs: true, finalFour: true, finalPlace: 1 }),
        ]),
      ),
    ).toBe('final-place-taken');
  });

  it("standings save (R-78): another row's stored Final Four tick without a play-off tick is mended, as the page shows it, so it fills no stage", () => {
    const broken = [
      ...TEAMS.slice(1, 4).map((_, index) =>
        pick(index + 1, { playOffs: true, finalFour: true }),
      ),
      pick(4, { playOffs: false, finalFour: true }),
    ];
    expect(decide({ playOffs: true, finalFour: true }, broken).ok).toBe(true);
  });

  it("standings save (R-78): another row's stored final place without a Final Four tick is mended, so it takes no final place", () => {
    expect(
      decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [
        pick(1, { playOffs: true, finalFour: false, finalPlace: 1 }),
      ]).ok,
    ).toBe(true);
    expect(
      decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [
        pick(1, { playOffs: false, finalFour: true, finalPlace: 1 }),
      ]).ok,
    ).toBe(true);
  });

  it('standings save (R-78): a stored row that keeps the chain still counts and still takes its final place', () => {
    const four = TEAMS.slice(1, 5).map((_, index) =>
      pick(index + 1, {
        playOffs: true,
        finalFour: true,
        finalPlace: index === 0 ? 1 : null,
      }),
    );
    expect(refusalOf(decide({ playOffs: true, finalFour: true }, four))).toBe(
      'final-four-full',
    );
    expect(
      refusalOf(
        decide(
          { playOffs: true, finalFour: true, finalPlace: 1 },
          four.slice(0, 3),
        ),
      ),
    ).toBe('final-place-taken');
  });

  it('standings save (R-78): a Final Four tick needs a play-off tick', () => {
    expect(refusalOf(decide({ finalFour: true }))).toBe(
      'final-four-without-play-offs',
    );
    expect(refusalOf(decide({ playOffs: false, finalFour: true }))).toBe(
      'final-four-without-play-offs',
    );
  });

  it('standings save (R-78): a final place needs a Final Four tick', () => {
    expect(refusalOf(decide({ playOffs: true, finalPlace: 2 }))).toBe(
      'final-place-without-final-four',
    );
    expect(
      refusalOf(decide({ playOffs: true, finalFour: false, finalPlace: 2 })),
    ).toBe('final-place-without-final-four');
    expect(decide({ playOffs: true, finalFour: true, finalPlace: 2 }).ok).toBe(
      true,
    );
  });

  it('standings save (R-78): unticking play-offs alone is accepted when nothing later is ticked', () => {
    expect(
      decide({ playOffs: false, finalFour: false, finalPlace: null }).ok,
    ).toBe(true);
  });

  it('standings deadline: open until the deadline instant, closed at it (ST-2)', () => {
    expect(decide({ place: 1 }, [], at('2026-10-21T16:59:59Z')).ok).toBe(true);
    expect(refusalOf(decide({ place: 1 }, [], DEADLINE))).toBe('closed');
  });

  it('standings deadline: none means never closed', () => {
    expect(
      StandingsTable.at({
        teams: TEAMS,
        rows: [],
        season: standingsSeason(null),
        now: NOW,
      }).saveRow(entryOf({ place: 1 })).ok,
    ).toBe(true);
  });

  it("standings save: refusals in sportbet's order - not yours, the table, the conflicts, the chain, the deadline", () => {
    const after = at('2026-10-22T00:00:00Z');
    const taken = [
      pick(1, { place: 3, playOffs: true, finalFour: true, finalPlace: 1 }),
    ];
    expect(
      refusalOf(
        StandingsTable.at({
          teams: TEAMS,
          rows: taken,
          season: SEASON,
          now: after,
        }).saveRow({ ...entryOf({ place: 21 }), team: team('99') }),
      ),
    ).toBe('not-yours');
    expect(
      refusalOf(decide({ place: 21, finalFour: true }, taken, after)),
    ).toBe('place-out-of-table');
    expect(
      refusalOf(
        decide({ place: 3, finalFour: true, finalPlace: 1 }, taken, after),
      ),
    ).toBe('place-taken');
    expect(
      refusalOf(decide({ finalFour: true, finalPlace: 1 }, taken, after)),
    ).toBe('final-place-taken');
    expect(refusalOf(decide({ finalFour: true }, [], after))).toBe(
      'final-four-without-play-offs',
    );
  });

  it("standings save: refusals in StandingsRules::rowConflicts' order - play-offs full, Final Four full, the final place, then R-78, then the deadline", () => {
    const after = at('2026-10-22T00:00:00Z');
    const full = TEAMS.slice(1, 9).map((_, index) =>
      pick(index + 1, {
        playOffs: true,
        finalFour: index < 4,
        finalPlace: index === 0 ? 1 : null,
      }),
    );
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true, finalPlace: 1 }, full, after),
      ),
    ).toBe('play-offs-full');
    const finalFourFull = full.slice(0, 4);
    expect(
      refusalOf(
        decide(
          { playOffs: true, finalFour: true, finalPlace: 1 },
          finalFourFull,
          after,
        ),
      ),
    ).toBe('final-four-full');
    expect(
      refusalOf(decide({ finalFour: true, finalPlace: 2 }, [], after)),
    ).toBe('final-four-without-play-offs');
    expect(
      refusalOf(decide({ playOffs: true, finalPlace: 2 }, [], after)),
    ).toBe('final-place-without-final-four');
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true, finalPlace: 2 }, [], after),
      ),
    ).toBe('closed');
  });
});
