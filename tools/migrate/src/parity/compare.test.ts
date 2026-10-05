import {
  CrowdOdds,
  MatchPrediction,
  Odds,
  Points,
  recalculateTournament,
  sportbetRules,
  StandingsOdds,
  StandingsPoints,
  type PointsRows,
  type StandingsRow,
  type StoredMatchRow,
  type SurvivalPoints,
  type TournamentInputs,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { RefusedPoints } from '../map';
import {
  compareTournament,
  keyedRows,
  type ParitySides,
  type ParityTable,
  type TableParity,
} from './compare';

type Name = (typeof GOLDEN.players)[number];
type TeamName = (typeof GOLDEN.teams)[number];

/** The golden inputs as the reader loads them: stored odds and survival rows. */
const STORED = {
  game_odds: GOLDEN_POINTS.game_odds,
  point_survivals: GOLDEN_POINTS.point_survivals,
};

const rowsOf = (inputs: TournamentInputs): PointsRows => {
  const { odds, matches, standings, survival } = unwrap(
    recalculateTournament(inputs, sportbetRules),
  );
  return { odds, matches, standings, survival };
};

/** golden-points.json's 25 entries, as all three sides hold them. */
const GOLDEN_ROWS = rowsOf(goldenInputs(STORED));

const NONE: RefusedPoints = {
  matches: [],
  standings: [],
  survival: [],
  odds: [],
};

const sides = (over: Partial<ParitySides> = {}): ParitySides => ({
  production: GOLDEN_ROWS,
  oldApp: GOLDEN_ROWS,
  newCode: GOLDEN_ROWS,
  refused: NONE,
  scored: new Set([gameNo(1), gameNo(2), gameNo(3)]),
  ...over,
});

const hundredths = (value: number) => unwrap(Points.ofHundredths(value));
const who = (name: Name) => NAME_IDS.player(name);

/** `rows` with one match row changed. */
function withMatch(
  rows: PointsRows,
  name: Name,
  game: 1 | 2 | 3,
  change: (row: StoredMatchRow) => StoredMatchRow,
): PointsRows {
  return {
    ...rows,
    matches: rows.matches.map((row) =>
      row.player === who(name) && row.game === gameNo(game) ? change(row) : row,
    ),
  };
}

/** `rows` with one standings row changed. */
function withStandings(
  rows: PointsRows,
  name: Name,
  team: TeamName,
  change: (row: StandingsRow) => StandingsRow,
): PointsRows {
  return {
    ...rows,
    standings: rows.standings.map((row) =>
      row.player === who(name) && row.team === NAME_IDS.team(team)
        ? change(row)
        : row,
    ),
  };
}

/** `rows` with one survival row changed. */
function withSurvival(
  rows: PointsRows,
  name: Name,
  round: 1 | 2,
  change: (row: SurvivalPoints) => SurvivalPoints,
): PointsRows {
  return {
    ...rows,
    survival: rows.survival.map((row) =>
      row.player === who(name) && row.round === round ? change(row) : row,
    ),
  };
}

const tableOf = (result: readonly TableParity[], table: ParityTable) => {
  const found = result.find((each) => each.table === table);
  if (found === undefined) throw new Error(`no ${table}`);
  return found;
};

const counts = (result: readonly TableParity[]) =>
  Object.fromEntries(result.map(({ table, counts: c }) => [table, c]));

const only = (result: readonly TableParity[], table: ParityTable) => {
  const [row, ...rest] = tableOf(result, table).rows;
  expect(rest).toEqual([]);
  return row;
};

describe('compareTournament', () => {
  it('classes every row match when the three sides agree', () => {
    expect(counts(compareTournament(sides()))).toEqual({
      point_results: { match: 9, stale: 0, 'new-code-wrong': 0, refused: 0 },
      point_standings: { match: 8, stale: 0, 'new-code-wrong': 0, refused: 0 },
      point_survivals: { match: 5, stale: 0, 'new-code-wrong': 0, refused: 0 },
      game_odds: { match: 3, stale: 0, 'new-code-wrong': 0, refused: 0 },
    });
  });

  it('classes a row stale when only production differs, one hundredth apart', () => {
    const production = withMatch(GOLDEN_ROWS, 'ada', 1, (row) => ({
      ...row,
      points: { ...row.points, full: hundredths(12_549) },
    }));
    const result = compareTournament(sides({ production }));
    expect(tableOf(result, 'point_results').counts).toEqual({
      match: 8,
      stale: 1,
      'new-code-wrong': 0,
      refused: 0,
    });
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('ada'), game: gameNo(1) },
      class: 'stale',
      differences: [
        {
          column: 'full_points',
          production: '125.49',
          oldApp: '125.50',
          newCode: '125.50',
        },
      ],
    });
  });

  it('classes a row new-code-wrong when the old app differs, whatever production says', () => {
    const planted = withMatch(GOLDEN_ROWS, 'ben', 2, (row) => ({
      ...row,
      points: { ...row.points, winner: hundredths(7_951) },
    }));
    const result = compareTournament(
      sides({ production: planted, oldApp: planted }),
    );
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('ben'), game: gameNo(2) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'winner_points',
          production: '79.51',
          oldApp: '79.51',
          newCode: '79.50',
        },
      ],
    });
  });

  it('classes a row only the old app has as new-code-wrong: a missing row differs', () => {
    const ada = GOLDEN_ROWS.matches.find(
      (row) => row.player === who('ada') && row.game === gameNo(1),
    );
    if (ada === undefined) throw new Error('no ada / 1');
    const oldApp = {
      ...GOLDEN_ROWS,
      matches: [...GOLDEN_ROWS.matches, { ...ada, player: who('dan') }],
    };
    const result = compareTournament(sides({ oldApp }));
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('dan'), game: gameNo(1) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'row',
          production: 'no row',
          oldApp: 'present',
          newCode: 'no row',
        },
      ],
    });
  });

  it('classes a row only the new code has as new-code-wrong: an extra row differs', () => {
    const ada = GOLDEN_ROWS.matches.find(
      (row) => row.player === who('ada') && row.game === gameNo(1),
    );
    if (ada === undefined) throw new Error('no ada / 1');
    const newCode = {
      ...GOLDEN_ROWS,
      matches: [...GOLDEN_ROWS.matches, { ...ada, player: who('dan') }],
    };
    expect(
      only(compareTournament(sides({ newCode })), 'point_results'),
    ).toEqual({
      subject: { table: 'point_results', player: who('dan'), game: gameNo(1) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'row',
          production: 'no row',
          oldApp: 'no row',
          newCode: 'present',
        },
      ],
    });
  });

  it('classes a row production lacks but both recalculations hold as stale', () => {
    const production = {
      ...GOLDEN_ROWS,
      survival: GOLDEN_ROWS.survival.filter(
        (row) => !(row.player === who('ada') && row.round === 2),
      ),
    };
    expect(
      only(compareTournament(sides({ production })), 'point_survivals'),
    ).toMatchObject({
      class: 'stale',
      differences: [
        {
          column: 'row',
          production: 'no row',
          oldApp: 'present',
          newCode: 'present',
        },
      ],
    });
  });

  it('classes a survival row whose team differs new-code-wrong, by the stored row', () => {
    const oldApp = withSurvival(GOLDEN_ROWS, 'ada', 1, (row) => ({
      ...row,
      team: NAME_IDS.team('OLY'),
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_survivals'),
    ).toMatchObject({
      class: 'new-code-wrong',
      differences: [{ column: 'team_id', oldApp: NAME_IDS.team('OLY') }],
    });
  });

  it('classes a row the reader refused, or whose prediction it refused, refused, whatever the sides say', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'cai', 1, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    const result = compareTournament(
      sides({
        oldApp,
        refused: {
          ...NONE,
          matches: [{ player: who('cai'), game: gameNo(1) }],
        },
      }),
    );
    expect(tableOf(result, 'point_results').counts).toEqual({
      match: 8,
      stale: 0,
      'new-code-wrong': 0,
      refused: 1,
    });
    expect(only(result, 'point_results')).toEqual({
      subject: { table: 'point_results', player: who('cai'), game: gameNo(1) },
      class: 'refused',
      differences: [],
    });
  });

  it("classes every match row of a game whose odds were refused refused: the new code scores it at CO-5's 1.0", () => {
    const result = compareTournament(
      sides({ refused: { ...NONE, odds: [gameNo(2)] } }),
    );
    expect(counts(result)).toMatchObject({
      point_results: { match: 6, stale: 0, 'new-code-wrong': 0, refused: 3 },
      game_odds: { match: 2, stale: 0, 'new-code-wrong': 0, refused: 1 },
    });
  });

  it("compares no odds of a game without a result: sportbet's blank row is its own", () => {
    const [first] = GOLDEN_ROWS.odds;
    if (first === undefined) throw new Error('no odds');
    const blank = { game: gameNo(4), odds: first.odds };
    const production = { ...GOLDEN_ROWS, odds: [...GOLDEN_ROWS.odds, blank] };
    const result = compareTournament(sides({ production, oldApp: production }));
    expect(tableOf(result, 'game_odds').counts).toEqual({
      match: 3,
      stale: 0,
      'new-code-wrong': 0,
      refused: 0,
    });
  });

  it("compares a match row's columns as sportbet stores them since 5de13bd: no odds_points", () => {
    const [row] = keyedRows(
      GOLDEN_ROWS,
      'point_results',
      sides().scored,
    ).values();
    expect(Object.keys(row?.cells ?? {})).toEqual([
      'winner_points',
      'difference_points',
      'bingo_points',
      'odds',
      'full_points',
      'streak_bonus',
    ]);
  });

  it("classes a cleared game's rows production still holds stale: sportbet's own clear removes them (c6ee97e)", () => {
    const cleared = gameNo(3);
    const recalculated = {
      ...GOLDEN_ROWS,
      matches: GOLDEN_ROWS.matches.filter(({ game }) => game !== cleared),
      odds: GOLDEN_ROWS.odds.filter(({ game }) => game !== cleared),
    };
    const held = GOLDEN_ROWS.matches.length - recalculated.matches.length;
    expect(held).toBeGreaterThan(0);
    const result = compareTournament(
      sides({
        oldApp: recalculated,
        newCode: recalculated,
        scored: new Set([gameNo(1), gameNo(2)]),
      }),
    );
    expect(tableOf(result, 'point_results').counts).toEqual({
      match: recalculated.matches.length,
      stale: held,
      'new-code-wrong': 0,
      refused: 0,
    });
    for (const row of tableOf(result, 'point_results').rows) {
      expect(row.differences).toEqual([
        {
          column: 'row',
          production: 'present',
          oldApp: 'no row',
          newCode: 'no row',
        },
      ]);
    }
  });
});

