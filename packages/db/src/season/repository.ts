import {
  dayAfter,
  Game,
  Rate,
  rateInvariant,
  Round,
  roundNumber,
  roundNumberInvariant,
  Score,
  scoreSideInvariant,
  Season,
  STAGES,
  type RoundNumber,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  gameOf,
  inChunks,
  instantOf,
  keyOf,
  stored,
  teamOf,
} from '../edge';
import { games, rounds } from './schema';

/** A round to save: its database id and display name, and the round itself. */
export interface SavedRound {
  readonly id: number;
  readonly name: string;
  readonly round: Round;
}

const roundRows = z.array(
  z.object({
    id: z.int(),
    number: roundNumberInvariant.schema,
    stage: z.enum(STAGES),
    rate: rateInvariant.schema,
    survival: z.boolean(),
    knockout: z.boolean(),
  }),
);

const gameRows = z.array(
  z.object({
    id: z.int(),
    round: z.int(),
    home: z.int(),
    away: z.int(),
    tipOff: z.date(),
    homeScore: scoreSideInvariant.schema.nullable(),
    awayScore: scoreSideInvariant.schema.nullable(),
    recordedWinner: z.int().nullable(),
    postponed: z.boolean(),
    lockedSince: z.date().nullable(),
  }),
);

/**
 * Upserts the tournament's rounds by id. A round id saved before under
 * another tournament moves to this one, unless a game, survival pick or
 * survival points row still names it: their composite foreign keys
 * (tournament_id, round_id) then refuse the move, so a round never changes
 * tournament under rows of the old one.
 */
export async function saveRounds(
  db: Executor,
  tournament: Tournament,
  saved: readonly SavedRound[],
): Promise<void> {
  await inChunks(saved, (chunk) =>
    db
      .insert(rounds)
      .overridingSystemValue()
      .values(
        chunk.map(({ id, name, round }) => ({
          id,
          tournamentId: tournament.id,
          number: round.number,
          name,
          stage: round.stage,
          rate: round.rate.value,
          survival: round.survival,
          knockout: round.knockout,
        })),
      )
      .onConflictDoUpdate({
        target: rounds.id,
        set: {
          tournamentId: excluded(rounds.tournamentId),
          number: excluded(rounds.number),
          name: excluded(rounds.name),
          stage: excluded(rounds.stage),
          rate: excluded(rounds.rate),
          survival: excluded(rounds.survival),
          knockout: excluded(rounds.knockout),
        },
      }),
  );
}

/** Each round's database id by its number, in one tournament. */
export async function roundIdsOf(
  db: Executor,
  tournament: Tournament,
): Promise<ReadonlyMap<RoundNumber, number>> {
  const rows = await db
    .select({ id: rounds.id, number: rounds.number })
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id));
  return new Map(
    z
      .array(z.object({ id: z.int(), number: z.int() }))
      .parse(rows)
      .map(({ id, number }) => [stored(roundNumber(number), 'rounds', id), id]),
  );
}

/** The round id a round number stands for, or a thrown programmer error. */
export function roundIdIn(
  ids: ReadonlyMap<RoundNumber, number>,
  round: RoundNumber,
  tournament: Tournament,
): number {
  const id = ids.get(round);
  if (id === undefined) {
    throw new Error(
      `tournament ${String(tournament.id)} has no round ${String(round)}`,
    );
  }
  return id;
}

/**
 * Upserts the tournament's games by id; each game's round must be saved.
 * A game id saved before under another tournament moves to this one only
 * with a round and teams of this one (the game's own composite foreign
 * keys); its predictions and points, keyed by game alone, move with it.
 * sportbet's game ids are unique across tournaments, so a load never does.
 */
