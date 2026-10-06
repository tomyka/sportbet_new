import { describe, expect, it } from 'vitest';
import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Game } from '../round/game';
import type { Round } from '../round/round';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  makeGame,
  makeRound,
  roundNo,
  player,
  rate,
  score,
  team,
  unwrap,
} from '../testing';
import { MatchPrediction } from './match-prediction';
import { scoreMatch, winnerPointsAt, type MatchPoints } from './match-scoring';

const regular = makeRound({ number: 1 });
const knockout = makeRound({ number: 1, knockout: true });
const playOff = makeRound(
  { number: 1, stage: 'play-offs', rate: 2, survival: false },
  ruledRules,
);

const game = (home: string, away: string, result: readonly [number, number]) =>
  makeGame({
    id: 1,
    round: 1,
    home,
    away,
    tipOff: '2026-06-15T18:00:00Z',
    result,
  });

// Golden `EL h1`: Zalgiris 88 - Olympiacos 79, odds 0.59 / 1.59 / 2.59.
const zalOly = game('ZAL', 'OLY', [88, 79]);
const oddsOf = (home: number, away: number, draw: number) =>
  CrowdOdds.stored(
    unwrap(Odds.ofHundredths(home)),
    unwrap(Odds.ofHundredths(away)),
    unwrap(Odds.ofHundredths(draw)),
  );
const golden = oddsOf(59, 159, 259);

const real = (home: number | null, away: number | null) =>
  unwrap(
    MatchPrediction.enter({
      player: player('ada'),
      game: gameNo(1),
      home,
      away,
    }),
  );
const fillIn = (home: number, away: number) =>
  MatchPrediction.fillIn(
    player('dan'),
    gameNo(1),
    score(home, away),
    'fill-in',
    at('2026-06-15T20:00:00Z'),
  );

const scored = (
  prediction: MatchPrediction,
  on: Game = zalOly,
  round: Round = regular,
  odds: CrowdOdds = golden,
): MatchPoints => {
  const points = scoreMatch(prediction, on, round, odds);
  if (points === null) throw new Error('expected a points row');
  return points;
};

const printed = (points: MatchPoints) => ({
  winner: points.winner.toString(),
  margin: points.margin.toString(),
  bingo: points.bingo.toString(),
  full: points.full.toString(),
  odds: points.odds.toString(),
});

describe('MS-2', () => {
  it('score: an unanswered prediction produces no points row', () => {
    expect(scoreMatch(real(null, null), zalOly, regular, golden)).toBeNull();
  });

  it('score (sportbet): a stored home-only prediction is not filled in and scores nothing', () => {
    // Production holds half-typed predictions from before sportbet#287
    // refused them (R-15).
    const homeOnly = unwrap(
      MatchPrediction.stored({
        player: player('ada'),
        game: gameNo(1),
        home: 85,
        away: null,
        origin: 'real',
        filledInAt: null,
      }),
    );
    expect(homeOnly.hasBlankHomeScore()).toBe(false);
    expect(scoreMatch(homeOnly, zalOly, regular, golden)).toBeNull();
  });
});

describe('MS-3', () => {
  it('winner: the right winner pays (1 + odds) x 50', () => {
    expect(scored(real(85, 80)).winner.toString()).toBe('79.50');
  });

  it('winner: the wrong winner pays 0', () => {
    expect(scored(real(79, 88)).winner.toString()).toBe('0.00');
  });
});

describe('MS-4', () => {
  it('odds: a home call uses the home odds', () => {
    expect(scored(real(85, 80)).odds.toString()).toBe('0.59');
  });

  it("odds: a wrong call in a regular-season round stores the predicted outcome's odds", () => {
    // Golden `ben / EL h1`: 79-88, an away call that lost.
    expect(printed(scored(real(79, 88)))).toEqual({
      winner: '0.00',
      margin: '32.00',
      bingo: '0.00',
      full: '32.00',
      odds: '1.59',
    });
  });
});

