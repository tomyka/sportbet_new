import {
  gameDeletion,
  Rate,
  rateInvariant,
  roundNumber,
  roundNumberInvariant,
  STAGES,
  tournamentProfileSchema,
  tournamentSchema,
  type Game,
  type GameDeletionRefusal,
  type GameId,
  type Instant,
  type RoundNumber,
  type RuleSet,
  type Score,
  type Stage,
  type TeamId,
  type TeamOutcome,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { stored } from '../edge';
import { realPredictionCounts } from '../season/real-predictions';
import { loadSeason } from '../season/repository';
import { games, rounds } from '../season/schema';
import { auditResults } from '../result/schema';
import { listTeams, loadTeamOutcomes, type TeamRow } from '../team/repository';
import { tournamentColumns } from '../tournament/repository';
import { tournaments } from '../tournament/schema';

/** One tournament as /admin/tournaments lists it: its rules' fields and its hub profile. */
export interface AdminTournament {
  readonly tournament: Tournament;
  readonly profile: TournamentProfile;
}

const tournamentRows = z.array(
  z.object({ tournament: tournamentSchema, profile: tournamentProfileSchema }),
);

/** The columns of a tournament and its profile, as the admin pages read them. */
const adminTournamentColumns = {
  ...tournamentColumns,
  status: tournaments.status,
  startsOn: tournaments.startsOn,
  sport: tournaments.sport,
  description: tournaments.description,
  isPublic: tournaments.isPublic,
};

function adminTournamentOf(
  row: Record<keyof typeof adminTournamentColumns, unknown>,
): unknown {
  return {
    tournament: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      format: row.format,
      endsOn: row.endsOn,
      standingsDeadlineRound: row.standingsDeadlineRound,
      survival: row.survival,
      standingsTableFinal: row.standingsTableFinal,
    },
    profile: {
      status: row.status,
      startsOn: row.startsOn,
      sport: row.sport,
      description: row.description,
      isPublic: row.isPublic,
    },
  };
}

/**
 * /admin/tournaments: every tournament with its profile, newest first
 * (sportbet's `orderByDesc('created_at')`, then the higher id).
 */
export async function loadAdminTournaments(
  db: Executor,
): Promise<AdminTournament[]> {
  const rows = await db
    .select(adminTournamentColumns)
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt), desc(tournaments.id));
  return tournamentRows.parse(rows.map(adminTournamentOf));
}

/** One tournament as the edit form shows it, or undefined. */
export async function findAdminTournament(
  db: Executor,
  id: number,
): Promise<AdminTournament | undefined> {
  const rows = await db
    .select(adminTournamentColumns)
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);
  return tournamentRows.parse(rows.map(adminTournamentOf))[0];
}

/** One round as /admin/events lists it. */
export interface AdminRoundRow {
  /** The database id the forms post as `eventID`. */
  readonly id: number;
  readonly number: RoundNumber;
  readonly name: string;
  readonly stage: Stage;
  readonly rate: Rate;
  readonly survival: boolean;
  readonly knockout: boolean;
  /** How many games the round holds; a round with games cannot be deleted. */
  readonly games: number;
}

const roundRows = z.array(
  z.object({
    id: z.int(),
    number: roundNumberInvariant.schema,
    name: z.string(),
    stage: z.enum(STAGES),
    rate: rateInvariant.schema,
    survival: z.boolean(),
    knockout: z.boolean(),
  }),
);

const gameCountRows = z.array(z.object({ round: z.int() }));

/** /admin/events: the tournament's rounds by number, each with its game count. */
export async function loadAdminRounds(
  db: Executor,
  tournament: Tournament,
): Promise<AdminRoundRow[]> {
  const rows = roundRows.parse(
    await db
      .select({
        id: rounds.id,
        number: rounds.number,
        name: rounds.name,
        stage: rounds.stage,
        rate: rounds.rate,
        survival: rounds.survival,
        knockout: rounds.knockout,
      })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id))
      .orderBy(asc(rounds.number)),
  );
  const held = gameCountRows.parse(
    await db
      .select({ round: games.roundId })
      .from(games)
      .where(eq(games.tournamentId, tournament.id)),
  );
  return rows.map((row) => ({
    id: row.id,
    number: stored(roundNumber(row.number), 'rounds', row.id),
    name: row.name,
    stage: row.stage,
    rate: stored(Rate.of(row.rate), 'rounds', row.id),
    survival: row.survival,
    knockout: row.knockout,
    games: held.filter((game) => game.round === row.id).length,
  }));
}

/** One game as /admin/games lists it. */
export interface AdminGame {
  readonly id: GameId;
  /** The round's database id, as the form's `eventID`. */
  readonly roundId: number;
  readonly round: RoundNumber;
  readonly roundName: string;
  readonly home: TeamId;
  readonly homeName: string;
  readonly away: TeamId;
  readonly awayName: string;
  readonly tipOff: Instant;
  readonly result: Score | null;
  readonly postponed: boolean;
  /** Players with a real prediction on it (realPredictionCounts). */
  readonly realPredictions: number;
  /** Why it cannot be deleted now (gameDeletion), or null when it can. */
  readonly deletion: GameDeletionRefusal | null;
}

