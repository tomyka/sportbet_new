import { describe, expect, it } from 'vitest';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { refuse } from '../shared/result';
import { player, team, teamOutcome, teamPick, unwrap } from '../testing';
import { StandingsPrediction, type TeamPick } from './standings-prediction';
import {
  scoreStandings,
  type StandingsLine,
  type TeamStandings,
} from './standings-scoring';
import { TeamOutcomes, type TeamOutcome } from './team-outcomes';

const predictionOf = (name: string, picks: readonly TeamPick[]) =>
  unwrap(StandingsPrediction.of(player(name), picks));

/** `size` players, player i saving the rows `rowsOf(i)` gives. */
const crowdOf = (size: number, rowsOf: (index: number) => TeamPick[]) =>
  Array.from({ length: size }, (_, index) =>
    predictionOf(`p${String(index)}`, rowsOf(index)),
  );

const outcomesOf = (teams: readonly TeamOutcome[], tableIsFinal = true) =>
  unwrap(TeamOutcomes.of(teams, tableIsFinal));

const printed = (line: StandingsLine | undefined) => ({
  points: line?.points?.toString() ?? null,
  odds: line?.odds?.toString() ?? null,
});

/** The first player's row for `name`. */
function rowFor(
  everyone: readonly StandingsPrediction[],
  outcomes: TeamOutcomes,
  rules: RuleSet,
  name: string,
): TeamStandings | undefined {
  const first = everyone[0];
  if (first === undefined) throw new Error('no players');
  return unwrap(scoreStandings(first, everyone, outcomes, rules)).find(
    (row) => row.team === team(name),
  );
}

// Real Madrid finish 3rd.
const realThird = outcomesOf([teamOutcome('REA', { place: 3 })]);
const placeOf = (predicted: number, rules: RuleSet) =>
  printed(
    rowFor(
      [predictionOf('ada', [teamPick('REA', { place: predicted })])],
      realThird,
      rules,
      'REA',
    )?.place,
  );

describe('ST-3', () => {
  it('standings place: exact pays 190', () => {
    expect(placeOf(3, ruledRules)).toEqual({ points: '190.0000', odds: null });
  });

  it('standings place: each place off costs 10', () => {
    expect(placeOf(5, ruledRules).points).toBe('170.0000');
    expect(placeOf(20, ruledRules).points).toBe('20.0000');
    expect(placeOf(2, sportbetRules)).toEqual({
      points: '180.0000',
      odds: null,
    });
  });

  it('standings place: never below 0', () => {
    const lastPlace = outcomesOf([teamOutcome('REA', { place: 20 })]);
    const row = rowFor(
      [predictionOf('ada', [teamPick('REA', { place: 1 })])],
      lastPlace,
      sportbetRules,
      'REA',
    );
    expect(printed(row?.place)).toEqual({ points: '0.0000', odds: null });
  });

  const beforeTheTable = (rules: RuleSet) =>
    printed(
      rowFor(
        [predictionOf('ada', [teamPick('REA', { place: 3 })])],
        outcomesOf([teamOutcome('REA')]),
        rules,
        'REA',
      )?.place,
    );

  it('standings place (sportbet): before the table is entered a place scores 0', () => {
    expect(beforeTheTable(sportbetRules)).toEqual({
      points: '0.0000',
      odds: null,
    });
  });

  it('standings place (ruled): before the table is entered a place is not scored yet (null, ST-6)', () => {
    expect(beforeTheTable(ruledRules)).toEqual({ points: null, odds: null });
  });
});

