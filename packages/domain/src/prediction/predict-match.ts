import { PlayerStatus } from '../player/player-status';
import type { Game } from '../round/game';
import type { RuleSet } from '../rules/rule-set';
import type { TournamentId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  MatchPrediction,
  type PredictedPair,
  type PredictionRefusal,
} from './match-prediction';

/** Why a save writes nothing, beyond the form's own refusals. */
export type PredictRefusal = 'not-yours' | 'closed' | PredictionRefusal;

/** A saved score as audit_prediction_games keeps it: the row before, and after. */
export interface PredictionAudit {
  readonly old: PredictedPair;
  readonly new: { readonly home: number; readonly away: number };
}

/** What a save writes. */
export interface PredictionWritten {
  /** The row, as a real prediction. */
  readonly prediction: MatchPrediction;
  /** The save switches the player back on (PL-1, R-57): statusAfterSave. */
  readonly switchesBackOn: boolean;
  /** Written only for a saved score, as sportbet does. */
  readonly audit: PredictionAudit | null;
}

/**
 * PredictionResultController::updatePredictionResultUser, once the form
 * has passed (predictionFormEntry): the row must be the player's own and
 * of this game (issue 254: the row decides, never the posted id), then
 * the game must be open (LR-1, R-13, R-41: "Šio mačo prognozuoti
 * nebegalima."), then MatchPrediction.enter takes the pair. The player is
 * switched back on by any accepted save under sportbet, by a saved score
 * only under R-57; a saved score is audited with the row as it was.
 */
export function predictMatch(input: {
  readonly target: {
    readonly prediction: MatchPrediction;
    readonly game: Game;
  } | null;
  readonly entry: PredictedPair;
  readonly now: Instant;
  readonly rules: RuleSet;
}): Result<PredictionWritten, PredictRefusal> {
  const { target, entry, now, rules } = input;
  if (target === null || target.prediction.game !== target.game.id) {
    return refuse('not-yours');
  }
  if (!target.game.isOpenAt(now)) {
    return refuse('closed');
  }
  const entered = MatchPrediction.enter({
    player: target.prediction.player,
    game: target.game.id,
    home: entry.home,
    away: entry.away,
  });
  if (!entered.ok) return entered;
  const prediction = entered.value;
  const audit =
    prediction.home === null || prediction.away === null
      ? null
      : {
          old: {
            home: target.prediction.home,
            away: target.prediction.away,
          },
          new: { home: prediction.home, away: prediction.away },
        };
  return ok({
    prediction,
    switchesBackOn: audit !== null || !rules.onlyAScoreSwitchesBackOn,
    audit,
  });
}

/** One tournament_players row of a player, as it is stored. */
export interface TournamentStatusRow {
  readonly tournament: TournamentId;
  readonly switchedOff: boolean;
  readonly adminHidden: boolean;
  readonly fillIns: number;
}

/**
 * A player's tournament rows after a save that switches them back on in
 * `tournament` (PlayerStatus.afterRealPrediction, PL-1): under R-7 in that
 * tournament only, its count reset, an admin hide kept (R-19); under
 * sportbet its one switch, on everywhere, every count kept. The rows are
 * read back through PlayerStatus.stored, so one it refuses is a corrupt
 * table and throws.
 */
export function statusAfterSave(
  rows: readonly TournamentStatusRow[],
  tournament: TournamentId,
  rules: RuleSet,
): TournamentStatusRow[] {
  const before = PlayerStatus.stored(
    {
      switchedOffIn: new Set(
        rows.filter((row) => row.switchedOff).map((row) => row.tournament),
      ),
      adminHidden:
        rows.find((row) => row.tournament === tournament)?.adminHidden ?? false,
      fillIns: new Map(rows.map((row) => [row.tournament, row.fillIns])),
    },
    rules,
  );
  if (!before.ok) {
    throw new Error(`statusAfterSave: a stored status is ${before.refusal}`);
  }
  const after = before.value.afterRealPrediction(tournament, rules);
  return rows.map((row) => ({
    tournament: row.tournament,
    switchedOff: after.isSwitchedOffIn(row.tournament, rules),
    adminHidden:
      row.tournament === tournament ? after.adminHidden : row.adminHidden,
    fillIns:
      rules.switchOff.countedPer === 'tournament'
        ? after.fillInCount(row.tournament, rules)
        : row.fillIns,
  }));
}