describe('MS-5', () => {
  it('margin: 88-79 predicted 85-80 scores 46', () => {
    expect(scored(real(85, 80)).margin.toString()).toBe('46.00');
  });

  it('margin: a prediction 95 points off the margin scores -45', () => {
    // Golden `ada / EL h2`: Real Madrid 70 - Fenerbahce 95, predicted 120-50.
    const points = scored(real(120, 50), game('REA', 'FEN', [70, 95]));
    expect(points.margin.toString()).toBe('-45.00');
    expect(points.full.toString()).toBe('-45.00');
  });

  it('margin: the wrong winner keeps its margin points', () => {
    expect(scored(real(79, 88)).margin.toString()).toBe('32.00');
  });
});

describe('MS-6', () => {
  // Golden `EL h3`: Zalgiris 90 - Fenerbahce 85.
  const zalFen = game('ZAL', 'FEN', [90, 85]);

  // R-42 (sportbet #291) is in both sets: no RuleSet field, the same points.
  for (const rules of [sportbetRules, ruledRules]) {
    const set = rules === sportbetRules ? 'sportbet' : 'ruled';
    const entered = (home: number, away: number) =>
      unwrap(
        MatchPrediction.enter({
          player: player('ada'),
          game: gameNo(1),
          home,
          away,
        }),
      );
    const round = makeRound({ number: 1 }, rules);

    it(`exact score (${set}): pays bingo 50 on top of the winner and a full 50 margin`, () => {
      // Golden `ada / EL h3`: predicted 90-85.
      expect(printed(scored(entered(90, 85), zalFen, round))).toEqual({
        winner: '79.50',
        margin: '50.00',
        bingo: '50.00',
        full: '179.50',
        odds: '0.59',
      });
    });

    it(`exact margin (${set}): adds 20 to the margin points, with no bingo`, () => {
      // Golden `cai / EL h3`: predicted 95-90, the margin 5 but not the score.
      expect(printed(scored(entered(95, 90), zalFen, round))).toEqual({
        winner: '79.50',
        margin: '70.00',
        bingo: '0.00',
        full: '149.50',
        odds: '0.59',
      });
    });

    it(`exact score (${set}): earns no exact-margin bonus as well`, () => {
      const exact = scored(entered(90, 85), zalFen, round);
      expect(exact.margin.toString()).toBe('50.00');
      expect(exact.bingo.toString()).toBe('50.00');
    });

    it(`exact margin (${set}): the margin's size with the wrong sign is a miss of 10`, () => {
      // Golden `ben / EL h3`: predicted 85-90.
      const mirrored = scored(entered(85, 90), zalFen, round);
      expect(mirrored.margin.toString()).toBe('40.00');
      expect(mirrored.bingo.toString()).toBe('0.00');
    });

    it(`exact margin (${set}): the bonus is multiplied by the round rate`, () => {
      expect(printed(scored(entered(95, 90), zalFen, playOff))).toEqual({
        winner: '159.00',
        margin: '140.00',
        bingo: '0.00',
        full: '299.00',
        odds: '0.59',
      });
      expect(scored(entered(90, 85), zalFen, playOff).bingo.toString()).toBe(
        '100.00',
      );
    });
  }

  it('exact margin: a fill-in earns the 20 too', () => {
    // Fill-in 89-80 on a real 88-79: 50 + (50 + 20) = 120, no bingo.
    expect(printed(scored(fillIn(89, 80)))).toEqual({
      winner: '50.00',
      margin: '70.00',
      bingo: '0.00',
      full: '120.00',
      odds: '0.00',
    });
  });

  it('exact margin: a knockout round pays it as a regular one does', () => {
    expect(printed(scored(real(95, 90), zalFen, knockout))).toEqual(
      printed(scored(real(95, 90), zalFen, regular)),
    );
  });
});