describe('ST-4', () => {
  // 10 players gave Real Madrid a place; 2 said 3rd.
  const tenPlayers = crowdOf(10, (index) => [
    teamPick('REA', { place: index < 2 ? 3 : 5 }),
  ]);

  it('standings place: an exact call is multiplied by its crowd odds', () => {
    // log2(10/2) = 2.3219: 190 x 3.3219 = 631.161.
    expect(
      printed(rowFor(tenPlayers, realThird, sportbetRules, 'REA')?.place),
    ).toEqual({
      points: '631.1610',
      odds: '2.3219',
    });
  });

  it('standings place (ruled): an exact call gets no crowd bonus', () => {
    // R-35: positions are flat.
    expect(
      printed(rowFor(tenPlayers, realThird, ruledRules, 'REA')?.place),
    ).toEqual({
      points: '190.0000',
      odds: null,
    });
  });

  it('standings place: a near miss gets no crowd bonus', () => {
    // Jonas said 4th; 2 of 10 said 4th.
    const nearMiss = crowdOf(10, (index) => [
      teamPick('REA', { place: index < 2 ? 4 : 6 }),
    ]);
    for (const rules of [sportbetRules, ruledRules]) {
      expect(printed(rowFor(nearMiss, realThird, rules, 'REA')?.place)).toEqual(
        {
          points: '180.0000',
          odds: null,
        },
      );
    }
  });

  it('standings place: everyone agreeing pays the plain 190', () => {
    const allThird = crowdOf(10, () => [teamPick('REA', { place: 3 })]);
    expect(
      printed(rowFor(allThird, realThird, sportbetRules, 'REA')?.place),
    ).toEqual({
      points: '190.0000',
      odds: '0.0000',
    });
  });
});

describe('ST-5', () => {
  const zalgirisIn = outcomesOf([teamOutcome('ZAL', { playOffs: true })]);
  // 10 players saved Zalgiris's play-off column; 4 ticked it.
  const tenSaved = crowdOf(10, (index) => [
    teamPick('ZAL', { playOffs: index < 4 }),
  ]);

  it('standings tick: a correct play-off tick pays 60 times its crowd odds', () => {
    // 60 x (1 + log2(10/4) = 1.3219) = 139.314.
    expect(
      printed(rowFor(tenSaved, zalgirisIn, sportbetRules, 'ZAL')?.playOffs),
    ).toEqual({
      points: '139.3140',
      odds: '1.3219',
    });
  });

  it('standings tick (ruled): the crowd is every standings player', () => {
    // 10 more players saved something, but not Zalgiris's column: 20 in all.
    const twenty = [
      ...tenSaved,
      ...crowdOf(10, () => [teamPick('OLY', { place: 2 })]),
    ];
    expect(
      printed(rowFor(twenty, zalgirisIn, ruledRules, 'ZAL')?.playOffs),
    ).toEqual({
      points: '199.3140',
      odds: '2.3219',
    });
    expect(
      printed(rowFor(twenty, zalgirisIn, sportbetRules, 'ZAL')?.playOffs),
    ).toEqual({
      points: '139.3140',
      odds: '1.3219',
    });
  });

  it('standings tick (ruled): every player who saved anything counts, complete table or not', () => {
    // R-36: 28 of 30 players saved something, 6 ticked Zalgiris for the
    // Final Four and Zalgiris got there: 120 x (1 + log2(28/6)) = 386.688.
    const thirty = crowdOf(30, (index) =>
      index < 6
        ? [teamPick('ZAL', { finalFour: true })]
        : index < 28
          ? [teamPick('REA', { place: 7 })]
          : [teamPick('ZAL')],
    );
    const finalFour = outcomesOf([teamOutcome('ZAL', { finalFour: true })]);
    expect(
      printed(rowFor(thirty, finalFour, ruledRules, 'ZAL')?.finalFour),
    ).toEqual({
      points: '386.6880',
      odds: '2.2224',
    });
  });

  it('standings tick: a wrong tick pays 0', () => {
    const outcomes = outcomesOf([
      teamOutcome('ZAL', { playOffs: true }),
      teamOutcome('REA'),
    ]);
    // A tick for a team that did not get there, and no tick for one that did.
    const ada = predictionOf('ada', [
      teamPick('REA', { playOffs: true }),
      teamPick('ZAL', { playOffs: false }),
    ]);
    for (const rules of [sportbetRules, ruledRules]) {
      const rows = unwrap(scoreStandings(ada, [ada], outcomes, rules));
      expect(rows.map((row) => printed(row.playOffs))).toEqual([
        { points: '0.0000', odds: null },
        { points: '0.0000', odds: null },
      ]);
    }
  });
});

