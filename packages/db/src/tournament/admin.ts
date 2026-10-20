import {
  ok,
  refuse,
  tournamentChange,
  tournamentSchema,
  type Instant,
  type PlayerId,
  type Result,
  type RuleSet,
  type Tournament,
  type TournamentChangeRefusal,
  type TournamentEntry,
} from '@sportbet/domain';
import { and, eq, ne } from 'drizzle-orm';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { keyOf } from '../edge';
import { playerSettings } from '../account/schema';
import { ensurePublicLeague } from '../league/repository';
import { lockTournamentById } from '../recalculation/lock';
import { loadSeason } from '../season/repository';
import { saveTransaction } from '../save-transaction';
import { violatedUnique } from '../sql-state';
import { findTournamentById, tournamentColumns } from './repository';
import { tournaments } from './schema';

/** Why a tournament was not written: its slug is another's, it is gone, or R-110 froze it. */
export type TournamentWriteRefusal =
  'slug-taken' | 'no-tournament' | TournamentChangeRefusal;

/** The columns a tournament entry fills, as a row (the format is always Euroleague, decision 11). */
function rowOf(entry: TournamentEntry) {
  return {
    slug: entry.slug,
    name: entry.name,
    endsOn: entry.endsOn,
    standingsDeadlineRound: entry.standingsDeadlineRound,
    survival: entry.survival,
    status: entry.status,
    startsOn: entry.startsOn,
    description: entry.description,
    isPublic: entry.isPublic,
  };
}

/**
 * TournamentController::adminStore: the tournament, its hub profile and its
 * public league (every tournament has one, as ensurePublicLeague makes it)
 * in one transaction. A slug another tournament holds is refused, with
 * nothing written; the table's unique key decides when two creators race.
 * A new tournament has no players, games or points, so nothing recalculates.
 */
export async function createTournament(
  db: Executor,
  entry: TournamentEntry,
): Promise<Result<Tournament, 'slug-taken'>> {
  try {
    return await db.transaction(
      async (tx): Promise<Result<Tournament, 'slug-taken'>> => {
        const inserted = await tx
          .insert(tournaments)
          .values({
            ...rowOf(entry),
            format: 'euroleague',
            standingsTableFinal: false,
          })
          .onConflictDoNothing({ target: tournaments.slug })
          .returning({ id: tournaments.id });
        const [row] = inserted;
        if (row === undefined) return refuse('slug-taken');
        const tournament = await findTournamentById(tx, row.id);
        if (tournament === undefined) {
          throw new Error('createTournament: the inserted tournament is gone');
        }
        await ensurePublicLeague(tx, tournament);
        return ok(tournament);
      },
    );
  } catch (error) {
    if (violatedUnique(error) === 'tournaments_slug_unique') {
      return refuse('slug-taken');
    }
    throw error;
  }
}

/** One tournament's change, its form already checked (tournamentFormEntry). */
export interface TournamentUpdate {
  readonly tournament: Tournament;
  readonly entry: TournamentEntry;
  readonly rules: RuleSet;
  readonly now: Instant;
}

/** Whether another tournament holds the slug. */
async function slugHeldByAnother(
  tx: Executor,
  tournament: Tournament,
  slug: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.slug, slug), ne(tournaments.id, tournament.id)));
  return rows.length > 0;
}

/**
 * TournamentController::adminUpdate, in one transaction under the
 * tournament's recalculation lock, waiting at most 5 s for it: the
 * tournament is read again under the lock, and decided there. R-110: on a
 * finished tournament (R-21; frozen under the ruled set, R-22) a changed end
 * date, survival or deadline round is refused, and nothing is written. No
 * derived row reads those three fields (recalculateTournament takes the
 * season, the picks and the outcomes), so nothing recalculates; the end date
 * only decides whether the tournament is finished (R-21), asked again by
 * every later writer.
 */
export async function updateTournament(
  db: Executor,
  update: TournamentUpdate,
  clock: DatabaseClock = databaseClock,
): Promise<Result<Tournament, TournamentWriteRefusal>> {
  const { entry } = update;
  try {
    return await saveTransaction(
      db,
      async (tx): Promise<Result<Tournament, TournamentWriteRefusal>> => {
        const lock = await lockTournamentById(tx, update.tournament.id);
        if (lock === null) return refuse('no-tournament');
        const { tournament } = lock;
        const season = await loadSeason(tx, tournament);
        const judged = await judgedAt(tx, clock, update.now);
        const decided = tournamentChange(tournament, entry, {
          finished: !season.mayRecalculateAt(judged),
        });
        if (!decided.ok) return decided;
        if (await slugHeldByAnother(tx, tournament, entry.slug)) {
          return refuse('slug-taken');
        }
        await tx
          .update(tournaments)
          .set(rowOf(entry))
          .where(eq(tournaments.id, tournament.id));
        const written = await lock.refreshed();
        return ok(written.tournament);
      },
    );
  } catch (error) {
    if (violatedUnique(error) === 'tournaments_slug_unique') {
      return refuse('slug-taken');
    }
    throw error;
  }
}

/**
 * The tournament the admin works on at /admin/events, /admin/games and
 * /admin/teams (sportbet's `adminEnterContext`, stored with the account as
 * R-28 stores the last-used one). A tournament that does not exist is
 * refused. Every account has its settings row; one without is a programmer
 * error.
 */
export async function chooseAdminTournament(
  db: Executor,
  player: PlayerId,
  tournament: number,
): Promise<Result<null, 'no-tournament'>> {
  if ((await findTournamentById(db, tournament)) === undefined) {
    return refuse('no-tournament');
  }
  const saved = await db
    .update(playerSettings)
    .set({ adminTournamentId: tournament })
    .where(eq(playerSettings.playerId, keyOf(player, 'player')))
    .returning({ player: playerSettings.playerId });
  if (saved.length === 0) {
    throw new Error('chooseAdminTournament: the player has no settings');
  }
  return ok(null);
}

/** The admin's chosen tournament; null when none was chosen or it has been deleted. */
export async function loadAdminTournament(
  db: Executor,
  player: PlayerId,
): Promise<Tournament | null> {
  const [row] = await db
    .select(tournamentColumns)
    .from(playerSettings)
    .innerJoin(
      tournaments,
      eq(tournaments.id, playerSettings.adminTournamentId),
    )
    .where(eq(playerSettings.playerId, keyOf(player, 'player')))
    .limit(1);
  return row === undefined ? null : tournamentSchema.parse(row);
}
