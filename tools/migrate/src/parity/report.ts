import type {
  GameId,
  PlayerId,
  Result,
  RoundNumber,
  TeamId,
} from '@sportbet/domain';
import type { MappedTournament, TableCount } from '../map';
import {
  PARITY_TABLES,
  type ColumnDifference,
  type ParityClass,
  type ParityTable,
  type RowSubject,
  type TableParity,
} from './compare';
import type { LeaderboardRanking, LeagueRanking, Placed } from './rankings';
import type { Effect, RulingsImpact } from './rulings';

/** Spec 1: what the checker cannot check, as its report says. */
const CANNOT_CHECK: readonly string[] = [
  "generated predictions are taken as stored, not regenerated: sportbet's full recalculation does not regenerate them either, so both oracles score the same rows",
  'broken survival runs (audit Q3)',
  'the odds of a game whose predictions changed after its result was saved',
  "a row fed by a row the reader refused (a crowd count, a serija) may differ; the refusal is in the load report's table counts",
];

/** A `new-code-wrong` row, named for the owner to read. */
interface WrongRow {
  readonly table: ParityTable;
  /** Username and game (teams and date), team or round. */
  readonly row: string;
  readonly differences: readonly ColumnDifference[];
}

/** A ranking's players and each one that differs, by username. */
interface PlacesReport {
  readonly players: number;
  readonly differences: readonly {
    readonly username: string;
    readonly newCode: Placed | null;
    readonly oldApp: Placed | null;
  }[];
}

interface RankingReport extends PlacesReport {
  readonly league: number;
}

type RulingsReport =
  | {
      readonly fields: readonly {
        readonly label: string;
        /** The catalogue rules of the ruling it is measured on top of. */
        readonly measuredWith: string | null;
        readonly effect: Effect;
      }[];
      readonly ruled: Effect;
      /** Ten-thousandths of `ruled`'s points no line explains, or null. */
      readonly remainder: number | null;
    }
  | { readonly refusal: string };

/** One tournament's parity; `notCompared` says why it has no counts. */
export interface TournamentParityReport {
  readonly tournament: string;
  readonly notCompared: string | null;
  readonly counts: Readonly<
    Record<ParityTable, Readonly<Record<ParityClass, number>>>
  >;
  readonly wrong: readonly WrongRow[];
  /** `stale` rows counted per table and per differing column. */
  readonly stale: Readonly<
    Record<ParityTable, Readonly<Record<string, number>>>
  >;
  readonly rulings: RulingsReport | null;
  readonly rankings: readonly RankingReport[];
}

/**
 * The parity report (spec 5). It names a `new-code-wrong` row by its
 * player's username - on the owner's PC only - and holds no name, email or
 * id of a player.
 */
export interface ParityReport {
  readonly tag: string;
  /** The backup's object name, which carries its timestamp. */
  readonly backup: string;
  readonly tournaments: readonly TournamentParityReport[];
  /** Rows new-code-wrong over every tournament: the verdict. */
  readonly newCodeWrong: number;
  /** Rows the checker could not compare, over every tournament. */
  readonly refused: number;
  /**
   * sportbet's recalculated rows the old app's map did not load because
   * what they belong to did not (oldAppDropped), per table.
   */
  readonly oldAppDropped: Readonly<Record<ParityTable, DroppedRows>>;
  /**
   * /leaderboard against sportbet's, over every loaded tournament; null
   * when a tournament was not compared, so the sum would be partial.
   */
  readonly leaderboard: PlacesReport | null;
  readonly cannotCheck: readonly string[];
}

/**
 * The rows of one table the map dropped with their parent, by reason, as
 * the load report counts them: skipped with a skipped parent (a football
 * tournament's), or refused as an orphan or with a refused parent.
 */
interface DroppedRows {
  readonly skipped: Readonly<Record<string, number>>;
  readonly refused: Readonly<Record<string, number>>;
}

