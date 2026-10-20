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
  type Season,
  type Stage,
  type TeamId,
  type TeamOutcome,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { stored } from '../edge';
import { realPredictionCounts } from '../season/real-predictions';
import { loadSeason } from '../season/repository';
import { games, rounds } from '../season/schema';
import { auditResults } from '../result/schema';
import { listTeams, loadTeamOutcomes, type TeamRow } from '../team/repository';
import { survivalPickCounts } from '../survival/picks-on-games';
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

const gameCountRows = z.array(z.object({ round: z.int(), games: z.int() }));

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
      .select({ round: games.roundId, games: count() })
      .from(games)
      .where(eq(games.tournamentId, tournament.id))
      .groupBy(games.roundId),
  );
  const heldBy = new Map(held.map(({ round, games: n }) => [round, n]));
  return rows.map((row) => ({
    id: row.id,
    number: stored(roundNumber(row.number), 'rounds', row.id),
    name: row.name,
    stage: row.stage,
    rate: stored(Rate.of(row.rate), 'rounds', row.id),
    survival: row.survival,
    knockout: row.knockout,
    games: heldBy.get(row.id) ?? 0,
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

/** The tournament's games (or just `only`) an audit_results row names: a result or postponement was once entered (R-69). */
async function gamesWithResultHistory(
  db: Executor,
  tournament: Tournament,
  only: GameId | null,
): Promise<Set<number>> {
  const rows = auditedRows.parse(
    await db
      .select({ game: auditResults.gameId })
      .from(auditResults)
      .innerJoin(games, eq(games.id, auditResults.gameId))
      .where(
        and(
          eq(games.tournamentId, tournament.id),
          only === null ? undefined : eq(games.id, only),
        ),
      ),
  );
  return new Set(rows.map(({ game }) => game));
}

/** What a game's row is listed with besides the game itself. */
interface GameListing {
  readonly round: AdminRoundRow;
  readonly names: ReadonlyMap<TeamId, string>;
  readonly realPredictions: number;
  readonly survivalPicks: number;
  readonly resultHistory: boolean;
  readonly finished: boolean;
}

function adminGameOf(game: Game, listing: GameListing): AdminGame {
  const { round, names, realPredictions } = listing;
  const deletion = gameDeletion(game, {
    realPredictions,
    survivalPicks: listing.survivalPicks,
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

/** What listing a tournament's games (or one of them) is decided from: read once, then each row is made by `listedGame`. */
interface ListingFacts {
  readonly season: Season;
  readonly teams: readonly TeamRow[];
  readonly rounds: readonly AdminRoundRow[];
  readonly counts: ReadonlyMap<GameId, number>;
  readonly picks: ReadonlyMap<GameId, number>;
  readonly recorded: ReadonlySet<number>;
  readonly finished: boolean;
}

/** The facts of the whole tournament's list, or, with `only`, of that game's row alone. */
async function listingFacts(
  db: Executor,
  tournament: Tournament,
  context: { readonly rules: RuleSet; readonly now: Instant },
  only: GameId | null,
): Promise<ListingFacts> {
  const season = await loadSeason(db, tournament);
  return {
    season,
    teams: await listTeams(db, tournament),
    rounds: await loadAdminRounds(db, tournament),
    counts: await realPredictionCounts(
      db,
      only === null ? { tournament: tournament.id } : { game: only },
    ),
    picks: await survivalPickCounts(
      db,
      only === null ? { tournament: tournament.id } : { game: only },
    ),
    recorded: await gamesWithResultHistory(db, tournament, only),
    finished: !season.mayRecalculateAt(context.now),
  };
}

/** The one place a game's list row is made, so the page and the single-game answer cannot differ. */
function listedGame(game: Game, facts: ListingFacts): AdminGame {
  const round = facts.rounds.find(({ number }) => number === game.round);
  if (round === undefined) {
    throw new Error(`game ${String(game.id)} is in no round of its tournament`);
  }
  return adminGameOf(game, {
    round,
    names: new Map(facts.teams.map(({ id, name }) => [id, name])),
    realPredictions: facts.counts.get(game.id) ?? 0,
    survivalPicks: facts.picks.get(game.id) ?? 0,
    resultHistory: facts.recorded.has(game.id),
    finished: facts.finished,
  });
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
  const facts = await listingFacts(db, tournament, context, null);
  const { season } = facts;
  const listed = [...season.games]
    .sort((a, b) => b.id - a.id)
    .map((game) => listedGame(game, facts));
  const latest = [...season.games].sort((a, b) => b.tipOff - a.tipOff)[0];
  return {
    games: listed,
    teams: facts.teams,
    rounds: facts.rounds.map(({ id, number, name }) => ({ id, number, name })),
    latestTipOff: latest?.tipOff ?? null,
    lastRoundId: listed[0]?.roundId ?? null,
    finished: facts.finished,
  };
}

/**
 * One game as /admin/games lists it - the same row, from the same facts -
 * or null when the tournament has no such game (none, or another
 * tournament's).
 */
export async function findAdminGame(
  db: Executor,
  tournament: Tournament,
  id: GameId,
  context: { readonly rules: RuleSet; readonly now: Instant },
): Promise<AdminGame | null> {
  const facts = await listingFacts(db, tournament, context, id);
  const game = facts.season.games.find((candidate) => candidate.id === id);
  return game === undefined ? null : listedGame(game, facts);
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
