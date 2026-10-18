import type {
  ChartColourRow,
  CreatedRow,
  SavedLeague,
  StoredTable,
  TournamentSnapshot,
} from '@sportbet/db';
import type {
  GameId,
  LeagueId,
  LeagueInvite,
  LeagueMessage,
  PlayerId,
  PointsRows,
  StoredPlayer,
  StoredPlayerSettings,
  TeamId,
  TournamentProfile,
} from '@sportbet/domain';
import type { TableCount } from './ledger';

/** One tournament's rows, mapped through sportbetColumns and the stored factories. */
export interface MappedTournament extends TournamentSnapshot {
  /** Production's own points rows: the parity oracle, and an input. */
  readonly production: PointsRows;
  /** The tournament's loaded leagues, each with its loaded members: saved with it, and ranked by parity. */
  readonly leagues: readonly SavedLeague[];
  /** The league each player selects where it is not the public one (the saver selects that). */
  readonly selections: ReadonlyMap<PlayerId, LeagueId>;
  /** What the saver adds that no sportbet row stands for (reconcile counts it). */
  readonly leaguesAdded: {
    readonly leagues: number;
    readonly members: number;
  };
  /** The points rows the parity checker cannot compare. */
  readonly refusedPoints: RefusedPoints;
  /** The hub's profile (slice 5), through sportbetColumns.tournamentProfile. */
  readonly profile: TournamentProfile;
}

/**
 * The keys of a tournament's points rows the parity checker cannot compare,
 * as the class `refused`: a row whose game, team, round and player loaded
 * but which did not load itself - a points row the map refused, or a
 * prediction or standings row it refused, which the new code never scores
 * and sportbet does - and each game whose odds rows it refused, which the
 * new code scores at CO-5's 1.0 and sportbet at one of those rows. Keys
 * hold a player's id; the report only counts them.
 */
export interface RefusedPoints {
  readonly matches: readonly {
    readonly player: PlayerId;
    readonly game: GameId;
  }[];
  readonly standings: readonly {
    readonly player: PlayerId;
    readonly team: TeamId;
  }[];
  /** sportbet's `point_survivals` ids. */
  readonly survival: readonly number[];
  readonly odds: readonly GameId[];
}

export interface Mapped {
  /** Every loaded player: the id, the username and the account. */
  readonly players: readonly StoredPlayer[];
  /** Each loaded player's settings (user_settings: role from the admin level, locale). */
  readonly settings: readonly StoredPlayerSettings[];
  /** The loaded players who receive reminders (user_settings.receive_reminders, R-97). */
  readonly reminderOptIns: readonly PlayerId[];
  /** When sportbet created each loaded account that has a time (users.created_at, R-114). */
  readonly accountsCreated: readonly CreatedRow[];
  /** The chart colour of each loaded player who has a valid one (colors, R-136). */
  readonly chartColours: readonly ChartColourRow[];
  readonly tournaments: readonly MappedTournament[];
  /** Pending invites of loaded players, in loaded leagues. */
  readonly invites: readonly LeagueInvite[];
  /** Messages of loaded leagues, and the detached ones. */
  readonly messages: readonly LeagueMessage[];
  /** Rows the load writes that no sportbet row stands for, per table (reconcile). */
  readonly added: Readonly<Partial<Record<StoredTable, number>>>;
  readonly tables: readonly TableCount[];
  /** Quirks that were loaded as they are, each worth knowing about. */
  readonly notices: readonly string[];
}