/**
 * Per points table, the rows the old app's map (oracle b) dropped because
 * what they belong to did not load, as its ledger counts them
 * (TableCount.fromParent): such a row never reaches the comparison, so it
 * is counted here rather than vanish. A row the map refused for itself is
 * a key the comparison classes `refused`.
 */
function oldAppDropped(
  tables: readonly TableCount[],
): Record<ParityTable, DroppedRows> {
  return perTable(
    (table) =>
      tables.find((each) => each.table === table)?.fromParent ?? {
        skipped: {},
        refused: {},
      },
  );
}

/**
 * Spec 5's outcome of a parity run, decided here only: the load report's
 * exit status and the verdict line both ask it.
 */
export interface ParityOutcome {
  /** No row is new-code-wrong: the pass bar. */
  readonly holds: boolean;
  readonly newCodeWrong: number;
  /**
   * Rows that could not be compared: keys classed `refused`, and the old
   * app's rows refused with their parent (oldAppDropped).
   */
  readonly refused: number;
  /** 1 when a row is new-code-wrong or refused (spec 5). */
  readonly exitStatus: 0 | 1;
  /** Why the exit status is 1, or null when it is 0. */
  readonly reason: string | null;
  /** The report's last line: PARITY HOLDS or PARITY FAILS, and why. */
  readonly verdict: string;
}

const rowsText = (count: number, what: string) =>
  `${String(count)} ${count === 1 ? 'row' : 'rows'} ${what}`;

/** The outcome of `report`: whether parity holds, its exit status, and why. */
export function parityOutcome(report: ParityReport): ParityOutcome {
  const refused =
    report.refused +
    PARITY_TABLES.reduce(
      (sum, table) =>
        sum +
        Object.values(report.oldAppDropped[table].refused).reduce(
          (inTable, count) => inTable + count,
          0,
        ),
      0,
    );
  const holds = report.newCodeWrong === 0;
  const causes = [
    ...(holds ? [] : [rowsText(report.newCodeWrong, 'new-code-wrong')]),
    ...(refused === 0 ? [] : [rowsText(refused, 'refused')]),
  ];
  const reason = causes.length === 0 ? null : causes.join(', ');
  return {
    holds,
    newCodeWrong: report.newCodeWrong,
    refused,
    exitStatus: reason === null ? 0 : 1,
    reason,
    verdict: holds
      ? reason === null
        ? 'PARITY HOLDS'
        : `PARITY HOLDS - ${reason} (exit 1)`
      : `PARITY FAILS: ${reason ?? ''}`,
  };
}

/** How the report names what a row is about. */
export interface Names {
  readonly player: (id: PlayerId) => string;
  readonly game: (id: GameId) => string;
  readonly team: (id: TeamId) => string;
  readonly round: (number: RoundNumber) => string;
}

/** The names of one mapped tournament's players, games, teams and rounds. */
export function namesOf(
  tournament: MappedTournament,
  usernames: ReadonlyMap<PlayerId, string>,
): Names {
  const found = <K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V => {
    const value = map.get(key);
    if (value === undefined) throw new Error(`parity: no ${what}`);
    return value;
  };
  const teams = new Map(tournament.teams.map(({ id, name }) => [id, name]));
  const games = new Map(tournament.games.map((game) => [game.id, game]));
  const rounds = new Map(
    tournament.rounds.map(({ name, round }) => [round.number, name]),
  );
  return {
    player: (id) => found(usernames, id, 'username'),
    team: (id) => found(teams, id, 'team'),
    round: (number) => found(rounds, number, 'round'),
    game: (id) => {
      const game = found(games, id, 'game');
      const date = new Date(game.tipOff).toISOString().slice(0, 10);
      return `${found(teams, game.home, 'team')}-${found(teams, game.away, 'team')} ${date}`;
    },
  };
}

function rowName(subject: RowSubject, names: Names): string {
  switch (subject.table) {
    case 'point_results':
      return `${names.player(subject.player)}, ${names.game(subject.game)}`;
    case 'point_standings':
      return `${names.player(subject.player)}, ${names.team(subject.team)}`;
    case 'point_survivals':
      return `${names.player(subject.player)}, ${names.round(subject.round)}`;
    case 'game_odds':
      return names.game(subject.game);
  }
}