describe('ST-6', () => {
  // Golden `ada / FEN`: nobody is ticked for the Final Four; the play-offs
  // are live, and Fenerbahce are neither in them nor ticked.
  const outcomes = outcomesOf([
    teamOutcome('ZAL', { place: 1, playOffs: true }),
    teamOutcome('FEN', { place: 4 }),
  ]);
  const ada = predictionOf('ada', [teamPick('FEN', { place: 4 })]);
  const fen = unwrap(scoreStandings(ada, [ada], outcomes, sportbetRules))[0];

  it('standings: an undecided stage stores null', () => {
    expect(printed(fen?.finalFour)).toEqual({ points: null, odds: null });
    expect(printed(fen?.final)).toEqual({ points: null, odds: null });
  });

  it('standings: a decided stage the prediction missed stores 0', () => {
    expect(printed(fen?.playOffs)).toEqual({ points: '0.0000', odds: null });
  });
});

describe('ST-7', () => {
  const final = outcomesOf([
    teamOutcome('REA', { finalPlace: 1 }),
    teamOutcome('OLY', { finalPlace: 2 }),
  ]);
  const finalRow = (
    everyone: readonly StandingsPrediction[],
    name: string,
    rules: RuleSet = sportbetRules,
  ) => printed(rowFor(everyone, final, rules, name)?.final);
  const namedIn = (
    name: string,
    size: number,
    placeOf: (index: number) => 1 | 2,
  ) =>
    crowdOf(size, (index) => [teamPick(name, { finalPlace: placeOf(index) })]);

  it('standings final: the champion pays 36 times its crowd odds', () => {
    // 6 players named Real Madrid in the final, 3 as champion: 36 x 2 = 72.
    expect(
      finalRow(
        namedIn('REA', 6, (index) => (index < 3 ? 1 : 2)),
        'REA',
      ),
    ).toEqual({
      points: '72.0000',
      odds: '1.0000',
    });
  });

  it('standings final: the runner-up pays 30', () => {
    expect(
      finalRow(
        namedIn('OLY', 5, () => 2),
        'OLY',
      ),
    ).toEqual({
      points: '30.0000',
      odds: '0.0000',
    });
    // 2 of 5 said 2nd: 30 x (1 + 1.3219) = 69.657.
    expect(
      finalRow(
        namedIn('OLY', 5, (index) => (index < 2 ? 2 : 1)),
        'OLY',
      ),
    ).toEqual({
      points: '69.6570',
      odds: '1.3219',
    });
  });

  it('standings final: swapped finalists pay 27 and no bonus', () => {
    expect(
      finalRow(
        namedIn('REA', 6, () => 2),
        'REA',
      ),
    ).toEqual({
      points: '27.0000',
      odds: null,
    });
  });

  it('standings final (ruled): the crowd is every standings player', () => {
    // The same 6 finalists plus 6 players who saved only a place: 12.
    const twelve = [
      ...namedIn('REA', 6, (index) => (index < 3 ? 1 : 2)),
      ...crowdOf(6, () => [teamPick('ZAL', { place: 1 })]),
    ];
    // 36 x (1 + log2(12/3) = 2) = 108.
    expect(finalRow(twelve, 'REA', ruledRules)).toEqual({
      points: '108.0000',
      odds: '2.0000',
    });
  });
});

