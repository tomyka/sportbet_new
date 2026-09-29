import { gameOddsHundredths } from './crowd-ratio';
import { Odds } from '../points/odds';
import type { PredictionOrigin } from '../prediction/match-prediction';
import type { RuleSet } from '../rules/rule-set';
import type { Outcome } from '../score/score';

/** What a prediction contributes to a game's crowd odds. */
export interface Vote {
  readonly origin: PredictionOrigin;
  /** Null for a prediction without both scores: never a vote. */
  readonly outcome: Outcome | null;
}

/**
 * Where a game's odds came from: its votes (CO-1), no votes at all (CO-4),
 * a stored row read back (CO-7), or sportbet's missing row (CO-5).
 */
export type OddsSource = 'votes' | 'no-votes' | 'stored' | 'missing';

/** One game's crowd odds, one set for every league (CO-6, #227). */
export class CrowdOdds {
  readonly home: Odds;
  readonly away: Odds;
  /** Always the contrarian odds in Euroleague: nobody can predict a draw. */
  readonly draw: Odds;
  readonly source: OddsSource;

  private constructor(home: Odds, away: Odds, draw: Odds, source: OddsSource) {
    this.home = home;
    this.away = away;
    this.draw = draw;
    this.source = source;
    Object.freeze(this);
  }

  /**
   * CO-1 to CO-4, CO-6: the odds of an outcome are log2(votes / votes for
   * it), rounded to four places then two; an outcome nobody picked gets
   * log2(votes / 0.5); no votes gives 0 for every outcome. Which
   * predictions are votes is the rule set's (R-2, R-9).
   */
  static forGame(votes: readonly Vote[], rules: RuleSet): CrowdOdds {
    const counted = votes.filter(
      (vote) =>
        vote.outcome !== null &&
        (rules.crowdOddsCountFilledIn || vote.origin === 'real'),
    );
    const total = counted.length;
    if (total === 0) {
      return new CrowdOdds(Odds.ZERO, Odds.ZERO, Odds.ZERO, 'no-votes');
    }
    const oddsOf = (outcome: Outcome): Odds => {
      const count = counted.filter((vote) => vote.outcome === outcome).length;
      return Odds.ofHundredths(
        gameOddsHundredths(total, count > 0 ? count : 0.5),
      );
    };
    return new CrowdOdds(
      oddsOf('home'),
      oddsOf('away'),
      oddsOf('level'),
      'votes',
    );
  }

  /** Odds read back from where the game was scored with them (CO-7). */
  static stored(home: Odds, away: Odds, draw: Odds): CrowdOdds {
    return new CrowdOdds(home, away, draw, 'stored');
  }

  /**
   * sportbet: a game with no stored odds row is scored at 1.0 (CO-5). A
   * guard, not a scoring difference: the ruled set always has odds from the
   * votes (a game with no votes still gets CO-4's zero odds), so there is no
   * game the missing-odds representation is valid for. Asking for it under
   * the ruled set is a programmer error, caught here rather than left as a
   * value `.score()` might later be asked to accept.
   */
  static missing(rules: RuleSet): CrowdOdds {
    if (!rules.missingOddsScoreAtOne) {
      throw new Error(
        'CrowdOdds.missing: the ruled set always has odds from the votes',
      );
    }
    return new CrowdOdds(Odds.ONE, Odds.ONE, Odds.ONE, 'missing');
  }

  forOutcome(outcome: Outcome): Odds {
    switch (outcome) {
      case 'home':
        return this.home;
      case 'away':
        return this.away;
      case 'level':
        return this.draw;
    }
  }
}
