import type {
  Instant,
  PlacedTeam,
  PlayerId,
  ReorderRefusal,
  Result,
  StandingsEntry,
  StandingsRowRefusal,
  TeamId,
  TeamPick,
} from '@sportbet/domain';
import { databaseClock, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { decideUnderLock } from '../save-transaction';
import {
  loadLockedStandingsTable,
  writeStandingsPlaces,
  writeStandingsRow,
} from './table-repository';

/**
 * PredictionStandingController::updatePredictionStandingsUser, as the form
 * passed it (standingsFormEntry): the posted team's table locked
 * (loadLockedStandingsTable), the row decided by StandingsTable.saveRow
 * and written - its five columns, as posted. Nothing is recalculated (no
 * stage is decided while standings are open), no status changes and no
 * tournament lock is taken: no derived row is written. A refusal writes
 * nothing (decideUnderLock).
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
  return decideUnderLock(db, {
    load: (tx) =>
      loadLockedStandingsTable(tx, { player, team: entry.team, now, clock }),
    unloaded: 'not-yours',
    decide: (table) => table.saveRow(entry),
    write: (tx, row) => writeStandingsRow(tx, player, row),
  });
}

/**
 * PredictionStandingController::reorderPredictionStandingsUser: the first
 * posted team's table locked as a row save locks it (no order, no table),
 * the order decided by StandingsTable.reorder; only places are written,
 * so ticks and final places stay.
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
  return decideUnderLock(db, {
    load: async (tx) =>
      first === undefined
        ? null
        : loadLockedStandingsTable(tx, { player, team: first, now, clock }),
    unloaded: 'not-yours',
    decide: (table) => table.reorder(order),
    write: (tx, placed) => writeStandingsPlaces(tx, player, placed),
  });
}
