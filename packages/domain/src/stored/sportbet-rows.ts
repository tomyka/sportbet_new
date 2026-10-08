// sportbet's raw rows, column by column, as the production-copy reader
// selects them: what sportbetColumns (sportbet-columns.ts) maps into the
// domain's stored rows.

import type { Stage } from '../round/stage';
import type {
  GameId,
  PlayerId,
  RoundNumber,
  TeamId,
  TournamentId,
} from '../shared/ids';
import type { Instant } from '../shared/instant';

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

/** The `tournaments` columns the hub reads (slice 5), as the reader reads them. */
export interface SportbetTournamentProfileRow {
  readonly status: string;
  /** `start_date` as `YYYY-MM-DD`; null when the admin set none. */
  readonly start_date: string | null;
  readonly sport: string;
  readonly description: string | null;
  readonly is_public: number;
}

export type SportbetTournamentProfileRefusal = 'bad-status' | 'bad-start-date';
