import type { StoredStatus } from '../player/player-status';
import type { StoredPrediction } from '../prediction/match-prediction';
import type { StoredGame } from '../round/game';
import type {
  GameId,
  PlayerId,
  RoundNumber,
  TeamId,
  TournamentId,
} from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import { Score, type ScoreRefusal } from '../score/score';
import type {
  FinalPlace,
  StoredTeamPick,
} from '../standings/standings-prediction';
import type { TeamOutcome } from '../standings/team-outcomes';

/**
 * The one place sportbet's raw columns are read into the domain's stored
 * rows. Every stored factory (Game.stored, MatchPrediction.stored,
 * StandingsPrediction.stored, TeamOutcomes.stored, ...) takes the rebuild's
 * own shape; the production-copy reader passes sportbet's columns through
 * these first, so it stays a thin adapter and no quirk is mapped twice.
 * Ids, dates and scores keep their own factories (gameId, instantFrom,
 * Score.of): only the columns whose meaning differs are mapped here.
 *
 * The quirks, as sportbet at 0da316f reads them:
 * - `prediction_results.generated`, a blob holding '1', '0' or NULL: '1' is
 *   a fill-in, '0' and NULL real, and sportbet keeps no fill-in time (FI-4).
 *   sportbet reads it two ways - ScoringService::getGameOdds by
 *   `Cast::int($generated) === 1` (the odds), SerijaCorrectness by PHP
 *   truthiness (the serija) - which agree on exactly these three values
 *   ('1' is 1 and truthy; '0' is 0 and falsy; NULL is 0 and falsy). Any
 *   other value ('2', '01', an empty or binary blob) could read one way
 *   for the odds and the other for the serija, so it is refused, not
 *   mapped.
 * - `games`: a result is both scores; `game_winner_id` is the recorded
 *   winner (MS-10); sportbet has no lock (LR-2) and no postponed state
 *   (R-41).
 * - `prediction_standings.final`: 0 is no final place (only `final > 0`
 *   counts, and the matrix pays nothing for 0); `group_position` 0 stays a
 *   place (StandingScoringService scores it as one).
 * - `teams.group_position` and `teams.final`: 0 is undecided, as NULL
 *   (StandingScoringService, StandingPointsRow::activeStages).
 * - `user_settings.active`: one switch for missed games and an admin hide
 *   alike, over every tournament (PL-1, RA-4), and one lifetime fill-in
 *   count, COUNT(generated = 1) over all the player's rows.
 * - the 0/1/NULL ticks: 1 is ticked, 0 unticked, NULL never saved; a team's
 *   tick counts only as 1 (calculateKnockoutPoints).
 */

export interface SportbetPredictionRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly home_team_score: number | null;
  readonly away_team_score: number | null;
  readonly generated: string | null;
}

export interface SportbetGameRow {
  readonly id: GameId;
  /** The game's round: its event's `event_day`. */
  readonly round: RoundNumber;
  readonly home: TeamId;
  readonly away: TeamId;
  /** `game_date`, in UTC. */
  readonly tipOff: Instant;
  readonly home_team_score: number | null;
  readonly away_team_score: number | null;
  readonly game_winner_id: TeamId | null;
}

/** A `prediction_standings` row, or a `teams` row's standings columns. */
export interface SportbetStandingsRow {
  readonly team: TeamId;
  readonly group_position: number | null;
  readonly quarterfinal: number | null;
  readonly semifinal: number | null;
  readonly final: number | null;
}

export interface SportbetStatusRow {
  /** Any tournament: sportbet's one switch and one count cover them all. */
  readonly tournament: TournamentId;
  /** `user_settings.active`. */
  readonly active: boolean;
  /** The player's prediction rows with generated = 1, in every tournament. */
  readonly fillIns: number;
}

const FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];

const tick = (value: number | null): boolean | null =>
  value === null ? null : value === 1;

const noneAtZero = (value: number | null): number | null =>
  value === 0 ? null : value;

export const sportbetColumns = Object.freeze({
  prediction(
    row: SportbetPredictionRow,
  ): Result<StoredPrediction, 'bad-generated'> {
    if (
      row.generated !== null &&
      row.generated !== '1' &&
      row.generated !== '0'
    ) {
      return refuse('bad-generated');
    }
    return ok({
      player: row.player,
      game: row.game,
      home: row.home_team_score,
      away: row.away_team_score,
      origin: row.generated === '1' ? 'fill-in' : 'real',
      filledInAt: null,
    });
  },

  game(row: SportbetGameRow): Result<StoredGame, ScoreRefusal | 'half-scored'> {
    const { home_team_score: home, away_team_score: away } = row;
    let result: Score | null = null;
    if (home !== null || away !== null) {
      if (home === null || away === null) {
        return refuse('half-scored');
      }
      const score = Score.of(home, away);
      if (!score.ok) {
        return score;
      }
      result = score.value;
    }
    return ok({
      id: row.id,
      round: row.round,
      home: row.home,
      away: row.away,
      tipOff: row.tipOff,
      result,
      recordedWinner: row.game_winner_id,
      lockedSince: null,
      postponed: false,
    });
  },

  status(row: SportbetStatusRow): StoredStatus {
    return {
      switchedOffIn: new Set(row.active ? [] : [row.tournament]),
      adminHidden: false,
      fillIns: new Map([[row.tournament, row.fillIns]]),
    };
  },

  teamPick(row: SportbetStandingsRow): StoredTeamPick {
    return {
      team: row.team,
      place: row.group_position,
      playOffs: tick(row.quarterfinal),
      finalFour: tick(row.semifinal),
      finalPlace: noneAtZero(row.final),
    };
  },

  teamOutcome(
    row: SportbetStandingsRow,
  ): Result<TeamOutcome, 'bad-final-place'> {
    const final = noneAtZero(row.final);
    const finalPlace =
      final === null ? null : FINAL_PLACES.find((place) => place === final);
    if (finalPlace === undefined) {
      return refuse('bad-final-place');
    }
    return ok({
      team: row.team,
      place: noneAtZero(row.group_position),
      playOffs: row.quarterfinal === 1,
      finalFour: row.semifinal === 1,
      finalPlace,
    });
  },
});