describe('MS-7 and LR-4', () => {
  // Play-off game, Real Madrid 84 - Panathinaikos 78, predicted 85-80 at
  // home odds 0.32: winner 66, margin 49, bingo 0 = 115 before the rate.
  const reaPan = game('REA', 'PAN', [84, 78]);
  const odds = oddsOf(32, 232, 432);

  it('rate: every component is multiplied by the round rate', () => {
    expect(printed(scored(real(85, 80), reaPan, playOff, odds))).toEqual({
      winner: '132.00',
      margin: '98.00',
      bingo: '0.00',
      full: '230.00',
      odds: '0.32',
    });
    expect(scored(real(85, 80), reaPan, regular, odds).full.toString()).toBe(
      '115.00',
    );
  });

  it('points: full points are the sum of the rated components', () => {
    const points = scored(
      real(90, 85),
      game('ZAL', 'FEN', [90, 85]),
      playOff,
      golden,
    );
    expect(
      points.full.equals(points.winner.plus(points.margin).plus(points.bingo)),
    ).toBe(true);
    expect(points.full.toString()).toBe('359.00');
  });

  it('points: no odds points component (MS-7; sportbet 5de13bd dropped the column)', () => {
    for (const prediction of [real(85, 80), real(79, 88), fillIn(82, 76)]) {
      expect(scored(prediction)).not.toHaveProperty('oddsPoints');
    }
  });
});

describe('MS-8', () => {
  // Golden `ben / EL h3`, round E2 flagged knockout: Zalgiris 90 -
  // Fenerbahce 85, ben predicted 85-90.
  const zalFen = game('ZAL', 'FEN', [90, 85]);

  it('knockout round (sportbet): a wrong call stores odds 0', () => {
    expect(printed(scored(real(85, 90), zalFen, knockout))).toEqual({
      winner: '0.00',
      margin: '40.00',
      bingo: '0.00',
      full: '40.00',
      odds: '0.00',
    });
    expect(scored(real(85, 90), zalFen, regular).odds.toString()).toBe('1.59');
  });

  it('knockout round (ruled): no ruling changes MS-8, so a wrong call stores odds 0 too', () => {
    // The golden crowd for EL h3 (ada 90-85, ben 85-90, cai 95-90), with
    // the votes counted and the round flagged under the ruled set.
    const votes = (
      [
        [90, 85],
        [85, 90],
        [95, 90],
      ] as const
    ).map(([home, away]) =>
      unwrap(
        MatchPrediction.enter({
          player: player('ada'),
          game: gameNo(1),
          home,
          away,
        }),
      ),
    );
    const odds = CrowdOdds.forGame(votes, ruledRules);
    const ruledKnockout = makeRound({ number: 1, knockout: true }, ruledRules);
    const ben = unwrap(
      MatchPrediction.enter({
        player: player('ben'),
        game: gameNo(1),
        home: 85,
        away: 90,
      }),
    );
    expect(printed(scored(ben, zalFen, ruledKnockout, odds))).toEqual({
      winner: '0.00',
      margin: '40.00',
      bingo: '0.00',
      full: '40.00',
      odds: '0.00',
    });
    const ruledRegular = makeRound({ number: 1 }, ruledRules);
    expect(scored(ben, zalFen, ruledRegular, odds).odds.toString()).toBe(
      '1.59',
    );
  });

  it('knockout round: points equal the same prediction in a regular round', () => {
    for (const prediction of [
      real(85, 90),
      real(95, 80),
      real(95, 90),
      real(90, 85),
    ]) {
      expect(scored(prediction, zalFen, knockout).full).toEqual(
        scored(prediction, zalFen, regular).full,
      );
    }
  });
});

describe('MS-9', () => {
  it('points: every match component is a multiple of 0.5', () => {
    const oddsSets = [1, 2, 3, 7, 10, 15, 23, 30].flatMap((total) =>
      Array.from({ length: total }, (_, homeVotes) =>
        CrowdOdds.forGame(
          Array.from({ length: total }, (_, index) => ({
            origin: 'real' as const,
            outcome: index < homeVotes ? ('home' as const) : ('away' as const),
          })),
          sportbetRules,
        ),
      ),
    );
    const rounds = [regular, knockout, makeRound({ number: 1, rate: 3 })];
    const offHalf: string[] = [];
    for (const [home, away] of [
      [88, 79],
      [70, 95],
      [101, 100],
      [64, 118],
    ] as const) {
      const on = game('ZAL', 'OLY', [home, away]);
      for (const odds of oddsSets) {
        for (const round of rounds) {
          for (const prediction of [
            real(85, 80),
            real(79, 88),
            real(home, away),
            fillIn(82, 76),
          ]) {
            const points = scored(prediction, on, round, odds);
            for (const part of [
              points.winner,
              points.margin,
              points.bingo,
              points.full,
            ]) {
              if (!part.isMultipleOfHalf()) offHalf.push(part.toString());
            }
          }
        }
      }
    }
    expect(offHalf).toEqual([]);
  });
});

