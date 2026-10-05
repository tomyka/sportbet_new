import {
  ok,
  Points,
  recalculateTournament,
  sportbetRules,
  type GameId,
  type PointsRows,
  type Result,
} from '@sportbet/domain';
import {
  gameNo,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  roundNo,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  DUMP_IDS,
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  type Dump,
} from '../../test/fixtures/sportbet-dump';
import { mapSportbet, type TableCount } from '../map';
import { compareTournament } from './compare';
import type { RulingsImpact } from './rulings';
import {
  describeTournament,
  namesOf,
  notCompared,
  parityOutcome,
  parityReport,
  renderParity,
  type Names,
} from './report';

const base = unwrap(
  recalculateTournament(
    goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    }),
    sportbetRules,
  ),
);
const ROWS: PointsRows = base;

const GAMES = new Map<GameId, string>([
  [gameNo(1), 'ZAL-OLY 2026-06-15'],
  [gameNo(2), 'REA-FEN 2026-06-15'],
  [gameNo(3), 'ZAL-FEN 2026-06-20'],
]);
/** The golden scenario's own names: its ids are its names (NAME_IDS). */
const NAMES: Names = {
  player: (id) => id,
  team: (id) => id,
  round: (number) => `EL E${String(number)}`,
  game: (id) => GAMES.get(id) ?? '?',
};

/** ada's EL h1 winner points off by a cent in the new code; ben's EL h2 serija lost from production. */
function planted() {
  const newCode: PointsRows = {
    ...ROWS,
    matches: ROWS.matches.map((row) =>
      row.player === NAME_IDS.player('ada') && row.game === gameNo(1)
        ? {
            ...row,
            points: {
              ...row.points,
              winner: unwrap(Points.ofHundredths(7_949)),
            },
          }
        : row,
    ),
  };
  const production: PointsRows = {
    ...ROWS,
    matches: ROWS.matches.map((row) =>
      row.player === NAME_IDS.player('cai') && row.game === gameNo(2)
        ? { ...row, serija: Points.ZERO }
        : row,
    ),
  };
  return compareTournament({
    production,
    oldApp: ROWS,
    newCode,
    refused: { matches: [], standings: [], survival: [], odds: [] },
    scored: new Set(GAMES.keys()),
  });
}

const RULINGS = ok({
  base,
  fields: [
    {
      field: 'positionsGetCrowdBonus' as const,
      label: 'ST-4, R-35: no crowd bonus on a table position',
      measuredWith: null,
      effect: {
        kind: 'changes' as const,
        rows: 4,
        players: 1,
        points: -7_600_000,
      },
    },
    {
      field: 'crowdOddsCountFilledIn' as const,
      label: 'CO-6, R-2, R-9: filled-in predictions are not crowd votes',
      measuredWith: {
        field: 'missingOddsScoreAtOne' as const,
        rules: 'CO-5, CO-7',
      },
      effect: {
        kind: 'changes' as const,
        rows: 3,
        players: 2,
        points: -590_000,
      },
    },
    {
      field: 'movedGameReopens' as const,
      label: 'LR-2, R-13: a moved game reopens only before its tip-off',
      measuredWith: null,
      effect: { kind: 'no-stored-row' as const },
    },
  ],
  ruled: { kind: 'changes' as const, rows: 7, players: 2, points: -7_000_000 },
  remainder: 1_190_000,
});

const described = (rulings: Result<RulingsImpact, string> = RULINGS) =>
  describeTournament({
    tournament: 'golden-el',
    tables: planted(),
    rulings,
    rankings: [
      {
        league: 2,
        players: 3,
        differences: [
          {
            player: NAME_IDS.player('ben'),
            username: 'ben',
            newCode: { rank: 2, totalCents: 97_850 },
            oldApp: null,
          },
        ],
      },
    ],
    names: NAMES,
  });