/** A value for each table. */
const perTable = <T>(
  of: (table: ParityTable) => T,
): Record<ParityTable, T> => ({
  point_results: of('point_results'),
  point_standings: of('point_standings'),
  point_survivals: of('point_survivals'),
  game_odds: of('game_odds'),
});

/** One tournament's comparison, named for the report. */
export function describeTournament(input: {
  readonly tournament: string;
  readonly tables: readonly TableParity[];
  readonly rulings: Result<RulingsImpact, string>;
  readonly rankings: readonly LeagueRanking[];
  readonly names: Names;
}): TournamentParityReport {
  const tableOf = (table: ParityTable) => {
    const found = input.tables.find((each) => each.table === table);
    if (found === undefined) throw new Error(`parity: no ${table}`);
    return found;
  };
  return {
    tournament: input.tournament,
    notCompared: null,
    counts: perTable((table) => tableOf(table).counts),
    wrong: input.tables.flatMap(({ table, rows }) =>
      rows
        .filter((row) => row.class === 'new-code-wrong')
        .map((row) => ({
          table,
          row: rowName(row.subject, input.names),
          differences: row.differences,
        })),
    ),
    stale: perTable((table) => {
      const columns: Record<string, number> = {};
      for (const row of tableOf(table).rows) {
        if (row.class !== 'stale') continue;
        for (const { column } of row.differences) {
          columns[column] = (columns[column] ?? 0) + 1;
        }
      }
      return columns;
    }),
    rulings: input.rulings.ok
      ? {
          fields: input.rulings.value.fields.map(
            ({ label, measuredWith, effect }) => ({
              label,
              measuredWith: measuredWith?.rules ?? null,
              effect,
            }),
          ),
          ruled: input.rulings.value.ruled,
          remainder: input.rulings.value.remainder,
        }
      : { refusal: input.rulings.refusal },
    rankings: input.rankings.map(({ league, ...places }) => ({
      league,
      ...placesReport(places),
    })),
  };
}

/** A ranking as the report holds it: usernames, never ids. */
const placesReport = ({
  players,
  differences,
}: LeaderboardRanking): PlacesReport => ({
  players,
  differences: differences.map(({ username, newCode, oldApp }) => ({
    username,
    newCode,
    oldApp,
  })),
});

const NO_COUNTS = perTable(() => ({
  match: 0,
  stale: 0,
  'new-code-wrong': 0,
  refused: 0,
}));

/** A tournament the checker could not compare, and why. */
export const notCompared = (
  tournament: string,
  why: string,
): TournamentParityReport => ({
  tournament,
  notCompared: why,
  counts: NO_COUNTS,
  wrong: [],
  stale: perTable(() => ({})),
  rulings: null,
  rankings: [],
});

/**
 * The parity report over every tournament, of `run` (the sportbet commit's
 * tag and the backup compared); `oldAppTables` is the old app's
 * map's table counts, whose rows dropped with their parent it counts;
 * `leaderboard` the /leaderboard comparison, null when not compared.
 */
export function parityReport(
  run: { readonly tag: string; readonly backup: string },
  tournaments: readonly TournamentParityReport[],
  oldAppTables: readonly TableCount[],
  leaderboard: LeaderboardRanking | null = null,
): ParityReport {
  const { tag, backup } = run;
  const total = (kind: ParityClass) =>
    tournaments.reduce(
      (sum, { counts }) =>
        sum +
        PARITY_TABLES.reduce(
          (inTables, table) => inTables + counts[table][kind],
          0,
        ),
      0,
    );
  return {
    tag,
    backup,
    tournaments,
    newCodeWrong: total('new-code-wrong'),
    refused: total('refused'),
    oldAppDropped: oldAppDropped(oldAppTables),
    leaderboard: leaderboard === null ? null : placesReport(leaderboard),
    cannotCheck: CANNOT_CHECK,
  };
}
