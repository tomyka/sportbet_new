import {
  dayAfter,
  joinTournament,
  ok,
  registrationIsOpen,
  STANDINGS_DEADLINE_ROUND,
  type FillInDice,
  type Instant,
  type JoinCandidate,
  type JoiningRefusal,
  type PlayerId,
  type RegistrationWindow,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { inChunks, instantOf, keyOf, stored } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { loadSeason } from '../season/repository';
import { games, rounds } from '../season/schema';
import { standingsPredictions } from '../standings/schema';
import { listTeams } from '../team/repository';
import { listTournaments } from '../tournament/repository';
import { tournaments } from '../tournament/schema';

/** Every tournament with its season, by id: what a new account may join. */
export async function loadJoinCandidates(
  db: Executor,
): Promise<JoinCandidate[]> {
  const candidates: JoinCandidate[] = [];
  const byId = (await listTournaments(db)).sort((a, b) => a.id - b.id);
  for (const tournament of byId) {
    candidates.push({ tournament, season: await loadSeason(db, tournament) });
  }
  return candidates;
}

const windowRows = z.array(
  z.object({
    id: z.int(),
    endsOn: z.iso.date().nullable(),
    games: z.int(),
    allScored: z.boolean(),
    firstTipOff: z.date().nullable(),
    standingsDeadline: z.date().nullable(),
  }),
);

/**
 * Each tournament's RegistrationWindow, by id, summed up in one query
 * instead of loading its season: the end as loadSeason sets it (the day
 * after its end date), its games, whether each has a result, its first
 * tip-off and its standings deadline (ST-2: the first tip-off from its
 * deadline round on, round 5 when none is set). The db tests hold it equal
 * to Season.registrationWindow on the same rows.
 */
export async function loadRegistrationWindows(
  db: Executor,
): Promise<RegistrationWindow[]> {
  const rows = await db
    .select({
      id: tournaments.id,
      endsOn: tournaments.endsOn,
      games: sql<number>`count(${games.id})::int`,
      allScored: sql<boolean>`coalesce(bool_and(${games.homeScore} is not null and ${games.awayScore} is not null) filter (where ${games.id} is not null), true)`,
      firstTipOff: sql<Date | null>`min(${games.tipOff})`.mapWith(games.tipOff),
      standingsDeadline:
        sql<Date | null>`min(${games.tipOff}) filter (where ${rounds.number} >= coalesce(${tournaments.standingsDeadlineRound}, ${STANDINGS_DEADLINE_ROUND}))`.mapWith(
          games.tipOff,
        ),
    })
    .from(tournaments)
    .leftJoin(games, eq(games.tournamentId, tournaments.id))
    .leftJoin(rounds, eq(rounds.id, games.roundId))
    .groupBy(tournaments.id)
    .orderBy(asc(tournaments.id));
  return windowRows.parse(rows).map((row) => ({
    endsAt:
      row.endsOn === null
        ? null
        : stored(dayAfter(row.endsOn), 'tournaments', row.id),
    games: row.games,
    allScored: row.allScored,
    firstTipOff:
      row.firstTipOff === null
        ? null
        : instantOf(row.firstTipOff, 'tournaments', String(row.id)),
    standingsDeadline:
      row.standingsDeadline === null
        ? null
        : instantOf(row.standingsDeadline, 'tournaments', String(row.id)),
  }));
}

/**
 * Whether a guest may register at all (ChecksRegistrationDeadline::
 * anyTournamentIsJoinable, registrationIsOpen) under the rule set: asked on
 * every guest page, so it reads one summary row per tournament
 * (loadRegistrationWindows), never a season.
 */
export async function isRegistrationOpen(
  db: Executor,
  now: Instant,
  rules: RuleSet,
): Promise<boolean> {
  return registrationIsOpen(await loadRegistrationWindows(db), now, rules);
}

export interface TournamentJoin {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly rules: RuleSet;
  readonly now: Instant;
  /** The fill-in generator's randomness (FI-2): a late joiner's rows. */
  readonly dice: FillInDice;
}

/** What a join wrote: whether the place is new, and how many late fill-ins. */
export interface Joined {
  readonly newcomer: boolean;
  readonly lateFillIns: number;
}

const placeRows = z.array(z.object({ player: z.int() }));

/**
 * TournamentRegistrationService::register, in one transaction (a savepoint
 * when `db` is one): the domain decides (joinTournament) from the
 * tournament's season, teams and whether the player is in it; each row is
 * then inserted only where it is missing, so a second join writes nothing
 * (PredictionRows::seedMissing). A late joiner's fill-ins (R-9) are scored
 * by recalculateUnderRuleSet under the same rule set - the one way derived
 * rows are made - whose refusal is an inconsistent database: it throws, and
 * the join is rolled back.
 */
export async function registerForTournament(
  db: Executor,
  joining: TournamentJoin,
): Promise<Result<Joined, JoiningRefusal>> {
  const { player, tournament, rules, now, dice } = joining;
  const playerKey = keyOf(player, 'player');
  return db.transaction(async (tx): Promise<Result<Joined, JoiningRefusal>> => {
    const season = await loadSeason(tx, tournament);
    const teams = (await listTeams(tx, tournament)).map(({ id }) => id);
    const places = placeRows.parse(
      await tx
        .select({ player: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournament.id),
            eq(tournamentPlayers.playerId, playerKey),
          ),
        ),
    );
    const decided = joinTournament({
      player,
      season,
      teams,
      alreadyIn: places.length > 0,
      rules,
      now,
      dice,
    });
    if (!decided.ok) return decided;
    const { newcomer, blankGames, standingsTeams, lateFillIns } = decided.value;
    if (newcomer) {
      await tx
        .insert(tournamentPlayers)
        .values({
          tournamentId: tournament.id,
          playerId: playerKey,
          switchedOff: false,
          adminHidden: false,
          fillIns: 0,
        })
        .onConflictDoNothing({
          target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
        });
    }
    const predictions: (typeof matchPredictions.$inferInsert)[] = [
      ...blankGames.map((game) => ({
        playerId: playerKey,
        gameId: game,
        home: null,
        away: null,
        origin: 'real' as const,
        filledInAt: null,
      })),
      ...lateFillIns.map((prediction) => ({
        playerId: playerKey,
        gameId: prediction.game,
        home: prediction.home,
        away: prediction.away,
        origin: prediction.origin,
        filledInAt:
          prediction.filledInAt === null
            ? null
            : new Date(prediction.filledInAt),
      })),
    ];
    await inChunks(predictions, (chunk) =>
      tx
        .insert(matchPredictions)
        .values(chunk)
        .onConflictDoNothing({
          target: [matchPredictions.playerId, matchPredictions.gameId],
        }),
    );
    await inChunks(
      standingsTeams.map((team) => ({
        playerId: playerKey,
        teamId: keyOf(team, 'team'),
        place: null,
        playOffs: null,
        finalFour: null,
        finalPlace: null,
      })),
      (chunk) =>
        tx
          .insert(standingsPredictions)
          .values(chunk)
          .onConflictDoNothing({
            target: [
              standingsPredictions.playerId,
              standingsPredictions.teamId,
            ],
          }),
    );
    if (lateFillIns.length > 0) {
      const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
      if (refusal !== null) {
        throw new Error(
          `registerForTournament: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
        );
      }
    }
    return ok({ newcomer, lateFillIns: lateFillIns.length });
  });
}
