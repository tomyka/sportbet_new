import {
  MatchPrediction,
  PREDICTION_MAX,
  PREDICTION_MIN,
} from '../prediction/match-prediction';
import type { Game } from '../round/game';
import type { RuleSet } from '../rules/rule-set';
import type { PredictionWrite } from '../player/player-status';
import type { PlayerId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { Score } from '../score/score';

/** A fill-in side is 55 plus three rolls of 0-17 (FI-2, config/scores.php). */
export const FILL_IN_SCORE = Object.freeze({ base: 55, rolls: 3, die: 17 });

/**
 * The randomness a fill-in needs, as a port: the domain never draws a
 * random number itself, so parity can take stored fill-ins as inputs and
 * tests can script the rolls.
 */
export interface FillInDice {
  /** A whole number from 0 to `die`, inclusive. */
  roll(die: number): number;
  /** true moves a level away side up one point, false down one. */
  coin(): boolean;
}

function side(dice: FillInDice): number {
  let total = FILL_IN_SCORE.base;
  for (let roll = 0; roll < FILL_IN_SCORE.rolls; roll++) {
    const value = dice.roll(FILL_IN_SCORE.die);
    if (!Number.isInteger(value) || value < 0 || value > FILL_IN_SCORE.die) {
      throw new Error(`FillInDice: rolled ${String(value)} on a 0-17 die`);
    }
    total += value;
  }
  return total;
}

/**
 * FI-2: home then away, each 55 plus three rolls; a level pair has its away
 * side moved one point, up or down at random, staying within 50-120
 * (GeneratedScore::breakTie).
 */
export function fillInScore(dice: FillInDice): Score {
  const home = side(dice);
  let away = side(dice);
  if (home === away) {
    if (away + 1 > PREDICTION_MAX) away -= 1;
    else if (away - 1 < PREDICTION_MIN) away += 1;
    else away += dice.coin() ? 1 : -1;
  }
  const score = Score.of(home, away);
  if (!score.ok) {
    throw new Error('fillInScore: the generator made an impossible score');
  }
  return score.value;
}

export interface FillInCandidate {
  /** The player's prediction row for the game. */
  readonly prediction: MatchPrediction;
  readonly switchedOff: boolean;
}

/**
 * FI-1, MS-2: at the result, every row of the game whose home score is
 * blank gets a fill-in, unless its player is switched off (R-32 keeps
 * sportbet's rule). A player with no row for the game gets nothing.
 */
export function fillIns(
  game: Game,
  candidates: readonly FillInCandidate[],
  dice: FillInDice,
  madeAt: Instant,
): readonly MatchPrediction[] {
  const made = candidates
    .filter(
      ({ prediction, switchedOff }) =>
        prediction.game === game.id &&
        prediction.hasBlankHomeScore() &&
        !switchedOff,
    )
    .map(({ prediction }) =>
      MatchPrediction.fillIn({
        player: prediction.player,
        game: game.id,
        score: fillInScore(dice),
        origin: 'fill-in',
        madeAt,
      }),
    );
  return Object.freeze(made);
}

/**
 * FI-4, R-5: when a result is corrected or cleared, the fill-ins it made
 * before the game had even tipped off existed only because of the mistaken
 * entry, and the ruled set removes them; sportbet keeps every fill-in.
 */
export function afterResultCorrection(
  predictions: readonly MatchPrediction[],
  game: Game,
  rules: RuleSet,
): readonly MatchPrediction[] {
  return Object.freeze(
    predictions.map((prediction) =>
      madeByMistakenResult(prediction, game, rules)
        ? prediction.cleared()
        : prediction,
    ),
  );
}

/**
 * R-5, PL-1: the same correction on a player's prediction history, so the
 * status rebuilt from it (PlayerStatus.fromHistory) no longer counts the
 * removed fill-ins toward switching them off. sportbet keeps every write.
 */
export function historyAfterResultCorrection(
  writes: readonly PredictionWrite[],
  game: Game,
  rules: RuleSet,
): readonly PredictionWrite[] {
  return Object.freeze(
    writes.filter(
      (write) =>
        !madeByMistakenResult(
          { game: write.game, origin: write.origin, filledInAt: write.at },
          game,
          rules,
        ),
    ),
  );
}

/** FI-4: a fill-in of this game made before it had even tipped off. */
function madeByMistakenResult(
  made: Pick<MatchPrediction, 'game' | 'origin' | 'filledInAt'>,
  game: Game,
  rules: RuleSet,
): boolean {
  return (
    rules.fillInsOfMistakenResultRemoved &&
    made.game === game.id &&
    made.origin === 'fill-in' &&
    made.filledInAt !== null &&
    made.filledInAt < game.tipOff
  );
}

/**
 * PL-2, R-9: a late joiner gets a fill-in for each game already played,
 * and for one under way without a result yet: otherwise that game's
 * result-entry fill-in would be an ordinary one, counted toward R-7.
 * sportbet has no late joiners (registration closes at the first game).
 */
export function lateJoinerFillIns(
  joiner: {
    readonly player: PlayerId;
    /** The tournament's games. */
    readonly games: readonly Game[];
    readonly dice: FillInDice;
    /** The moment the player joins: the fill-ins' time. */
    readonly madeAt: Instant;
  },
  rules: RuleSet,
): readonly MatchPrediction[] {
  const { player, games, dice, madeAt } = joiner;
  if (!rules.lateJoinersFilledIn) {
    return Object.freeze([]);
  }
  // Every game the joiner can no longer predict: scored, under way or
  // locked (R-13). Only a game postponed before its tip-off will reopen.
  const made = games
    .filter(
      (game) =>
        !game.isOpenAt(madeAt) &&
        !(game.postponed && game.lockedSince === null),
    )
    .map((game) =>
      MatchPrediction.fillIn({
        player,
        game: game.id,
        score: fillInScore(dice),
        origin: 'late-fill-in',
        madeAt,
      }),
    );
  return Object.freeze(made);
}