export async function saveGames(
  db: Executor,
  tournament: Tournament,
  saved: readonly Game[],
): Promise<void> {
  const roundIds = await roundIdsOf(db, tournament);
  await inChunks(saved, (chunk) =>
    db
      .insert(games)
      .overridingSystemValue()
      .values(
        chunk.map((game) => ({
          id: game.id,
          tournamentId: tournament.id,
          roundId: roundIdIn(roundIds, game.round, tournament),
          homeTeamId: keyOf(game.home, 'team'),
          awayTeamId: keyOf(game.away, 'team'),
          tipOff: new Date(game.tipOff),
          homeScore: game.result?.home ?? null,
          awayScore: game.result?.away ?? null,
          recordedWinnerId:
            game.recordedWinner === null
              ? null
              : keyOf(game.recordedWinner, 'team'),
          postponed: game.postponed,
          lockedSince:
            game.lockedSince === null ? null : new Date(game.lockedSince),
        })),
      )
      .onConflictDoUpdate({
        target: games.id,
        set: {
          tournamentId: excluded(games.tournamentId),
          roundId: excluded(games.roundId),
          homeTeamId: excluded(games.homeTeamId),
          awayTeamId: excluded(games.awayTeamId),
          tipOff: excluded(games.tipOff),
          homeScore: excluded(games.homeScore),
          awayScore: excluded(games.awayScore),
          recordedWinnerId: excluded(games.recordedWinnerId),
          postponed: excluded(games.postponed),
          lockedSince: excluded(games.lockedSince),
        },
      }),
  );
}

/**
 * The tournament's season: its rounds through Round.stored and its games
 * through Game.stored, ending the day after its end date, or with no end
 * when the tournament has none yet (R-21).
 */
export async function loadSeason(
  db: Executor,
  tournament: Tournament,
): Promise<Season> {
  const roundResult = await db
    .select({
      id: rounds.id,
      number: rounds.number,
      stage: rounds.stage,
      rate: rounds.rate,
      survival: rounds.survival,
      knockout: rounds.knockout,
    })
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id))
    .orderBy(asc(rounds.number));
  const seasonRounds = roundRows.parse(roundResult).map((row) =>
    Round.stored({
      number: stored(roundNumber(row.number), 'rounds', row.id),
      stage: row.stage,
      rate: stored(Rate.of(row.rate), 'rounds', row.id),
      survival: row.survival,
      knockout: row.knockout,
    }),
  );
  const gameResult = await db
    .select({
      id: games.id,
      round: rounds.number,
      home: games.homeTeamId,
      away: games.awayTeamId,
      tipOff: games.tipOff,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      recordedWinner: games.recordedWinnerId,
      postponed: games.postponed,
      lockedSince: games.lockedSince,
    })
    .from(games)
    .innerJoin(rounds, eq(rounds.id, games.roundId))
    .where(eq(games.tournamentId, tournament.id))
    .orderBy(asc(games.id));
  const seasonGames = gameRows.parse(gameResult).map((row) => {
    const key = String(row.id);
    const result =
      row.homeScore === null || row.awayScore === null
        ? null
        : stored(Score.of(row.homeScore, row.awayScore), 'games', key);
    return stored(
      Game.stored({
        id: gameOf(row.id),
        round: stored(roundNumber(row.round), 'games', key),
        home: teamOf(row.home),
        away: teamOf(row.away),
        tipOff: instantOf(row.tipOff, 'games', key),
        result,
        recordedWinner:
          row.recordedWinner === null ? null : teamOf(row.recordedWinner),
        lockedSince:
          row.lockedSince === null
            ? null
            : instantOf(row.lockedSince, 'games', key),
        postponed: row.postponed,
      }),
      'games',
      key,
    );
  });
  return stored(
    Season.create({
      rounds: seasonRounds,
      games: seasonGames,
      endsAt:
        tournament.endsOn === null
          ? null
          : stored(dayAfter(tournament.endsOn), 'tournaments', tournament.id),
      ...(tournament.standingsDeadlineRound === null
        ? {}
        : { standingsDeadlineRound: tournament.standingsDeadlineRound }),
    }),
    'tournaments',
    tournament.id,
  );
}
