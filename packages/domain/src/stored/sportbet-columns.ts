import { z } from 'zod';
import { CrowdOdds } from '../odds/crowd-odds';
import { decimalUnits } from '../points/fixed-point';
import { Odds, StandingsOdds } from '../points/odds';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { normalizeEmail, storedEmailAddress } from '../account/email';
import { personNameInvariant } from '../account/person-name';
import {
  adminLevelInvariant,
  localeInvariant,
  type StoredPlayerSettings,
} from '../account/player-settings';
import { usernameInvariant, type StoredPlayer } from '../player/player';
import type { StoredStatus } from '../player/player-status';
import type { StoredPrediction } from '../prediction/match-prediction';
import type {
  GameOdds,
  StoredMatchRow,
  StoredSurvivalRow,
} from '../recalculation/recalculation';
import type { StoredGame } from '../round/game';
import type { RoundInput } from '../round/round';
import type { Stage } from '../round/stage';
import { Rate } from '../score/score';
import {
  playerId,
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
import type {
  StandingsLine,
  StandingsRow,
} from '../standings/standings-scoring';
import type { TeamOutcome } from '../standings/team-outcomes';
import type { SurvivalPick } from '../survival/survival-fold';
import { FORMATS } from '../tournament/format';
import {
  slugSchema,
  tournamentNameInvariant,
  type Tournament,
} from '../tournament/tournament';

/**
 * The one place sportbet's raw columns are read into the domain's stored
 * rows. Every stored factory (Game.stored, MatchPrediction.stored,
 * StandingsPrediction.stored, TeamOutcomes.stored, ...) takes the rebuild's
 * own shape; the production-copy reader passes sportbet's columns through
 * these first, so it stays a thin adapter and no quirk is mapped twice.
 * Ids, dates and scores keep their own factories (gameId, instantFrom,
 * Score.of): only the columns whose meaning differs are mapped here.
 *
 * The quirks, as sportbet at 1ac955f reads them:
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
 *   the reader passes each game's first row by id when its rows are equal,
 *   and none for a game without one or with rows that differ (leaving it
 *   out of the odds map is CO-5).
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
 * - `point_results`: every column is DECIMAL(8,2), read as its exact text;
 *   the match points may be negative (MS-5), the odds never.
 * - `point_standings`: every column is a MySQL `double` (P15), read as
 *   the shortest text that reads back as the stored double. sportbet
 *   stores at most four places (R-31), so a value needing more is refused,
 *   never rounded. NULL is a stage nobody has reached (ST-6), kept apart
 *   from 0. The `last16_*` and `last32_*` columns are football's: always
 *   NULL in a Euroleague row, so a row with one set is refused.
 * - `prediction_survivals`: a row with an event is a pick for that
 *   event's round; a row with none is a "team not used yet" slot sportbet
 *   seeds per player, not a pick, and never reaches this mapping.
 * - `users`: `id` (a positive integer, as the player's id, its decimal
 *   text), `username`, `email` (as stored: an address sportbet did not
 *   normalize is refused as unnormalized-email, never fixed), `name` and `surname` (either may
 *   be empty) - the owner's consent for slice 4b. A Google id, a remember
 *   token or a password never is.
 * - `user_settings`: `admin` as it is (its non-negative tinyint range) and
 *   `locale` (`lt` or `en`); the last-used tournament is not stored by
 *   sportbet (it lived in the session), so it reads back as none (R-28).
 * - `tournaments`: `id` is a positive integer, `standings_format` names the format (a format not yet
 *   ported is refused, decision 11), `end_date` is the last day it is on
 *   (null when the admin set none, as sportbet allows, R-21), `survival_game` is read
 *   with `(bool)`. sportbet does not record whether its table is the final
 *   one (R-14), so it reads back as not final.
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

/** A `point_results` row: DECIMAL(8,2) columns as their exact text. */
export interface SportbetPointResultRow {
  readonly player: PlayerId;
  readonly game: GameId;
  readonly winner_points: string;
  readonly difference_points: string;
  readonly bingo_points: string;
  readonly odds: string;
  readonly full_points: string;
  readonly streak_bonus: string;
}

/**
 * A `point_standings` row: each `double` column as the shortest text that
 * reads back as it (e.g. "631.161"), or null.
 */
export interface SportbetPointStandingsRow {
  readonly player: PlayerId;
  readonly team: TeamId;
  readonly group_position_points: string | null;
  readonly group_position_odds: string | null;
  readonly quarterfinal_points: string | null;
  readonly quarterfinal_odds: string | null;
  readonly semifinal_points: string | null;
  readonly semifinal_odds: string | null;
  readonly final_points: string | null;
  readonly final_odds: string | null;
  readonly last16_points: string | null;
  readonly last16_odds: string | null;
  readonly last32_points: string | null;
  readonly last32_odds: string | null;
}

/** A `prediction_survivals` row with an event: the pick's team and round. */
export interface SportbetPickRow {
  readonly team: TeamId;
  /** The pick's event's `event_day`. */
  readonly event_day: number;
}

export interface SportbetUserRow {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string;
}

export interface SportbetSettingsRow {
  readonly player: PlayerId;
  /** `user_settings.admin`. */
  readonly admin: number;
  /** `user_settings.locale`. */
  readonly locale: string;
}

export interface SportbetTournamentRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly standings_format: string;
  readonly standings_deadline_round: number | null;
  /** `end_date` as `YYYY-MM-DD`; null when the admin set none. */
  readonly end_date: string | null;
  readonly survival_game: number;
}

