import { describe, expect, it } from 'vitest';
import { team } from '../testing';
import {
  afterTick,
  finalPlaceOpen,
  keptChain,
  stageFull,
  tickOpen,
} from './chain';
import type { StandingsViewRow } from './standings-view';

/** A shown row's columns besides the ticks: what a chain edit must keep. */
type LadderRow = Omit<StandingsViewRow, 'boxes'>;
import type { TeamPick } from './standings-prediction';

const row = (id: number, over: Partial<TeamPick> = {}): TeamPick => ({
  team: team(String(id)),
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

/** `count` rows, the first `playOffs` ticked for play-offs and the first `finalFour` for the Final Four. */
const table = (count: number, playOffs: number, finalFour = 0): TeamPick[] =>
  Array.from({ length: count }, (_, index) =>
    row(index + 1, {
      playOffs: index < playOffs,
      finalFour: index < finalFour,
    }),
  );

const nth = (rows: readonly TeamPick[], index: number): TeamPick => {
  const found = rows[index];
  if (found === undefined) throw new Error(`no row ${String(index)}`);
  return found;
};

/** R-78: a Final Four tick has a play-off tick; a final place a Final Four tick. */
const keepsChain = (each: TeamPick): boolean =>
  (each.finalFour !== true || each.playOffs === true) &&
  (each.finalPlace === null || each.finalFour === true);

const ticks = [null, false, true] as const;
/** Every combination of the two ticks and a final place (blank, 1 or 2). */
const everyRow = ticks.flatMap((playOffs) =>
  ticks.flatMap((finalFour) =>
    ([null, 1, 2] as const).map((finalPlace) =>
      row(1, { playOffs, finalFour, finalPlace }),
    ),
  ),
);

describe('afterTick (R-78: the stage chain)', () => {
  it('standings chain: ticking the Final Four ticks the play-offs', () => {
    expect(afterTick(row(1), 'finalFour', true)).toMatchObject({
      finalFour: true,
      playOffs: true,
    });
  });

  it('standings chain: unticking the play-offs clears the Final Four and the final place', () => {
    expect(
      afterTick(
        row(1, { playOffs: true, finalFour: true, finalPlace: 1 }),
        'playOffs',
        false,
      ),
    ).toMatchObject({ playOffs: false, finalFour: false, finalPlace: null });
  });

  it('standings chain: unticking the play-offs leaves an untouched Final Four blank', () => {
    expect(afterTick(row(1, { playOffs: true }), 'playOffs', false)).toEqual(
      row(1, { playOffs: false }),
    );
  });

  it('standings chain: unticking the Final Four clears the final place, the play-offs stay', () => {
    expect(
      afterTick(
        row(1, { playOffs: true, finalFour: true, finalPlace: 2 }),
        'finalFour',
        false,
      ),
    ).toMatchObject({ playOffs: true, finalFour: false, finalPlace: null });
  });

  it('standings chain: ticking the play-offs changes nothing else; the row given is untouched', () => {
    const before = row(1, { finalPlace: null });
    expect(afterTick(before, 'playOffs', true)).toEqual(
      row(1, { playOffs: true }),
    );
    expect(before.playOffs).toBeNull();
  });

  it('standings chain: a ladder row keeps its name and place', () => {
    const ladderRow: LadderRow = { ...row(1, { place: 3 }), name: 'Zalgiris' };
    expect(afterTick(ladderRow, 'finalFour', true)).toEqual({
      ...ladderRow,
      playOffs: true,
      finalFour: true,
    });
  });
});

describe('afterTick keeps the chain the save checks (R-78, predictStandingsRow)', () => {
  it.each(
    everyRow
      .filter(keepsChain)
      .flatMap((start) =>
        (['playOffs', 'finalFour'] as const).flatMap((stage) =>
          [true, false].map((checked) => ({ start, stage, checked })),
        ),
      ),
  )(
    'standings chain: from $start.playOffs/$start.finalFour/$start.finalPlace, $stage set to $checked',
    ({ start, stage, checked }) => {
      const after = afterTick(start, stage, checked);
      expect(after[stage]).toBe(checked);
      expect(keepsChain(after)).toBe(true);
    },
  );
});

describe('keptChain (standings.blade.php: the cascade on load)', () => {
  it('standings chain: a final place without a Final Four tick is cleared', () => {
    expect(
      keptChain(row(1, { playOffs: true, finalFour: false, finalPlace: 1 })),
    ).toEqual(row(1, { playOffs: true, finalFour: false }));
    expect(keptChain(row(1, { playOffs: true, finalPlace: 2 }))).toEqual(
      row(1, { playOffs: true }),
    );
  });

  it('standings chain: a Final Four tick without a play-off tick is unticked, and its final place cleared', () => {
    expect(
      keptChain(row(1, { playOffs: false, finalFour: true, finalPlace: 1 })),
    ).toEqual(row(1, { playOffs: false, finalFour: false }));
    expect(keptChain(row(1, { finalFour: true }))).toEqual(
      row(1, { finalFour: false }),
    );
  });

  it('standings chain: a row that keeps the chain is returned as it is', () => {
    for (const each of everyRow.filter(keepsChain)) {
      expect(keptChain(each)).toEqual(each);
    }
  });

  it.each(everyRow)(
    'standings chain: $playOffs/$finalFour/$finalPlace comes out keeping the chain, its play-off tick untouched',
    (start) => {
      const kept = keptChain(start);
      expect(keepsChain(kept)).toBe(true);
      expect(kept.playOffs).toBe(start.playOffs);
    },
  );

  it('standings chain: a ladder row keeps its name and place', () => {
    const ladderRow: LadderRow = {
      ...row(1, { place: 3, finalPlace: 1 }),
      name: 'Zalgiris',
    };
    expect(keptChain(ladderRow)).toEqual({ ...ladderRow, finalPlace: null });
  });
});

describe('stageFull (StandingsFormat: the stage counts)', () => {
  it('standings chain: play-offs hold 8 ticks, the Final Four 4', () => {
    expect(stageFull(table(10, 8), 'playOffs')).toBe(true);
    expect(stageFull(table(10, 7), 'playOffs')).toBe(false);
    expect(stageFull(table(10, 6, 4), 'finalFour')).toBe(true);
    expect(stageFull(table(10, 6, 3), 'finalFour')).toBe(false);
  });

  it('standings chain: an unticked or never-saved box does not count', () => {
    const rows = [...table(7, 7), row(8), row(9, { playOffs: false })];
    expect(stageFull(rows, 'playOffs')).toBe(false);
  });
});

describe('tickOpen', () => {
  it('standings chain: a ninth play-off box is closed; a ticked one never is', () => {
    const rows = table(10, 8);
    expect(tickOpen(rows, nth(rows, 8), 'playOffs')).toBe(false);
    expect(tickOpen(rows, nth(rows, 0), 'playOffs')).toBe(true);
    const seven = table(10, 7);
    expect(tickOpen(seven, nth(seven, 8), 'playOffs')).toBe(true);
  });

  it('standings chain: a fifth Final Four box is closed', () => {
    const rows = table(10, 6, 4);
    expect(tickOpen(rows, nth(rows, 5), 'finalFour')).toBe(false);
    expect(tickOpen(rows, nth(rows, 3), 'finalFour')).toBe(true);
    const three = table(10, 6, 3);
    expect(tickOpen(three, nth(three, 5), 'finalFour')).toBe(true);
  });

  it('standings chain: the Final Four on a team off the play-offs is closed once the play-offs are full', () => {
    const rows = table(10, 8, 2);
    expect(tickOpen(rows, nth(rows, 9), 'finalFour')).toBe(false);
    expect(tickOpen(rows, nth(rows, 7), 'finalFour')).toBe(true);
    const seven = table(10, 7, 2);
    expect(tickOpen(seven, nth(seven, 9), 'finalFour')).toBe(true);
  });

  it("standings chain: the row's own tick is not counted against it, whether or not it is among the rows", () => {
    const eight = table(8, 8);
    const own = nth(eight, 0);
    expect(tickOpen(eight, { ...own, playOffs: false }, 'playOffs')).toBe(true);
  });
});

describe('finalPlaceOpen (R-78)', () => {
  it('standings chain: the final place box is open only on a Final Four team', () => {
    expect(finalPlaceOpen(row(1, { finalFour: true }))).toBe(true);
    expect(finalPlaceOpen(row(1, { finalFour: false }))).toBe(false);
    expect(finalPlaceOpen(row(1))).toBe(false);
  });
});
