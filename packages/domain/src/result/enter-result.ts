import {
  afterResultCorrection,
  fillInScore,
  type FillInDice,
} from '../fill-in/fill-in';
import { MatchPrediction } from '../prediction/match-prediction';

import {
  PlayerStatus,
  type TournamentStatusRow,
} from '../player/player-status';
import type { Game } from '../round/game';
import type { RuleSet } from '../rules/rule-set';
import type { TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import type { ResultEntry } from './result-form';

/** Why a game's result was refused (UpdateResultRequest::after, R-38). */
export type EnterResultRefusal = 'not-started' | 'level';

export interface EnteredResult {
  /** The game's new state. */
  readonly game: Game;
  /** A result now stands: its blank rows are filled in. */
  readonly scored: boolean;
  /** A result stood before and was replaced or removed: FI-4's correction applies. */
  readonly corrected: boolean;
}

/**
 * ResultController::updateResult on one game, after resultFormEntry:
 * -1 : -1 postpones whatever the clock (R-63, Game.postpone, R-41, R-13),
 * a scored game cleared first (decision 8); a clear always goes through
 * and ends a postponement (decision 9); a score is refused before the
 * game has tipped off ("Rungtynės dar neprasidėjo") and when level (R-38).
 */
export function enterResult(input: {
  readonly game: Game;
  readonly entry: ResultEntry;
  readonly now: Instant;
  readonly rules: RuleSet;
}): Result<EnteredResult, EnterResultRefusal> {
  const { game, entry, now, rules } = input;
  const wasScored = game.result !== null;
  switch (entry.kind) {
    case 'postpone': {
      const postponed = game.withoutResult().postpone(now, rules);
      if (!postponed.ok) {
        throw new Error('enterResult: a cleared game refused postponing');
      }
      return ok({ game: postponed.value, scored: false, corrected: wasScored });
    }
    case 'clear': {
      const cleared = game.withoutResult();
      return ok({
        game: cleared.postponed ? cleared.endPostponement() : cleared,
        scored: false,
        corrected: wasScored,
      });
    }
    case 'score': {
      // A postponed game has tipped off only if R-13 locked it at its tip-off.
      if (!game.hasTippedOffAt(now)) {
        return refuse('not-started');
      }
      const scored = game.withResult(entry.score);
      if (!scored.ok) return refuse('level');
      return ok({ game: scored.value, scored: true, corrected: wasScored });
    }
  }
}

/** One player's blank row of the game and their tournament_players rows (locked). */
export interface FillInCandidateRows {
  readonly prediction: MatchPrediction;
  readonly statuses: readonly TournamentStatusRow[];
}

/** A fill-in made, and the player's rows after it. */
export interface FillInMade {
  readonly prediction: MatchPrediction;
  readonly statuses: readonly TournamentStatusRow[];
}

/**
 * GeneratedPredictions::fillFor at a result (FI-1): each candidate whose
 * row of the game is blank and who is not switched off in the tournament
 * (R-32; an admin-hidden player is filled in, R-39) gets a fill-in
 * (fillInScore, FI-2), and the count toward switching them off goes up,
 * switching them off at the rule set's threshold (R-7: 20 in this
 * tournament; sportbet 5 over a lifetime). Candidates in player id order,
 * as the dice are drawn.
 */
export function resultFillIns(input: {
  readonly game: Game;
  readonly tournament: TournamentId;
  readonly candidates: readonly FillInCandidateRows[];
  readonly dice: FillInDice;
  readonly madeAt: Instant;
  readonly rules: RuleSet;
}): FillInMade[] {
  const { game, tournament, candidates, dice, madeAt, rules } = input;
  const made: FillInMade[] = [];
  for (const { prediction, statuses } of candidates) {
    if (prediction.game !== game.id || !prediction.hasBlankHomeScore()) {
      continue;
    }
    const before = PlayerStatus.fromRows(statuses, tournament, rules);
    if (!before.getsFillInsIn(tournament, rules)) continue;
    const after = before.afterFillIn(tournament, 'fill-in', rules);
    made.push({
      prediction: MatchPrediction.fillIn(
        prediction.player,
        game.id,
        fillInScore(dice),
        'fill-in',
        madeAt,
      ),
      statuses: after.toRows(before, statuses, tournament, rules),
    });
  }
  return made;
}

/**
 * FI-4, R-5 at a correction: under the ruled set, a fill-in of this game
 * made before it had tipped off existed only because of a mistaken result;
 * it is cleared and withdrawn from the player's count
 * (PlayerStatus.afterFillInWithdrawn, which also switches them back on
 * below the threshold). sportbet keeps every fill-in: nothing is returned.
 */
export function mistakenFillInsRemoved(input: {
  readonly game: Game;
  readonly tournament: TournamentId;
  readonly candidates: readonly FillInCandidateRows[];
  readonly rules: RuleSet;
}): FillInMade[] {
  const { game, tournament, candidates, rules } = input;
  const removed: FillInMade[] = [];
  for (const { prediction, statuses } of candidates) {
    const [after] = afterResultCorrection([prediction], game, rules);
    // afterResultCorrection returns the very prediction it keeps, and a
    // cleared copy of one it removes: identity tells them apart.
    if (after === undefined || after === prediction) continue;
    const before = PlayerStatus.fromRows(statuses, tournament, rules);
    removed.push({
      prediction: after,
      statuses: before
        .afterFillInWithdrawn(tournament, rules)
        .toRows(before, statuses, tournament, rules),
    });
  }
  return removed;
}
