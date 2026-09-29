import { describe, expect, it } from 'vitest';
import { StandingsPoints } from '../points/standings-points';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { refuse } from '../shared/result';
import { gameNo, player, unwrap } from '../testing';
import { totalsAfterEachGame, type EarnedPoints } from './rank-history';

describe('RA-5', () => {
  // 38 games; ada earns 100 match points at game 1 and 1,640 standings
  // points paid after round 38, at game 38.
  const games = Array.from({ length: 38 }, (_, index) => gameNo(index + 1));
  const earned: EarnedPoints[] = [
    {
      player: player('ada'),
      kind: 'match',
      points: StandingsPoints.whole(100),
      atGame: gameNo(1),
    },
    {
      player: player('ada'),
      kind: 'standings',
      points: StandingsPoints.whole(1640),
      atGame: gameNo(38),
    },
  ];
  const adaAfter = (game: number, rules: typeof ruledRules) =>
    unwrap(totalsAfterEachGame(games, earned, rules))[game - 1]?.cents.get(
      player('ada'),
    );

  it('rank history (ruled): standings points appear from the game they were earned', () => {
    expect(adaAfter(1, ruledRules)).toBe(10_000);
    expect(adaAfter(37, ruledRules)).toBe(10_000);
    expect(adaAfter(38, ruledRules)).toBe(174_000);
  });

  it('rank history (sportbet): standings points are added to every past game', () => {
    expect(adaAfter(1, sportbetRules)).toBe(174_000);
  });

  it('rank history: match points always count from their game', () => {
    const late: EarnedPoints[] = [
      {
        player: player('ben'),
        kind: 'match',
        points: StandingsPoints.whole(50),
        atGame: gameNo(2),
      },
    ];
    for (const rules of [sportbetRules, ruledRules]) {
      const history = unwrap(totalsAfterEachGame(games, late, rules));
      expect(history[0]?.cents.get(player('ben'))).toBeUndefined();
      expect(history[1]?.cents.get(player('ben'))).toBe(5_000);
    }
  });
});

describe('totalsAfterEachGame', () => {
  it('rank history: points earned at a game not listed are refused', () => {
    const stray: EarnedPoints = {
      player: player('ada'),
      kind: 'survival',
      points: StandingsPoints.whole(12),
      atGame: gameNo(99),
    };
    expect(totalsAfterEachGame([gameNo(1)], [stray], ruledRules)).toEqual(
      refuse('points-at-unlisted-game'),
    );
  });
});
