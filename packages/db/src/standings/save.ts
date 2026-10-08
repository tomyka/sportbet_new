import {
  predictStandingsRow,
  reorderStandings,
  type Instant,
  type PlacedTeam,
  type PlayerId,
  type ReorderRefusal,
  type Result,
  type Season,
  type StandingsEntry,
  type StandingsRowRefusal,
  type TeamId,
  type TeamPick,
} from '@sportbet/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import { z } from 'zod';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor, Tx } from '../client';
import { keyOf, teamOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { teams } from '../team/schema';
import { saveTransaction } from '../save-transaction';
import { findTournamentById, tournamentIdRows } from '../tournament/repository';
import { picksOf, standingsColumns } from './repository';
import { standingsPredictions } from './schema';

const teamKeys = z.array(z.object({ id: z.int() }));

/** A save's target, its rows locked, and the moment it is judged at. */
interface LockedTarget {
  readonly teams: readonly TeamId[];
  readonly rows: readonly TeamPick[];
  readonly season: Season;
  readonly judged: Instant;
}

/**
 * The save's target, locked: the posted team's tournament (issue 255: the
 * row's, never the request's), of which the player must be a player; their
 * rows of its teams seeded where missing (a team added after joining has
 * none), then locked by team (FOR UPDATE); its season, whose deadline
 * decides (ST-2), and the moment judged at - the later of `now` and the
 * database's time once the rows are locked. Null: not the player's (no
 * such team, or not playing).
 */
async function lockTarget(
  tx: Executor,
  player: PlayerId,
  team: TeamId,
  now: Instant,
  clock: DatabaseClock,
): Promise<LockedTarget | null> {
  const [found] = tournamentIdRows.parse(
    await tx
      .select({ tournament: teams.tournamentId })
      .from(teams)
      .where(eq(teams.id, keyOf(team, 'team'))),
  );
  if (found === undefined) return null;
  const playerKey = keyOf(player, 'player');
  const playing = await tx
    .select({ player: tournamentPlayers.playerId })
    .from(tournamentPlayers)
    .where(
      and(
        eq(tournamentPlayers.playerId, playerKey),
        eq(tournamentPlayers.tournamentId, found.tournament),
      ),
    );
  if (playing.length === 0) return null;
  const tournament = await findTournamentById(tx, found.tournament);
  if (tournament === undefined) {
    throw new Error(
      `standings save: tournament ${String(found.tournament)} is not stored`,
    );
  }
  const keys = teamKeys
    .parse(
      await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.tournamentId, tournament.id))
        .orderBy(asc(teams.id)),
    )
    .map(({ id }) => id);
  await tx
    .insert(standingsPredictions)
    .values(keys.map((teamId) => ({ playerId: playerKey, teamId })))
    .onConflictDoNothing();
  const rows = picksOf(
    await tx
      .select(standingsColumns)
      .from(standingsPredictions)
      .where(
        and(
          eq(standingsPredictions.playerId, playerKey),
          inArray(standingsPredictions.teamId, keys),
        ),
      )
      .orderBy(asc(standingsPredictions.teamId))
      .for('update'),
  );
  const season = await loadSeason(tx, tournament);
  return {
    teams: keys.map(teamOf),
    rows,
    season,
    // Judged once the rows are locked, never earlier than the call.
    judged: await judgedAt(tx, clock, now),
  };
}

/**
 * One standings save (saveTransaction: one transaction waiting at most
 * 5 s for any lock). A refused save is rolled back whole, so the rows lockTarget seeded go
 * with it: a refusal writes nothing.
 */
async function standingsTransaction<T, R extends string>(
  db: Executor,
  save: (tx: Tx) => Promise<Result<T, R>>,
): Promise<Result<T, R>> {
  let refused: Result<T, R> | undefined;
  try {
    return await saveTransaction(db, async (tx) => {
      const result = await save(tx);
      if (!result.ok) {
        refused = result;
        tx.rollback();
      }
      return result;
    });
  } catch (error) {
    if (refused !== undefined && error instanceof TransactionRollbackError) {
      return refused;
    }
    throw error;
  }
}

/**
 * PredictionStandingController::updatePredictionStandingsUser, as the form
 * passed it (standingsFormEntry): the target locked (lockTarget), the row
 * decided by predictStandingsRow and written - its five columns, as
 * posted. Nothing is recalculated (no stage is decided while standings
 * are open), no status changes and no tournament lock is taken: no
 * derived row is written.
 */
export async function saveStandingsRow(
  db: Executor,
  save: {
    readonly player: PlayerId;
    readonly entry: StandingsEntry;
    readonly now: Instant;
  },
  clock: DatabaseClock = databaseClock,
): Promise<Result<TeamPick, StandingsRowRefusal>> {
  const { player, entry, now } = save;
  return standingsTransaction(db, async (tx) => {
    const target = await lockTarget(tx, player, entry.team, now, clock);
    const decided = predictStandingsRow({
      entry,
      target,
      now: target?.judged ?? now,
    });
    if (!decided.ok) return decided;
    const { place, playOffs, finalFour, finalPlace } = decided.value;
    await tx
      .update(standingsPredictions)
      .set({ place, playOffs, finalFour, finalPlace })
      .where(
        and(
          eq(standingsPredictions.playerId, keyOf(player, 'player')),
          eq(standingsPredictions.teamId, keyOf(entry.team, 'team')),
        ),
      );
    return decided;
  });
}

/**
 * PredictionStandingController::reorderPredictionStandingsUser: the target
 * is the first posted team's tournament, locked as a row save locks it;
 * the order decided by reorderStandings; only `place` is written, so ticks
 * and final places stay.
 */
export async function saveStandingsOrder(
  db: Executor,
  save: {
    readonly player: PlayerId;
    readonly order: readonly TeamId[];
    readonly now: Instant;
  },
  clock: DatabaseClock = databaseClock,
): Promise<Result<readonly PlacedTeam[], ReorderRefusal>> {
  const { player, order, now } = save;
  const [first] = order;
  return standingsTransaction(db, async (tx) => {
    const target =
      first === undefined
        ? null
        : await lockTarget(tx, player, first, now, clock);
    const decided = reorderStandings({
      order,
      target,
      now: target?.judged ?? now,
    });
    if (!decided.ok) return decided;
    const playerKey = keyOf(player, 'player');
    for (const { team, place } of decided.value) {
      await tx
        .update(standingsPredictions)
        .set({ place })
        .where(
          and(
            eq(standingsPredictions.playerId, playerKey),
            eq(standingsPredictions.teamId, keyOf(team, 'team')),
          ),
        );
    }
    return decided;
  });
}