describe('the parity report', () => {
  it('names a new-code-wrong row by username and game, with all three values', () => {
    expect(described().wrong).toEqual([
      {
        table: 'point_results',
        row: 'ada, ZAL-OLY 2026-06-15',
        differences: [
          {
            column: 'winner_points',
            production: '79.50',
            oldApp: '79.50',
            newCode: '79.49',
          },
        ],
      },
    ]);
  });

  it('counts stale rows per table and per column, not one by one', () => {
    expect(described().stale.point_results).toEqual({ streak_bonus: 1 });
  });

  it('adds up the verdict over every tournament, a tournament not compared included', () => {
    const report = parityReport(
      '3eb95e7',
      'backup',
      [
        described(),
        notCompared(
          'other-el',
          'the sportbet recalculation was refused (odds-missing)',
        ),
      ],
      [],
    );
    expect([report.newCodeWrong, report.refused]).toEqual([1, 0]);
  });

  it('prints the counts, each wrong row, the stale columns, the rulings, the rankings, what it cannot check and the verdict', () => {
    const lines = renderParity(
      parityReport('3eb95e7', 'backup', [described()], []),
    );
    expect(lines.slice(0, 8)).toEqual([
      'parity against sportbet 3eb95e7, backup backup',
      '',
      'tournament golden-el',
      '  table                     match          stale new-code-wrong        refused',
      '  point_results                 7              1              1              0',
      '  point_standings               8              0              0              0',
      '  point_survivals               5              0              0              0',
      '  game_odds                     3              0              0              0',
    ]);
    expect(lines).toEqual(
      expect.arrayContaining([
        '  new-code-wrong point_results: ada, ZAL-OLY 2026-06-15',
        '    winner_points: production 79.50, old app 79.50, new code 79.49',
        '  stale point_results.streak_bonus: 1',
        '  rankings of league 2: 3 players, 1 differ',
        '    ben: rank 2 (978.50) by the new code, not ranked by sportbet',
        '  broken survival runs (audit Q3)',
      ]),
    );
    const rulings = lines.indexOf(
      '  rulings against sportbetRules, each alone or on top of the ruling it needs:',
    );
    expect(lines.slice(rulings, rulings + 6)).toEqual([
      '  rulings against sportbetRules, each alone or on top of the ruling it needs:',
      '    ST-4, R-35: no crowd bonus on a table position: rows changed 4, players affected 1, points changed -760.0000',
      '    CO-6, R-2, R-9: filled-in predictions are not crowd votes, on top of CO-5, CO-7: rows changed 3, players affected 2, points changed -59.0000',
      '    LR-2, R-13: a moved game reopens only before its tip-off: changes no stored row',
      '    rulings acting together, beyond the lines above: points changed 119.0000',
      '    all rulings (ruledRules): rows changed 7, players affected 2, points changed -700.0000',
    ]);
    expect(lines.at(-1)).toBe('PARITY FAILS: 1 row new-code-wrong');
  });

  it('prints the remainder as not computed when a run was refused', () => {
    const refused = { kind: 'refused' as const, refusal: 'odds-missing' };
    const lines = renderParity(
      parityReport(
        '3eb95e7',
        'backup',
        [
          described(
            ok({
              base,
              fields: [
                {
                  field: 'missingOddsScoreAtOne' as const,
                  label:
                    'CO-5, CO-7: odds from the votes, never a missing row at 1.0',
                  measuredWith: null,
                  effect: refused,
                },
              ],
              ruled: refused,
              remainder: null,
            }),
          ),
        ],
        [],
      ),
    );
    const rulings = lines.indexOf(
      '  rulings against sportbetRules, each alone or on top of the ruling it needs:',
    );
    expect(lines.slice(rulings + 1, rulings + 4)).toEqual([
      '    CO-5, CO-7: odds from the votes, never a missing row at 1.0: refused (odds-missing)',
      '    rulings acting together, beyond the lines above: not computed, a run was refused',
      '    all rulings (ruledRules): refused (odds-missing)',
    ]);
  });

  it('holds when no row is new-code-wrong, stale rows or not', () => {
    expect(renderParity(parityReport('3eb95e7', 'backup', [], [])).at(-1)).toBe(
      'PARITY HOLDS',
    );
  });

  it("names the synthetic dump's players, games, teams and rounds from what the map loaded", () => {
    const mapped = mapSportbet(readRows(syntheticDump()));
    const tournament = mapped.tournaments.find(
      (each) => each.tournament.id === EUROLEAGUE,
    );
    if (tournament === undefined) throw new Error('no Euroleague tournament');
    const names = namesOf(
      tournament,
      new Map(mapped.players.map(({ id, username }) => [id, username])),
    );
    expect([
      names.player(DUMP_IDS.player('ada')),
      names.game(DUMP_IDS.game(3)),
      names.team(DUMP_IDS.team('REA')),
      names.round(roundNo(2)),
    ]).toEqual(['ada', 'ZAL-FEN 2026-06-20', 'REA', 'EL E2']);
  });
});

