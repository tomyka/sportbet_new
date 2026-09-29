import { CrowdOdds } from '../odds/crowd-odds';
import { Odds } from '../points/odds';
import { Points } from '../points/points';
import type { StoredStatus } from '../player/player-status';
import type { StoredPrediction } from '../prediction/match-prediction';
import type {
  GameOdds,
  StoredSurvivalRow,
} from '../recalculation/recalculation';
import type { StoredGame } from '../round/game';
import type { RoundInput } from '../round/round';
import type { Stage } from '../round/stage';
import { Rate } from '../score/score';
import {
  roundNumber,
  type GameId,
  type PlayerId,
  type RoundNumber,
  type TeamId,
  type TournamentId,
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
 * - `game_odds`: every game gets a blank row (all NULL) when it is created
 *   (GameController::insertGame, EuroleagueScheduleImporter), and the
 *   scorer reads each column with `(float)`, so a NULL column is odds 0
 *   (ScoringService::getGameOdds) - not CO-5's 1.0, which only a game with
 *   no row at all gets (PointResultController, `first() ?? 1.0`). The table
 *   is not unique on `game_id` and sportbet takes `first()` with no order:
 *   the reader passes each game's first row by id, and none for a game
 *   without one (leaving it out of the odds map is CO-5).
 * - `point_survivals`: `survival_points` is a whole number (smallint); the
 *   row's round is its event's `event_day`.
 * - `events`: `rate` (UpdateEventRequest allows 0, which no round can
 *   score at, so it is refused; production holds none, P16), `is_knockout`
 *   read with `(bool)` (PointResultController), `event_survival` on only
 *   at 1 (NavVisibility::showSurvival). sportbet stores no Euroleague stage
 *   (`round_type` is football's knockout filter for the admin's team list,
 *   unread by scoring), so the reader names it.
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

export interface SportbetGameOddsRow {
  readonly game: GameId;
  /** DECIMAL(8,2) as text, e.g. "0.59"; NULL in the blank row. */
  readonly home_odds: string | null;
  readonly away_odds: string | null;
  readonly draw_odds: string | null;
}

export interface SportbetSurvivalRow {
  readonly id: number;
  readonly player: PlayerId;
  /** The row's event's `event_day`. */
  readonly event_day: number;
  readonly team: TeamId;
  readonly survival_points: number;
}

export interface SportbetEventRow {
  readonly event_day: number;
  readonly rate: number;
  readonly is_knockout: number;
  readonly event_survival: number;
  /** Not stored by sportbet: the reader names the round's stage. */
  readonly stage: Stage;
}

const FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];

/** DECIMAL(8,2) text as hundredths, exactly; NULL is (float) NULL, 0. */
function oddsColumn(value: string | null): Odds | null {
  if (value === null) return Odds.ZERO;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (match === null) return null;
  const hundredths =
    Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  const odds = Odds.ofHundredths(hundredths);
  return odds.ok ? odds.value : null;
}

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

  gameOdds(row: SportbetGameOddsRow): Result<GameOdds, 'bad-odds'> {
    const home = oddsColumn(row.home_odds);
    const away = oddsColumn(row.away_odds);
    const draw = oddsColumn(row.draw_odds);
    if (home === null || away === null || draw === null) {
      return refuse('bad-odds');
    }
    return ok({ game: row.game, odds: CrowdOdds.stored(home, away, draw) });
  },

  survivalRow(
    row: SportbetSurvivalRow,
  ): Result<StoredSurvivalRow, 'not-a-positive-integer' | 'not-whole-units'> {
    const round = roundNumber(row.event_day);
    if (!round.ok) return round;
    const points = Points.whole(row.survival_points);
    if (!points.ok) return points;
    return ok({
      id: row.id,
      player: row.player,
      round: round.value,
      team: row.team,
      storedPoints: points.value,
    });
  },

  round(row: SportbetEventRow): Result<RoundInput, 'not-a-positive-integer'> {
    const number = roundNumber(row.event_day);
    if (!number.ok) return number;
    const rate = Rate.of(row.rate);
    if (!rate.ok) return rate;
    return ok({
      number: number.value,
      stage: row.stage,
      rate: rate.value,
      survival: row.event_survival === 1,
      knockout: row.is_knockout !== 0,
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
