import type { Tournament } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { findTournamentById } from '../tournament/repository';

/**
 * The first key of every tournament recalculation lock: a fixed number no
 * other advisory lock in this app uses (the second key is the tournament's
 * id).
 */
export const RECALCULATION_LOCK_NAMESPACE = 21_007;

/**
 * Proof that a transaction holds one tournament's recalculation lock:
 * recalculateAndSave takes nothing else, so a recalculation without
 * the lock does not typecheck. Only lockTournamentForRecalculation makes
 * one, by taking the lock.
 */
export class TournamentLock {
  /** The transaction that holds the lock, until it ends. */
  readonly tx: Executor;
  readonly tournament: Tournament;

  private constructor(tx: Executor, tournament: Tournament) {
    this.tx = tx;
    this.tournament = tournament;
    Object.freeze(this);
  }

  /** lockTournamentForRecalculation's: the lock taken, then the proof. */
  static async take(
    tx: Executor,
    tournament: Tournament,
  ): Promise<TournamentLock> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${RECALCULATION_LOCK_NAMESPACE}::int, ${tournament.id}::int)`,
    );
    return new TournamentLock(tx, tournament);
  }

  /**
   * The same lock, with the tournament as its row stands now: what a writer
   * that changed the row (its end date, its standings mark) recalculates
   * under, since a recalculation reads the tournament it is handed.
   */
  async refreshed(): Promise<TournamentLock> {
    const current = await findTournamentById(this.tx, this.tournament.id);
    if (current === undefined) {
      throw new Error(
        `tournament ${String(this.tournament.id)} is gone under its recalculation lock`,
      );
    }
    return new TournamentLock(this.tx, current);
  }
}

/**
 * Serializes the writers that recalculate one tournament - saveResult,
 * registerForTournament, recalculateAll, the reader - so two never rewrite
 * its derived rows at once (pg_advisory_xact_lock, held until the
 * transaction ends). Taken first, before any row lock. The lock order every
 * writer keeps: this lock, then the game row (a result write FOR NO KEY
 * UPDATE, a prediction save FOR SHARE, an admin's game change or delete
 * FOR UPDATE), then the game's match_predictions
 * rows by player, then the players' tournament_players rows
 * (lockPlayerStatuses) by player, then by tournament. A league writer takes
 * the league row (`FOR UPDATE` when it changes the league or who is in it;
 * `FOR SHARE` for a switch or a leave, which a delete then waits for: the
 * switch's foreign keys take `FOR KEY SHARE` on that row, so the delete
 * could not lock the members and the switch the league in the other order),
 * then the league's invite row(s), then its members by player, then
 * lockPlayerStatuses by player; it holds no tournament, game or prediction
 * lock (selectLeague, the league writers in league/). The account writers
 * (deleteAccount, changeRole) take, before everything else, every
 * superadmin's player_settings row FOR UPDATE by player id
 * (lockSuperadmins, the last-superadmin guard). deleteAccount then takes the
 * recalculation lock of every tournament, in tournament id order - the one
 * writer that holds several; every one, since a join into any takes that
 * tournament's lock first - the player's
 * match_predictions rows by game, then the leagues they own, belong to or
 * are invited to by league id (the league row, the invites, the members, as
 * a league writer does, for each in turn), and last their
 * tournament_players rows (lockPlayerStatuses); a join or a league founded
 * meanwhile (foundLeague takes the statuses first and no league lock) is
 * seen after those locks and the deletion starts again, never locking out of
 * turn. Inside a
 * transaction only: the TournamentLock it returns is valid until `tx` ends.
 */
export function lockTournamentForRecalculation(
  tx: Executor,
  tournament: Tournament,
): Promise<TournamentLock> {
  return TournamentLock.take(tx, tournament);
}

/**
 * A tournament known by its id, locked (lockTournamentForRecalculation) and
 * read again once the lock is held, so the row a writer decides on is the
 * one it will write over; null when there is none. For the admin writers,
 * which are handed an id from a form.
 */
export async function lockTournamentById(
  tx: Executor,
  id: number,
): Promise<TournamentLock | null> {
  const known = await findTournamentById(tx, id);
  if (known === undefined) return null;
  const lock = await TournamentLock.take(tx, known);
  return (await findTournamentById(tx, id)) === undefined
    ? null
    : lock.refreshed();
}
