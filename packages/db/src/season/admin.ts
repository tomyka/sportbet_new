import {
  changeRound,
  deleteRound as decideDeleteRound,
  insertRound as decideInsertRound,
  ok,
  refuse,
  roundMovesPoints,
  roundNumber,
  type ChangeRoundRefusal,
  type DeleteRoundRefusal,
  type InsertRoundRefusal,
  type Instant,
  type Result,
  type RoundEntry,
  type Season,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { stored } from '../edge';
import { lockTournamentById, type TournamentLock } from '../recalculation/lock';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { saveTransaction } from '../save-transaction';
import { survivalPicks } from '../survival/schema';
import { survivalPoints } from '../points/schema';
import { loadSeason } from './repository';
import { rounds } from './schema';

/** What every structure writer is told besides what it writes. */
export interface StructureWrite {
  /** The tournament written, by its id; read again under the lock. */
  readonly tournament: Tournament;
  readonly now: Instant;
}

/** The tournament as it stands under its lock, its season, and whether R-110 freezes it. */
export interface LockedSeason {
  readonly lock: TournamentLock;
  readonly season: Season;
  /** The moment the writer judges at: the later of `now` and the database's time. */
  readonly judged: Instant;
  /** R-110, R-22: the season is finished and the app freezes finished tournaments. */
  readonly finished: boolean;
}

/**
 * The tournament's recalculation lock, taken first (lockTournamentForRecalculation's
 * order), or null when the tournament is gone.
 */
export function lockStructure(
  tx: Executor,
  tournament: Tournament,
): Promise<TournamentLock | null> {
  return lockTournamentById(tx, tournament.id);
}

/**
 * The season under the lock, judged at the later of `now` and the
 * database's time (R-110's finished guard reads the moment the lock was
 * won, as saveResult's does).
 */
export async function readSeason(
  tx: Executor,
  lock: TournamentLock,
  write: Pick<StructureWrite, 'now'>,
  clock: DatabaseClock,
): Promise<LockedSeason> {
  const season = await loadSeason(tx, lock.tournament);
  const judged = await judgedAt(tx, clock, write.now);
  return {
    lock,
    season,
    judged,
    finished: !season.mayRecalculateAt(judged),
  };
}

/**
 * Recalculates the tournament under `rules`, as its row stands now; a
 * refusal is an inconsistent database: it throws, rolling the writer back.
 */
export async function recalculateStructure(
  lock: TournamentLock,
  writer: string,
): Promise<void> {
  const refusal = await recalculateUnderRuleSet(await lock.refreshed());
  if (refusal !== null) {
    throw new Error(
      `${writer}: tournament ${String(lock.tournament.id)} could not be recalculated (${refusal})`,
    );
  }
}

const roundKeyRows = z.array(z.object({ id: z.int(), number: z.int() }));

/** The tournament's round with database id `id`, or undefined (also for another tournament's). */
async function roundNumberOf(tx: Executor, tournament: Tournament, id: number) {
  const [row] = roundKeyRows.parse(
    await tx
      .select({ id: rounds.id, number: rounds.number })
      .from(rounds)
      .where(and(eq(rounds.id, id), eq(rounds.tournamentId, tournament.id))),
  );
  return row === undefined
    ? undefined
    : stored(roundNumber(row.number), 'rounds', row.id);
}

/** A round to add, its form already checked (roundFormEntry). */
export interface RoundInsert extends StructureWrite {
  readonly entry: RoundEntry;
}

/** A change to the round with database id `round` (sportbet's `eventID`). */
export interface RoundUpdate extends StructureWrite {
  readonly round: number;
  readonly entry: RoundEntry;
}

export interface RoundDelete extends StructureWrite {
  readonly round: number;
}

export type RoundInsertRefusal = 'no-tournament' | InsertRoundRefusal;
export type RoundUpdateRefusal = 'no-tournament' | ChangeRoundRefusal;
export type RoundDeleteRefusal = 'no-tournament' | DeleteRoundRefusal;

/**
 * EventController::insertEvent in one transaction under the tournament's
 * recalculation lock, waiting at most 5 s for it: the season is read under
 * the lock and the domain decides (insertRound: R-110, a duplicate number).
 * Returns the new round's database id. A round with no game moves no point,
 * so nothing recalculates. A refusal writes nothing.
 */
export async function insertRound(
  db: Executor,
  write: RoundInsert,
  clock: DatabaseClock = databaseClock,
): Promise<Result<{ readonly round: number }, RoundInsertRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<{ round: number }, RoundInsertRefusal>> => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { season, finished } = await readSeason(tx, lock, write, clock);
      const decided = decideInsertRound(season, write.entry, { finished });
      if (!decided.ok) return decided;
      const { round } = decided.value;
      const [inserted] = await tx
        .insert(rounds)
        .values({
          tournamentId: lock.tournament.id,
          number: round.number,
          name: decided.value.name,
          stage: round.stage,
          rate: round.rate.value,
          survival: round.survival,
          knockout: round.knockout,
        })
        .returning({ id: rounds.id });
      if (inserted === undefined) {
        throw new Error('insertRound: the inserted round has no id');
      }
      return ok({ round: inserted.id });
    },
  );
}