/** A round the game form offers. */
export interface AdminRoundOption {
  readonly id: number;
  readonly number: RoundNumber;
  readonly name: string;
}

export interface AdminGamesPage {
  /** Newest id first, as sportbet's list. */
  readonly games: readonly AdminGame[];
  /** The tournament's teams, for both dropdowns (issue 272). */
  readonly teams: readonly TeamRow[];
  readonly rounds: readonly AdminRoundOption[];
  /** The latest tip-off of any game: the new game's default time; null with no game. */
  readonly latestTipOff: Instant | null;
  /** The round of the game with the highest id (sportbet's lastEnteredEventID); null with no game. */
  readonly lastRoundId: number | null;
  /** R-110: the tournament is finished, so no game can be added, changed or deleted. */
  readonly finished: boolean;
}

const auditedRows = z.array(z.object({ game: z.int() }));

/** The tournament's games an audit_results row names: a result or postponement was once entered (R-69). */
async function gamesWithResultHistory(
  db: Executor,
  tournament: Tournament,
): Promise<Set<number>> {
  const rows = auditedRows.parse(
    await db
      .select({ game: auditResults.gameId })
      .from(auditResults)
      .innerJoin(games, eq(games.id, auditResults.gameId))
      .where(eq(games.tournamentId, tournament.id)),
  );
  return new Set(rows.map(({ game }) => game));
}

/** What a game's row is listed with besides the game itself. */
interface GameListing {
  readonly round: AdminRoundRow;
  readonly names: ReadonlyMap<TeamId, string>;
  readonly realPredictions: number;
  readonly resultHistory: boolean;
  readonly finished: boolean;
}

function adminGameOf(game: Game, listing: GameListing): AdminGame {
  const { round, names, realPredictions } = listing;
  const deletion = gameDeletion(game, {
    realPredictions,
    resultHistory: listing.resultHistory,
    finished: listing.finished,
  });
  return {
    id: game.id,
    roundId: round.id,
    round: game.round,
    roundName: round.name,
    home: game.home,
    homeName: names.get(game.home) ?? '',
    away: game.away,
    awayName: names.get(game.away) ?? '',
    tipOff: game.tipOff,
    result: game.result,
    postponed: game.postponed,
    realPredictions,
    deletion: deletion.ok ? null : deletion.refusal,
  };
}

/**
 * /admin/games: the tournament's games newest id first, with their team and
 * round names, their real-prediction counts and whether each may be deleted
 * (gameDeletion at `now` under `rules`), the tournament's teams and
 * rounds, and the default time for a new game.
 */
export async function loadAdminGames(
  db: Executor,
  tournament: Tournament,
  context: { readonly rules: RuleSet; readonly now: Instant },
): Promise<AdminGamesPage> {
  const season = await loadSeason(db, tournament);
  const teams = await listTeams(db, tournament);
  const names = new Map(teams.map(({ id, name }) => [id, name]));
  const roundList = await loadAdminRounds(db, tournament);
  const byNumber = new Map(roundList.map((round) => [round.number, round]));
  const counts = await realPredictionCounts(db, { tournament: tournament.id });
  const recorded = await gamesWithResultHistory(db, tournament);
  const finished = !season.mayRecalculateAt(context.now, context.rules);
  const listed = [...season.games]
    .sort((a, b) => b.id - a.id)
    .map((game) => {
      const round = byNumber.get(game.round);
      if (round === undefined) {
        throw new Error(
          `game ${String(game.id)} is in no round of its tournament`,
        );
      }
      return adminGameOf(game, {
        round,
        names,
        realPredictions: counts.get(game.id) ?? 0,
        resultHistory: recorded.has(game.id),
        finished,
      });
    });
  const latest = [...season.games].sort((a, b) => b.tipOff - a.tipOff)[0];
  return {
    games: listed,
    teams,
    rounds: roundList.map(({ id, number, name }) => ({ id, number, name })),
    latestTipOff: latest?.tipOff ?? null,
    lastRoundId: listed[0]?.roundId ?? null,
    finished,
  };
}

/** One team as /admin/teams lists it, with its outcome as entered. */
export interface AdminTeam {
  readonly id: TeamId;
  readonly name: string;
  readonly outcome: TeamOutcome;
}

export interface AdminTeamsPage {
  /** By id; a team never entered has a blank outcome. */
  readonly teams: readonly AdminTeam[];
  /** The standings table is marked final (R-43, R-92). */
  readonly final: boolean;
}

/** /admin/teams: the tournament's teams with their outcomes and the table's final mark. */
export async function loadAdminTeams(
  db: Executor,
  tournament: Tournament,
): Promise<AdminTeamsPage> {
  const teams = await listTeams(db, tournament);
  const outcomes = await loadTeamOutcomes(db, tournament);
  return {
    teams: teams.map(({ id, name }) => ({
      id,
      name,
      outcome: outcomes.outcomeOf(id) ?? {
        team: id,
        place: null,
        playOffs: false,
        finalFour: false,
        finalPlace: null,
      },
    })),
    final: outcomes.tableIsFinal,
  };
}
