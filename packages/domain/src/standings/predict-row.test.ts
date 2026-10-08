import { describe, expect, it } from 'vitest';
import { at, standingsSeason, team } from '../testing';
import { predictStandingsRow, type StandingsEntry } from './predict-row';
import type { TeamPick } from './standings-prediction';

const TEAMS = Array.from({ length: 20 }, (_, index) => team(String(index + 1)));
const ZAL = team('1');
const NOW = at('2026-10-15T12:00:00Z');
const DEADLINE = at('2026-10-21T17:00:00Z');
const SEASON = standingsSeason(DEADLINE);

/** The player's row for the index-th team; columns not named never saved. */
const pick = (index: number, over: Partial<TeamPick> = {}): TeamPick => ({
  team: TEAMS[index] ?? ZAL,
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
  predictStandingsRow({
    entry: entryOf(entry),
    target: { teams: TEAMS, rows, season: SEASON },
    now,
  });

const refusalOf = (result: ReturnType<typeof decide>) =>
  result.ok ? null : result.refusal;

describe('predictStandingsRow (updatePredictionStandingsUser)', () => {
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

  it('standings save: no target (a team not stored, a player not in its tournament) is not yours', () => {
    expect(
      refusalOf(
        predictStandingsRow({
          entry: entryOf({ place: 1 }),
          target: null,
          now: NOW,
        }),
      ),
    ).toBe('not-yours');
  });

  it("standings save: a team not among the target's teams is not yours", () => {
    expect(
      refusalOf(
        predictStandingsRow({
          entry: { ...entryOf(), team: team('99') },
          target: { teams: TEAMS, rows: [], season: SEASON },
          now: NOW,
        }),
      ),
    ).toBe('not-yours');
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

  it('standings save: a final place another team holds is taken', () => {
    expect(
      refusalOf(
        decide({ playOffs: true, finalFour: true, finalPlace: 1 }, [
          pick(1, { playOffs: true, finalFour: true, finalPlace: 1 }),
        ]),
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
      predictStandingsRow({
        entry: entryOf({ place: 1 }),
        target: { teams: TEAMS, rows: [], season: standingsSeason(null) },
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("standings save: refusals in sportbet's order - not yours, the table, the conflicts, the chain, the deadline", () => {
    const after = at('2026-10-22T00:00:00Z');
    const taken = [pick(1, { place: 3, finalPlace: 1 })];
    expect(
      refusalOf(
        predictStandingsRow({
          entry: entryOf({ place: 21 }),
          target: null,
          now: after,
        }),
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