describe('compareTournament, on the edge cases of inventory section 6', () => {
  it('a Euroleague knockout game scores like a group game (2): a winner bonus the old app withholds is found', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'ada', 3, (row) => ({
      ...row,
      points: { ...row.points, winner: Points.ZERO },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      class: 'new-code-wrong',
      differences: [
        {
          column: 'winner_points',
          production: '79.50',
          oldApp: '0.00',
          newCode: '79.50',
        },
      ],
    });
  });

  it('negative difference points (3): -45.00 and -44.99 differ', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'ada', 2, (row) => ({
      ...row,
      points: { ...row.points, margin: hundredths(-4_499) },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      differences: [
        {
          column: 'difference_points',
          production: '-45.00',
          oldApp: '-44.99',
          newCode: '-45.00',
        },
      ],
    });
  });

  it('a missing odds row scores at 1.0 (5): where the old app had a row, every column the 1.0 changes is found', () => {
    const newCode = rowsOf(
      goldenInputs({
        ...STORED,
        game_odds: Object.fromEntries(
          Object.entries(STORED.game_odds).filter(([key]) => key !== 'EL h2'),
        ),
      }),
    );
    const result = compareTournament(sides({ newCode }));
    expect(counts(result)).toMatchObject({
      point_results: { match: 6, 'new-code-wrong': 3 },
      game_odds: { match: 2, 'new-code-wrong': 1 },
    });
    expect(
      tableOf(result, 'point_results').rows.map(({ subject, differences }) => [
        subject,
        differences,
      ]),
    ).toEqual([
      [
        { table: 'point_results', player: who('ada'), game: gameNo(2) },
        [
          {
            column: 'odds',
            production: '1.59',
            oldApp: '1.59',
            newCode: '1.00',
          },
        ],
      ],
      [
        { table: 'point_results', player: who('ben'), game: gameNo(2) },
        [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '100.00',
          },
          {
            column: 'odds',
            production: '0.59',
            oldApp: '0.59',
            newCode: '1.00',
          },
          {
            column: 'full_points',
            production: '114.50',
            oldApp: '114.50',
            newCode: '135.00',
          },
        ],
      ],
      [
        { table: 'point_results', player: who('cai'), game: gameNo(2) },
        [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '100.00',
          },
          {
            column: 'odds',
            production: '0.59',
            oldApp: '0.59',
            newCode: '1.00',
          },
          {
            column: 'full_points',
            production: '119.50',
            oldApp: '119.50',
            newCode: '140.00',
          },
        ],
      ],
    ]);
  });

  it('contrarian odds (5): the draw nobody picked, 2.59, and 2.58 differ', () => {
    const [first, ...rest] = GOLDEN_ROWS.odds;
    if (first === undefined) throw new Error('no odds');
    const draw = unwrap(Odds.ofHundredths(258));
    const oldApp: PointsRows = {
      ...GOLDEN_ROWS,
      odds: [
        {
          game: first.game,
          odds: CrowdOdds.stored(first.odds.home, first.odds.away, draw),
        },
        ...rest,
      ],
    };
    expect(
      only(compareTournament(sides({ oldApp })), 'game_odds'),
    ).toMatchObject({
      subject: { table: 'game_odds', game: gameNo(1) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'draw_odds',
          production: '2.59',
          oldApp: '2.58',
          newCode: '2.59',
        },
      ],
    });
  });

  it('a generated row (6) is compared like any other: odds 0, no serija', () => {
    const inputs = goldenInputs(STORED);
    const withFillIn: TournamentInputs = {
      ...inputs,
      predictions: [
        ...inputs.predictions,
        unwrap(
          MatchPrediction.stored({
            player: who('dan'),
            game: gameNo(1),
            home: 81,
            away: 80,
            origin: 'fill-in',
            filledInAt: null,
          }),
        ),
      ],
    };
    const newCode = rowsOf(withFillIn);
    const dan = newCode.matches.find((row) => row.player === who('dan'));
    expect([dan?.points.odds.toString(), dan?.serija.toString()]).toEqual([
      '0.00',
      '0.00',
    ]);
    const oldApp = withMatch(newCode, 'dan', 1, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    const result = compareTournament(
      sides({ production: newCode, oldApp, newCode }),
    );
    expect(only(result, 'point_results')).toMatchObject({
      subject: { player: who('dan'), game: gameNo(1) },
      differences: [
        {
          column: 'streak_bonus',
          production: '0.00',
          oldApp: '10.00',
          newCode: '0.00',
        },
      ],
    });
  });

  it('the serija (8): a bonus walked in id order instead of tip-off order is found', () => {
    const oldApp = withMatch(GOLDEN_ROWS, 'cai', 3, (row) => ({
      ...row,
      serija: hundredths(1_000),
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_results'),
    ).toMatchObject({
      differences: [
        {
          column: 'streak_bonus',
          production: '20.00',
          oldApp: '10.00',
          newCode: '20.00',
        },
      ],
    });
  });

  it('standings (9): null and 0 differ', () => {
    const oldApp = withStandings(GOLDEN_ROWS, 'ada', 'REA', (row) => ({
      ...row,
      playOffs: { ...row.playOffs, odds: StandingsOdds.ZERO },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_standings'),
    ).toMatchObject({
      subject: {
        table: 'point_standings',
        player: who('ada'),
        team: NAME_IDS.team('REA'),
      },
      differences: [
        {
          column: 'quarterfinal_odds',
          production: 'null',
          oldApp: '0.0000',
          newCode: 'null',
        },
      ],
    });
  });

  it('standings (12): compared to four places, 380.0000 and 380.0001 differ', () => {
    const oldApp = withStandings(GOLDEN_ROWS, 'ada', 'ZAL', (row) => ({
      ...row,
      place: {
        ...row.place,
        points: unwrap(StandingsPoints.ofTenThousandths(3_800_001)),
      },
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_standings'),
    ).toMatchObject({
      differences: [
        {
          column: 'group_position_points',
          production: '380.0000',
          oldApp: '380.0001',
          newCode: '380.0000',
        },
      ],
    });
  });

  it('survival (10): a running total the old app resets is found, by the stored row', () => {
    const oldApp = withSurvival(GOLDEN_ROWS, 'ada', 2, (row) => ({
      ...row,
      points: Points.ZERO,
    }));
    expect(
      only(compareTournament(sides({ oldApp })), 'point_survivals'),
    ).toMatchObject({
      subject: {
        table: 'point_survivals',
        player: who('ada'),
        round: 2,
        storedId: 2,
      },
      differences: [
        {
          column: 'survival_points',
          production: '22.00',
          oldApp: '0.00',
          newCode: '22.00',
        },
      ],
    });
  });

  it('multi-tournament players (11): a row the new code files under another tournament is missing here', () => {
    const newCode = {
      ...GOLDEN_ROWS,
      matches: GOLDEN_ROWS.matches.filter(
        (row) => !(row.player === who('ada') && row.game === gameNo(3)),
      ),
    };
    expect(
      only(compareTournament(sides({ newCode })), 'point_results'),
    ).toMatchObject({
      subject: { player: who('ada'), game: gameNo(3) },
      class: 'new-code-wrong',
      differences: [
        {
          column: 'row',
          production: 'present',
          oldApp: 'present',
          newCode: 'no row',
        },
      ],
    });
  });
});