describe('MS-10', () => {
  // A level result production stored before sportbet#274 refused one
  // (R-38): 81-81 for Anadolu Efes - Virtus Bologna, Efes recorded the
  // winner; 10 votes, so the draw odds are log2(20) = 4.32.
  const level = unwrap(
    Game.stored({
      id: gameNo(1),
      round: roundNo(1),
      home: team('EFE'),
      away: team('VIR'),
      tipOff: at('2026-06-15T18:00:00Z'),
      result: score(81, 81),
      recordedWinner: team('EFE'),
      lockedSince: null,
      postponed: false,
    }),
  );
  const tenVotes = oddsOf(74, 132, 432);

  it('level result (sportbet): nobody earns winner points in a regular round', () => {
    for (const prediction of [real(85, 80), real(80, 85)]) {
      const points = scored(prediction, level, regular, tenVotes);
      expect(points.winner.toString()).toBe('0.00');
      expect(points.extendsSerija).toBe(false);
    }
  });

  it('level result (sportbet): a knockout round pays half credit at the draw odds', () => {
    const efesCall = scored(real(85, 80), level, knockout, tenVotes);
    expect(efesCall.winner.toString()).toBe('133.00');
    expect(efesCall.odds.toString()).toBe('4.32');
    expect(efesCall.extendsSerija).toBe(false);
    // With draw odds 2.59 it would be 89.75: off the half-point grid.
    expect(
      scored(real(85, 80), level, knockout, golden).winner.toString(),
    ).toBe('89.75');
    expect(
      scored(real(80, 85), level, knockout, tenVotes).winner.toString(),
    ).toBe('0.00');
  });
});

describe('FI-3', () => {
  it('fill-in: a right winner pays the flat 50', () => {
    // Fill-in 82-76 on a real 88-79: 50 + (50 - |6 - 9|) = 97.
    expect(printed(scored(fillIn(82, 76)))).toEqual({
      winner: '50.00',
      margin: '47.00',
      bingo: '0.00',
      full: '97.00',
      odds: '0.00',
    });
  });

  it('fill-in: stored odds are 0', () => {
    expect(scored(fillIn(76, 82)).odds.toString()).toBe('0.00');
    expect(scored(fillIn(82, 76)).odds.toString()).toBe('0.00');
  });

  it('fill-in: an exact fill-in pays the bingo 50', () => {
    expect(scored(fillIn(88, 79)).full.toString()).toBe('150.00');
  });

  it('fill-in: never extends a serija, even when it named the winner', () => {
    expect(scored(fillIn(82, 76)).extendsSerija).toBe(false);
    expect(scored(real(85, 80)).extendsSerija).toBe(true);
  });
});

describe('CO-5', () => {
  it('odds (ruled): odds always come from the votes, so a missing row is a programmer error', () => {
    expect(() => CrowdOdds.missing(ruledRules)).toThrow(/always has odds/);
  });
});

describe('PointsFormat::winnerPointsAt', () => {
  const odds = (hundredths: number) => unwrap(Odds.ofHundredths(hundredths));

  it('odds panel: a right call is worth (1 + odds) x 50 x the round rate', () => {
    expect(winnerPointsAt(odds(59), rate(1)).hundredths).toBe(7950);
    expect(winnerPointsAt(odds(59), rate(2)).hundredths).toBe(15900);
    expect(winnerPointsAt(Odds.ZERO, rate(1)).hundredths).toBe(5000);
    expect(winnerPointsAt(odds(100), rate(3)).hundredths).toBe(30000);
  });
});