export type SportbetTournamentRefusal =
  | 'format-not-ported'
  | 'bad-end-date'
  | 'bad-slug'
  | 'bad-name'
  | 'bad-deadline-round'
  | 'bad-id';

const FINAL_PLACES: readonly FinalPlace[] = [1, 2, 3, 4];

/** DECIMAL(8,2) text as hundredths, exactly; NULL is (float) NULL, 0. */
function oddsColumn(value: string | null): Odds | null {
  if (value === null) return Odds.ZERO;
  const hundredths = decimalUnits(value, 2);
  if (!hundredths.ok) return null;
  const odds = Odds.ofHundredths(hundredths.value);
  return odds.ok ? odds.value : null;
}

/** DECIMAL(8,2) text as points, exactly. */
function pointsColumn(value: string): Points | null {
  const hundredths = decimalUnits(value, 2);
  if (!hundredths.ok) return null;
  const points = Points.ofHundredths(hundredths.value);
  return points.ok ? points.value : null;
}

/** A `double` points and odds pair, as text, as one stored standings line. */
function standingsLine(
  points: string | null,
  odds: string | null,
): StandingsLine | null {
  let linePoints: StandingsPoints | null = null;
  if (points !== null) {
    const units = decimalUnits(points, 4);
    if (!units.ok) return null;
    const value = StandingsPoints.ofTenThousandths(units.value);
    if (!value.ok) return null;
    linePoints = value.value;
  }
  let lineOdds: StandingsOdds | null = null;
  if (odds !== null) {
    const units = decimalUnits(odds, 4);
    if (!units.ok) return null;
    const value = StandingsOdds.ofTenThousandths(units.value);
    if (!value.ok) return null;
    lineOdds = value.value;
  }
  return { points: linePoints, odds: lineOdds };
}

const isoDateSchema = z.iso.date();