describe("sportbet's recalculated rows the map dropped", () => {
  const cai = IDS.player('cai');
  /** The synthetic dump with cai's user_settings gone: the reader refuses cai. */
  const caiRefused = (): Dump => {
    const dump = syntheticDump();
    return {
      ...dump,
      user_settings: dump.user_settings.filter((row) => row['user_id'] !== cai),
    };
  };
  const mappedOf = (dump: Dump) => {
    const mapped = mapSportbet(readRows(dump));
    const tournament = mapped.tournaments.find(
      (each) => each.tournament.id === EUROLEAGUE,
    );
    if (tournament === undefined) throw new Error('no Euroleague tournament');
    return { mapped, tournament };
  };
  /** cai's rows in golden-points.json: the rows his refusal drops. */
  const caiRows = Object.keys(GOLDEN_POINTS.point_results).filter((key) =>
    key.startsWith('cai / '),
  ).length;
  // The football tournament's row of each table is skipped with it.
  const FOOTBALL = { 'not-euroleague': 1 };

  it('a production or old-app row of a refused player is not new-code-wrong, and is counted as dropped', () => {
    const production = mappedOf(caiRefused());
    // sportbet's recalculation rewrites cai's rows, though the reader refused him.
    const recalculated = caiRefused();
    const oldApp = mappedOf({
      ...recalculated,
      point_results: recalculated.point_results.map((row) =>
        row['user_id'] === cai ? { ...row, full_points: '999.99' } : row,
      ),
    });
    const tables = compareTournament({
      production: production.tournament.production,
      oldApp: oldApp.tournament.production,
      newCode: production.tournament.production,
      refused: production.tournament.refusedPoints,
      scored: new Set([DUMP_IDS.game(1), DUMP_IDS.game(2), DUMP_IDS.game(3)]),
    });
    expect(tables.map(({ counts }) => counts['new-code-wrong'])).toEqual([
      0, 0, 0, 0,
    ]);
    expect(caiRows).toBe(3);
    expect(
      parityReport('3eb95e7', 'backup', [], oldApp.mapped.tables).oldAppDropped,
    ).toEqual({
      point_results: {
        skipped: FOOTBALL,
        refused: { 'depends-on-refused (player-without-settings)': caiRows },
      },
      point_standings: { skipped: FOOTBALL, refused: {} },
      point_survivals: { skipped: FOOTBALL, refused: {} },
      game_odds: { skipped: FOOTBALL, refused: {} },
    });
  });

  it('does not count a row the map refused or skipped for itself: those are compared, or equal copies', () => {
    const { mapped } = mappedOf(syntheticDump());
    const dropped = parityReport(
      '3eb95e7',
      'backup',
      [],
      mapped.tables,
    ).oldAppDropped;
    // dan's point_results row stays: it is refused through his prediction,
    // which the comparison counts as refused.
    expect(dropped.point_results).toEqual({ skipped: FOOTBALL, refused: {} });
  });

  it('prints the dropped rows per table, in the load report words, before what it cannot check', () => {
    const { mapped } = mappedOf(caiRefused());
    const lines = renderParity(
      parityReport('3eb95e7', 'backup', [], mapped.tables),
    );
    const start = lines.indexOf(
      "sportbet's recalculated rows not compared, as what they belong to did not load:",
    );
    expect(start).toBeGreaterThan(0);
    expect(lines.slice(start + 1, start + 5)).toEqual([
      '  point_results     skipped: not-euroleague 1; refused: depends-on-refused (player-without-settings) 3',
      '  point_standings   skipped: not-euroleague 1; refused: -',
      '  point_survivals   skipped: not-euroleague 1; refused: -',
      '  game_odds         skipped: not-euroleague 1; refused: -',
    ]);
    expect(start).toBeLessThan(lines.indexOf('cannot check:'));
  });
});