describe('ST-8', () => {
  it('standings (ruled): places are scored only from the final regular-season table', () => {
    // An admin enters a mid-season table in round 20.
    const midSeason = outcomesOf([teamOutcome('REA', { place: 3 })], false);
    const ada = [predictionOf('ada', [teamPick('REA', { place: 3 })])];
    expect(
      printed(rowFor(ada, midSeason, sportbetRules, 'REA')?.place).points,
    ).toBe('190.0000');
    // Not scored yet, as ST-6 stores a stage nobody has reached (R-14).
    expect(printed(rowFor(ada, midSeason, ruledRules, 'REA')?.place)).toEqual({
      points: null,
      odds: null,
    });
    const final = outcomesOf([teamOutcome('REA', { place: 3 })], true);
    expect(printed(rowFor(ada, final, ruledRules, 'REA')?.place).points).toBe(
      '190.0000',
    );
  });

  it('standings (ruled): once the final table is in, a place never predicted scores 0', () => {
    const final = outcomesOf([teamOutcome('REA', { place: 3 })], true);
    const ada = [predictionOf('ada', [teamPick('REA', { playOffs: true })])];
    expect(printed(rowFor(ada, final, ruledRules, 'REA')?.place).points).toBe(
      '0.0000',
    );
  });

  it('standings (ruled): saving ticks updates points at once', () => {
    const ada = [predictionOf('ada', [teamPick('ZAL', { playOffs: true })])];
    const before = outcomesOf([teamOutcome('ZAL')]);
    expect(
      printed(rowFor(ada, before, ruledRules, 'ZAL')?.playOffs).points,
    ).toBeNull();
    // The admin saves Zalgiris's play-off tick: the points follow at once.
    const after = outcomesOf([teamOutcome('ZAL', { playOffs: true })]);
    expect(
      printed(rowFor(ada, after, ruledRules, 'ZAL')?.playOffs).points,
    ).toBe('60.0000');
  });

  it('standings (ruled): a corrected fact recalculates the points', () => {
    // R-37: Monaco 5th and Partizan 6th entered the wrong way round, then
    // swapped. The player who named Monaco 5th follows the correction.
    const columns = (monaco: number, partizan: number): TeamOutcome[] => [
      teamOutcome('MON', { place: monaco }),
      teamOutcome('PAR', { place: partizan }),
    ];
    const ada = [predictionOf('ada', [teamPick('MON', { place: 5 })])];
    expect(
      printed(rowFor(ada, outcomesOf(columns(6, 5)), ruledRules, 'MON')?.place)
        .points,
    ).toBe('180.0000');
    expect(
      printed(rowFor(ada, outcomesOf(columns(5, 6)), ruledRules, 'MON')?.place)
        .points,
    ).toBe('190.0000');
  });
});

describe('ST-9', () => {
  it('standings: odds and points keep four decimals', () => {
    const tenPlayers = crowdOf(10, (index) => [
      teamPick('REA', { place: index < 2 ? 3 : 5 }),
    ]);
    const place = rowFor(tenPlayers, realThird, sportbetRules, 'REA')?.place;
    expect(place?.points?.tenThousandths).toBe(6_311_610);
    expect(place?.odds?.tenThousandths).toBe(23_219);
    // Ranked to the cent (R-31).
    expect(place?.points?.toCents()).toBe(63_116);
  });
});

describe('stored standings rows (sportbet)', () => {
  // T1 finished 3rd and won the final; ada's stored row says place 0 and
  // final place 3, which sportbet's entry no longer allows.
  const outcomes = unwrap(
    TeamOutcomes.of([teamOutcome('T1', { place: 3, finalPlace: 1 })], true),
  );
  const ada = unwrap(
    StandingsPrediction.stored(player('ada'), [
      {
        team: team('T1'),
        place: 0,
        playOffs: null,
        finalFour: null,
        finalPlace: 3,
      },
    ]),
  );
  const [row] = unwrap(scoreStandings(ada, [ada], outcomes, sportbetRules));

  it('standings (sportbet): a stored place 0 is scored as a place', () => {
    expect(row?.place.points?.toString()).toBe('160.0000');
  });

  it('standings (sportbet): a stored third place pays from the 4x4 matrix', () => {
    expect(row?.final.points?.toString()).toBe('18.0000');
  });
});

describe('scoreStandings', () => {
  it('standings: a prediction missing from the crowd it is scored against is refused', () => {
    const outcomes = unwrap(TeamOutcomes.of([teamOutcome('ZAL')], true));
    const ada = predictionOf('ada', [teamPick('ZAL', { place: 1 })]);
    const ben = predictionOf('ben', [teamPick('ZAL', { place: 2 })]);
    expect(scoreStandings(ada, [ben], outcomes, ruledRules)).toEqual(
      refuse('not-in-crowd'),
    );
  });
});