/** A sportbet row id: a positive integer, as every auto-increment id is. */
const sportbetIdSchema = z.int().positive();

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

  matchPointsRow(
    row: SportbetPointResultRow,
  ): Result<StoredMatchRow, 'bad-points' | 'bad-odds'> {
    const winner = pointsColumn(row.winner_points);
    const margin = pointsColumn(row.difference_points);
    const bingo = pointsColumn(row.bingo_points);
    const full = pointsColumn(row.full_points);
    const serija = pointsColumn(row.streak_bonus);
    if (
      winner === null ||
      margin === null ||
      bingo === null ||
      full === null ||
      serija === null
    ) {
      return refuse('bad-points');
    }
    const hundredths = decimalUnits(row.odds, 2);
    const odds = hundredths.ok
      ? Odds.ofHundredths(hundredths.value)
      : hundredths;
    if (!odds.ok) {
      return refuse('bad-odds');
    }
    return ok({
      player: row.player,
      game: row.game,
      points: { winner, margin, bingo, full, odds: odds.value },
      serija,
    });
  },

  standingsPointsRow(
    row: SportbetPointStandingsRow,
  ): Result<StandingsRow, 'bad-standings-points' | 'football-column-set'> {
    if (
      row.last16_points !== null ||
      row.last16_odds !== null ||
      row.last32_points !== null ||
      row.last32_odds !== null
    ) {
      return refuse('football-column-set');
    }
    const place = standingsLine(
      row.group_position_points,
      row.group_position_odds,
    );
    const playOffs = standingsLine(
      row.quarterfinal_points,
      row.quarterfinal_odds,
    );
    const finalFour = standingsLine(row.semifinal_points, row.semifinal_odds);
    const final = standingsLine(row.final_points, row.final_odds);
    if (
      place === null ||
      playOffs === null ||
      finalFour === null ||
      final === null
    ) {
      return refuse('bad-standings-points');
    }
    return ok({
      player: row.player,
      team: row.team,
      place,
      playOffs,
      finalFour,
      final,
    });
  },

  survivalPick(
    row: SportbetPickRow,
  ): Result<SurvivalPick, 'not-a-positive-integer'> {
    const round = roundNumber(row.event_day);
    return round.ok ? ok({ round: round.value, team: row.team }) : round;
  },

  player(
    row: SportbetUserRow,
  ): Result<
    StoredPlayer,
    'bad-id' | 'bad-username' | 'unnormalized-email' | 'bad-email' | 'bad-name'
  > {
    if (!sportbetIdSchema.safeParse(row.id).success) {
      return refuse('bad-id');
    }
    const id = playerId(String(row.id));
    if (!id.ok) {
      return refuse('bad-id');
    }
    if (!usernameInvariant.schema.safeParse(row.username).success) {
      return refuse('bad-username');
    }
    // Sign-in looks an address up normalized (#41): an account stored
    // otherwise could never sign in, so it is refused and counted.
    if (normalizeEmail(row.email) !== row.email) {
      return refuse('unnormalized-email');
    }
    const email = storedEmailAddress(row.email);
    if (!email.ok) {
      return refuse('bad-email');
    }
    if (
      !personNameInvariant.schema.safeParse(row.name).success ||
      !personNameInvariant.schema.safeParse(row.surname).success
    ) {
      return refuse('bad-name');
    }
    return ok({
      id: id.value,
      username: row.username,
      email: email.value,
      name: row.name,
      surname: row.surname,
    });
  },

  settings(
    row: SportbetSettingsRow,
  ): Result<StoredPlayerSettings, 'bad-admin-level' | 'bad-locale'> {
    if (!adminLevelInvariant.schema.safeParse(row.admin).success) {
      return refuse('bad-admin-level');
    }
    if (!localeInvariant.schema.safeParse(row.locale).success) {
      return refuse('bad-locale');
    }
    return ok({
      player: row.player,
      locale: row.locale,
      adminLevel: row.admin,
      lastTournament: null,
    });
  },

  tournament(
    row: SportbetTournamentRow,
  ): Result<Tournament, SportbetTournamentRefusal> {
    if (!sportbetIdSchema.safeParse(row.id).success) {
      return refuse('bad-id');
    }
    const format = FORMATS.find((each) => each === row.standings_format);
    if (format === undefined) {
      return refuse('format-not-ported');
    }
    const endsOn = isoDateSchema.nullable().safeParse(row.end_date);
    if (!endsOn.success) {
      return refuse('bad-end-date');
    }
    const slug = slugSchema.safeParse(row.slug);
    if (!slug.success) {
      return refuse('bad-slug');
    }
    if (!tournamentNameInvariant.schema.safeParse(row.name).success) {
      return refuse('bad-name');
    }
    let standingsDeadlineRound: RoundNumber | null = null;
    if (row.standings_deadline_round !== null) {
      const round = roundNumber(row.standings_deadline_round);
      if (!round.ok) {
        return refuse('bad-deadline-round');
      }
      standingsDeadlineRound = round.value;
    }
    return ok({
      id: row.id,
      slug: slug.data,
      name: row.name,
      format,
      endsOn: endsOn.data,
      standingsDeadlineRound,
      survival: row.survival_game !== 0,
      standingsTableFinal: false,
    });
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
