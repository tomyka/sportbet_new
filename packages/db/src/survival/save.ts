import {
  ok,
  refuse,
  type PickContext,
  type PickRefusal,
  type Result,
  type RoundNumber,
  type SurvivalPick,
  type SurvivalPickEntry,
  type SurvivalRun,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor, Tx } from '../client';
import { keyOf } from '../edge';
import { lockPlayerStatuses } from '../player/repository';
import { decideUnderLock } from '../save-transaction';
import { loadSeason } from '../season/repository';
import { games } from '../season/schema';
import { listTeams } from '../team/repository';
import { teams } from '../team/schema';
import { findTournamentById } from '../tournament/repository';
import { loadSurvivalRun, writeSurvivalPick } from './repository';
import type { SurvivalAsk } from './request';

/** One survival save, as the form passed it (survivalPickFormEntry). */
export interface SurvivalSave extends Omit<SurvivalAsk, 'rules'> {
  readonly entry: SurvivalPickEntry;
}

interface LockedPick {
  readonly tournament: Tournament;
  readonly run: SurvivalRun;
  readonly context: PickContext;
  /** The round whose game rows are locked: the current one before the locks. */
  readonly lockedRound: RoundNumber | null;
}

/**
 * PredictionSurvivalController::updatePredictionSurvivalUser, as the form
 * passed it (survivalPickFormEntry), in one transaction (a savepoint when
 * `db` is one): the posted team's tournament (sportbet's "the row
 * governs", issue 255), the current round's game rows locked FOR SHARE in
 * id order, then the player's statuses (lockPlayerStatuses) as the mutex
 * of their picks; the season and the run read again under the locks and
 * judged by SurvivalRun.withPick at the later of `now` and the database's
 * time (`clock`); one survival_picks row written. A team not stored, or a
 * player not of its tournament, is `unknown-team`. Nothing is
 * recalculated, no status changes and no tournament lock is taken: nothing
 * derived is written. A refusal writes nothing (decideUnderLock); a lock
 * waited for past 5 s fails the save (lock_timeout).
 */
export async function saveSurvivalPick(
  db: Executor,
  save: SurvivalSave,
  clock: DatabaseClock = databaseClock,
): Promise<Result<SurvivalPick, PickRefusal>> {
  const { player, entry } = save;
  const decided = await decideUnderLock(db, {
    load: (tx) => lockForPick(tx, save, clock),
    unloaded: 'unknown-team',
    decide: (locked) => decidePick(locked, entry),
    write: (tx, { tournament, pick }) =>
      writeSurvivalPick(tx, tournament, player, pick),
  });
  return decided.ok ? { ok: true, value: decided.value.pick } : decided;
}

function decidePick(
  locked: LockedPick,
  entry: SurvivalPickEntry,
): Result<{ tournament: Tournament; pick: SurvivalPick }, PickRefusal> {
  const accepted = locked.run.withPick(entry.team, locked.context);
  if (!accepted.ok) return accepted;
  const round = locked.context.season.currentRound(locked.context.now);
  // The round moved on between the locks and the judging: its games are not
  // the ones locked.
  if (round === null || round !== locked.lockedRound) {
    return refuse('round-changed');
  }
  return ok({
    tournament: locked.tournament,
    pick: { round, team: entry.team },
  });
}

const tournamentRows = z.array(z.object({ tournament: z.int() }));
const gameRows = z.array(z.object({ id: z.int() }));

/**
 * The posted team's tournament with the locks taken: the current round's
 * game rows FOR SHARE in id order, then the player's statuses. Null when
 * the team is not stored or the player is not one of its tournament's.
 */
async function lockForPick(
  tx: Tx,
  save: SurvivalSave,
  clock: DatabaseClock,
): Promise<LockedPick | null> {
  const tournament = await tournamentOfTeam(tx, save.entry);
  if (tournament === null) return null;
  const before = await loadSeason(tx, tournament);
  const lockedRound = before.currentRound(save.now);
  if (lockedRound !== null) {
    const ids = before.games
      .filter((game) => game.round === lockedRound)
      .map((game) => game.id);
    gameRows.parse(
      await tx
        .select({ id: games.id })
        .from(games)
        .where(inArray(games.id, ids))
        .orderBy(asc(games.id))
        .for('share'),
    );
  }
  const statuses = await lockPlayerStatuses(tx, save.player);
  if (!statuses.some((row) => row.tournament === String(tournament.id)))
    return null;
  const now = await judgedAt(tx, clock, save.now);
  const context: PickContext = {
    season: await loadSeason(tx, tournament),
    teams: (await listTeams(tx, tournament)).map((row) => row.id),
    survivalPlayed: tournament.survival,
    now,
    ...(save.entry.shownRound === null
      ? {}
      : { shownRound: save.entry.shownRound }),
  };
  return {
    tournament,
    run: await loadSurvivalRun(tx, tournament, save.player),
    context,
    lockedRound,
  };
}

async function tournamentOfTeam(
  tx: Tx,
  entry: SurvivalPickEntry,
): Promise<Tournament | null> {
  const [row] = tournamentRows.parse(
    await tx
      .select({ tournament: teams.tournamentId })
      .from(teams)
      .where(eq(teams.id, keyOf(entry.team, 'team'))),
  );
  if (row === undefined) return null;
  const tournament = await findTournamentById(tx, row.tournament);
  if (tournament === undefined) {
    throw new Error(
      `saveSurvivalPick: tournament ${String(row.tournament)} is not stored`,
    );
  }
  return tournament;
}