/**
 * EventController::updateEvent, in one transaction under the tournament's
 * lock: the round must be the tournament's (a round id of another
 * tournament is `unknown-round`), the domain decides (changeRound: R-110, a
 * duplicate number), the row is written and - when its number, stage, rate
 * or a flag changed (roundMovesPoints) - the tournament recalculated under
 * `rules`. A refusal writes nothing.
 */
export async function updateRound(
  db: Executor,
  write: RoundUpdate,
  clock: DatabaseClock = databaseClock,
): Promise<Result<null, RoundUpdateRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<null, RoundUpdateRefusal>> => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { season, finished } = await readSeason(tx, lock, write, clock);
      const number = await roundNumberOf(tx, lock.tournament, write.round);
      if (number === undefined) return refuse('unknown-round');
      const decided = changeRound(season, number, write.entry, { finished });
      if (!decided.ok) return decided;
      const { round } = decided.value;
      await tx
        .update(rounds)
        .set({
          number: round.number,
          name: decided.value.name,
          stage: round.stage,
          rate: round.rate.value,
          survival: round.survival,
          knockout: round.knockout,
        })
        .where(eq(rounds.id, write.round));
      const before = season.round(number);
      if (before === undefined || roundMovesPoints(before, round)) {
        await recalculateStructure(lock, 'updateRound');
      }
      return ok(null);
    },
  );
}

/** Whether a survival pick or points row still names the round. */
async function hasSurvivalRows(
  tx: Executor,
  tournament: Tournament,
  round: number,
): Promise<boolean> {
  const picks = await tx
    .select({ round: survivalPicks.roundId })
    .from(survivalPicks)
    .where(
      and(
        eq(survivalPicks.tournamentId, tournament.id),
        eq(survivalPicks.roundId, round),
      ),
    )
    .limit(1);
  if (picks.length > 0) return true;
  const points = await tx
    .select({ round: survivalPoints.roundId })
    .from(survivalPoints)
    .where(
      and(
        eq(survivalPoints.tournamentId, tournament.id),
        eq(survivalPoints.roundId, round),
      ),
    )
    .limit(1);
  return points.length > 0;
}

/**
 * EventController::updateEvent's delete, in one transaction under the
 * tournament's lock. The domain decides (deleteRound: R-110, the round
 * exists and holds no game, no survival pick or points row names it); an
 * empty round moves no point, so nothing recalculates. A refusal writes
 * nothing.
 */
export async function deleteRound(
  db: Executor,
  write: RoundDelete,
  clock: DatabaseClock = databaseClock,
): Promise<Result<null, RoundDeleteRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<Result<null, RoundDeleteRefusal>> => {
      const lock = await lockStructure(tx, write.tournament);
      if (lock === null) return refuse('no-tournament');
      const { season, finished } = await readSeason(tx, lock, write, clock);
      const number = await roundNumberOf(tx, lock.tournament, write.round);
      if (number === undefined) return refuse('unknown-round');
      const decided = decideDeleteRound(season, number, {
        finished,
        hasPicks: await hasSurvivalRows(tx, lock.tournament, write.round),
      });
      if (!decided.ok) return decided;
      await tx.delete(rounds).where(eq(rounds.id, write.round));
      return ok(null);
    },
  );
}