describe('the parity outcome', () => {
  const EMPTY = parityReport('3eb95e7', 'backup', [], []);
  /** One old-app table count: `own` refusals, and those `fromParent`. */
  const oldAppTable = (
    own: Record<string, number>,
    fromParent: {
      skipped: Record<string, number>;
      refused: Record<string, number>;
    },
  ): TableCount => ({
    table: 'point_results',
    read: 1,
    loaded: 0,
    skipped: fromParent.skipped,
    refused: { ...own, ...fromParent.refused },
    refusals: [],
    fromParent,
  });

  it('holds with exit 0 when no row is new-code-wrong and none is refused', () => {
    expect(parityOutcome(EMPTY)).toEqual({
      holds: true,
      newCodeWrong: 0,
      refused: 0,
      exitStatus: 0,
      reason: null,
      verdict: 'PARITY HOLDS',
    });
  });

  it('holds with exit 1 when a row could not be compared, and says so on the verdict line', () => {
    expect(parityOutcome({ ...EMPTY, refused: 1 })).toEqual({
      holds: true,
      newCodeWrong: 0,
      refused: 1,
      exitStatus: 1,
      reason: '1 row refused',
      verdict: 'PARITY HOLDS - 1 row refused (exit 1)',
    });
  });

  it("counts the old app's rows refused with their parent as refused, but not its own refusals nor what it skipped with a parent", () => {
    const report = parityReport(
      '3eb95e7',
      'backup',
      [],
      [
        oldAppTable(
          // A refusal of the row itself: classed by the comparison, not here.
          { 'not-a-decimal': 1 },
          {
            skipped: { 'not-euroleague': 1 },
            refused: { orphan: 2, 'depends-on-refused (duplicate-key)': 1 },
          },
        ),
      ],
    );
    expect(parityOutcome(report)).toMatchObject({
      holds: true,
      refused: 3,
      exitStatus: 1,
      verdict: 'PARITY HOLDS - 3 rows refused (exit 1)',
    });
    expect(
      parityOutcome(
        parityReport(
          '3eb95e7',
          'backup',
          [],
          [oldAppTable({}, { skipped: { 'not-euroleague': 1 }, refused: {} })],
        ),
      ),
    ).toMatchObject({ holds: true, refused: 0, exitStatus: 0 });
  });

  it('fails with exit 1 when a row is new-code-wrong, naming both counts', () => {
    expect(parityOutcome({ ...EMPTY, newCodeWrong: 3, refused: 1 })).toEqual({
      holds: false,
      newCodeWrong: 3,
      refused: 1,
      exitStatus: 1,
      reason: '3 rows new-code-wrong, 1 row refused',
      verdict: 'PARITY FAILS: 3 rows new-code-wrong, 1 row refused',
    });
  });

  it('ends the printed report with the verdict the outcome states', () => {
    const report = { ...EMPTY, refused: 2 };
    expect(renderParity(report).at(-1)).toBe(parityOutcome(report).verdict);
  });
});
