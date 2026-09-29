import { describe, expect, it } from 'vitest';
import type { PredictionOrigin } from '../prediction/match-prediction';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import type { Outcome } from '../score/score';
import { CrowdOdds, type Vote } from './crowd-odds';

const votes = (
  count: number,
  outcome: Outcome | null,
  origin: PredictionOrigin = 'real',
): Vote[] => Array.from({ length: count }, () => ({ origin, outcome }));

const printed = (odds: CrowdOdds) => ({
  home: odds.home.toString(),
  away: odds.away.toString(),
  draw: odds.draw.toString(),
});

describe('CO-1', () => {
  it('odds: log2 of votes over votes for the outcome', () => {
    // 10 votes on Zalgiris - Olympiacos: 8 home, 2 away.
    const odds = CrowdOdds.forGame(
      [...votes(8, 'home'), ...votes(2, 'away')],
      ruledRules,
    );
    expect(printed(odds)).toEqual({ home: '0.32', away: '2.32', draw: '4.32' });
    expect(odds.source).toBe('votes');
  });
});

describe('CO-3', () => {
  it('odds: an outcome nobody picked gets log2(votes / 0.5)', () => {
    const odds = CrowdOdds.forGame(votes(10, 'home'), ruledRules);
    expect(printed(odds)).toEqual({ home: '0.00', away: '4.32', draw: '4.32' });
  });
});

describe('CO-4', () => {
  it('odds: no votes gives 0 for every outcome', () => {
    expect(printed(CrowdOdds.forGame([], sportbetRules))).toEqual({
      home: '0.00',
      away: '0.00',
      draw: '0.00',
    });
    // Ruled: a game with only fill-ins has no votes (R-2).
    const onlyFillIns = CrowdOdds.forGame(
      votes(5, 'home', 'fill-in'),
      ruledRules,
    );
    expect(onlyFillIns.source).toBe('no-votes');
    expect(printed(onlyFillIns)).toEqual({
      home: '0.00',
      away: '0.00',
      draw: '0.00',
    });
  });

  it('odds: a prediction without both scores is never a vote', () => {
    const odds = CrowdOdds.forGame(
      [...votes(2, 'home'), ...votes(3, null)],
      sportbetRules,
    );
    expect(printed(odds)).toEqual({ home: '0.00', away: '2.00', draw: '2.00' });
  });
});

describe('CO-6', () => {
  // 10 real predictions, 8 Zalgiris and 2 Olympiacos; 5 absent players are
  // filled in with 3 Zalgiris and 2 Olympiacos.
  const game = [
    ...votes(8, 'home'),
    ...votes(2, 'away'),
    ...votes(3, 'home', 'fill-in'),
    ...votes(2, 'away', 'fill-in'),
  ];

  it('odds (sportbet): fill-ins are votes', () => {
    const odds = CrowdOdds.forGame(game, sportbetRules);
    expect(odds.home.toString()).toBe('0.45');
    expect(odds.away.toString()).toBe('1.91');
  });

  it('odds (ruled): only real predictions are votes', () => {
    const odds = CrowdOdds.forGame(game, ruledRules);
    expect(odds.home.toString()).toBe('0.32');
    expect(odds.away.toString()).toBe('2.32');
  });

  it('odds: every league scores on the same odds', () => {
    // The odds belong to the game: computed from every player's prediction,
    // whatever league the player is in. There is no league to pass, so a
    // league's own votes (league A alone: 5 home) cannot give it other odds.
    const leagueA = votes(5, 'home');
    const leagueB = [...votes(3, 'home'), ...votes(2, 'away')];
    const odds = CrowdOdds.forGame([...leagueA, ...leagueB], ruledRules);
    expect(printed(odds)).toEqual({ home: '0.32', away: '2.32', draw: '4.32' });
    expect(printed(CrowdOdds.forGame(leagueA, ruledRules))).not.toEqual(
      printed(odds),
    );
  });
});
