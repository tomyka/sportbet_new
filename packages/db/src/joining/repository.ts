import {
  joinTournament,
  ok,
  registrationIsOpen,
  type FillInDice,
  type Instant,
  type JoinCandidate,
  type Joining,
  type JoiningRefusal,
  type PlayerId,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BoardEffect } from '../board-effect';
import type { Executor } from '../client';
import { inChunks, keyOf } from '../edge';
import { joinPublicLeague } from '../league/repository';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { lockTournamentForRecalculation } from '../recalculation/lock';
import { recalculateAndSave } from '../recalculation/repository';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';
import { loadTournamentCatalogue } from '../tournament/catalogue';
import { seedBlankRows } from './seed-blank-rows';

/** Every tournament with its season and public switch, by id: what a new account may join. */
export async function loadJoinCandidates(
  db: Executor,
): Promise<JoinCandidate[]> {
  const candidates: JoinCandidate[] = [];
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    candidates.push({
      tournament,
      season: await loadSeason(db, tournament),
      isPublic: profile.isPublic,
    });
  }
  return candidates;
}

/**
 * Whether a guest may register at all (ChecksRegistrationDeadline::
 * anyTournamentIsJoinable, registrationIsOpen), over the public
 * tournaments sign-up may join (R-50): asked on every guest page, so it
 * reads one catalogue row per tournament (loadTournamentCatalogue: its
 * window and public switch), never a season.
 */
export async function isRegistrationOpen(
  db: Executor,
  now: Instant,
): Promise<boolean> {
  const windows = (await loadTournamentCatalogue(db)).map(
    ({ window, profile }) => ({ window, isPublic: profile.isPublic }),
  );
  return registrationIsOpen(windows, now);
}

export interface TournamentJoin {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly now: Instant;
  /** The fill-in generator's randomness (FI-2): a late joiner's rows. */
  readonly dice: FillInDice;
}

/**
 * What a join wrote: whether the place is new, and how many late fill-ins.
 * A newcomer is a new listed player, so the board changed; a member's
 * take-in writes nothing that counts.
 */
export interface Joined extends BoardEffect {
  readonly newcomer: boolean;
  readonly lateFillIns: number;
}

const placeRows = z.array(z.object({ player: z.int() }));

/**
 * TournamentRegistrationService::register, in one transaction (a savepoint
 * when `db` is one), under the tournament's recalculation lock
 * (lockTournamentForRecalculation): the domain decides (joinTournament)
 * from the tournament's season, teams and whether the player is in it;
 * each row is then inserted only where it is missing, so a second join
 * writes nothing
 * (PredictionRows::seedMissing). A late joiner's fill-ins (R-9) are scored
 * by recalculateAndSave under the live source - the one way derived
 * rows are made - which throws on an inconsistent database, rolling the join
 * back.
 */
export async function registerForTournament(
  db: Executor,
  joining: TournamentJoin,
): Promise<Result<Joined, JoiningRefusal>> {
  const { player, tournament, now, dice } = joining;
  return db.transaction(async (tx): Promise<Result<Joined, JoiningRefusal>> => {
    // First, before the season is read: a result written meanwhile is
    // either seen whole or waits (lockTournamentForRecalculation).
    const lock = await lockTournamentForRecalculation(tx, tournament);
    const season = await loadSeason(tx, tournament);
    const teams = (await listTeams(tx, tournament)).map(({ id }) => id);
    const decided = joinTournament({
      player,
      season,
      teams,
      alreadyIn: await isPlaying(tx, tournament, player),
      now,
      dice,
    });
    if (!decided.ok) return decided;
    await writeJoin(tx, { player, tournament, joined: decided.value });
    const { newcomer, lateFillIns } = decided.value;
    if (lateFillIns.length > 0) {
      await recalculateAndSave(lock);
    }
    return ok({
      newcomer,
      lateFillIns: lateFillIns.length,
      boardChanged: newcomer,
    });
  });
}

/** Whether the player has a place in the tournament already. */
async function isPlaying(
  tx: Executor,
  tournament: Tournament,
  player: PlayerId,
): Promise<boolean> {
  const places = placeRows.parse(
    await tx
      .select({ player: tournamentPlayers.playerId })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournament.id),
          eq(tournamentPlayers.playerId, keyOf(player, 'player')),
        ),
      ),
  );
  return places.length > 0;
}

/** The late joiner's fill-ins (R-9) as rows: scored, so not blank. */
function lateFillInRows(
  playerKey: number,
  joined: Joining,
): (typeof matchPredictions.$inferInsert)[] {
  return joined.lateFillIns.map((prediction) => ({
    playerId: playerKey,
    gameId: prediction.game,
    home: prediction.home,
    away: prediction.away,
    origin: prediction.origin,
    filledInAt:
      prediction.filledInAt === null ? null : new Date(prediction.filledInAt),
  }));
}

/**
 * The decided join written, each row only where it is missing
 * (PredictionRows::seedMissing): a newcomer's place, a blank row per game
 * still open, the late fill-ins, a blank standings row per team.
 */
async function writeJoin(
  tx: Executor,
  write: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
    readonly joined: Joining;
  },
): Promise<void> {
  const { tournament, joined } = write;
  const playerKey = keyOf(write.player, 'player');
  if (joined.newcomer) {
    const league = await joinPublicLeague(tx, tournament, [write.player]);
    await tx
      .insert(tournamentPlayers)
      .values({
        tournamentId: tournament.id,
        playerId: playerKey,
        switchedOff: false,
        adminHidden: false,
        fillIns: 0,
        selectedLeagueId: league,
      })
      .onConflictDoNothing({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
      });
  }
  await seedBlankRows(tx, tournament, {
    players: [write.player],
    games: joined.blankGames,
    teams: joined.standingsTeams,
  });
  await inChunks(lateFillInRows(playerKey, joined), (chunk) =>
    tx
      .insert(matchPredictions)
      .values(chunk)
      .onConflictDoNothing({
        target: [matchPredictions.playerId, matchPredictions.gameId],
      }),
  );
}
