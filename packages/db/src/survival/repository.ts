import {
  Points,
  roundNumber,
  SurvivalRun,
  type PlayerId,
  type StoredSurvivalRow,
  type SurvivalPick,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import {
  excluded,
  inChunks,
  keyOf,
  playerOf,
  stored,
  teamOf,
  unitsOf,
} from '../edge';
import { survivalPoints, type PointsSource } from '../points/schema';
import { roundIdIn, roundIdsOf } from '../season/repository';
import { rounds } from '../season/schema';
import { survivalPicks } from './schema';

const pickRows = z.array(
  z.object({ player: z.int(), round: z.int(), team: z.int() }),
);

const storedRows = z.array(
  z.object({
    id: z.int(),
    player: z.int(),
    round: z.int(),
    team: z.int(),
    points: z.string(),
  }),
);

/** Upserts every run's picks, one per player and round. */
export async function saveSurvivalPicks(
  db: Executor,
  tournament: Tournament,
  runs: ReadonlyMap<PlayerId, SurvivalRun>,
): Promise<void> {
  const roundIds = await roundIdsOf(db, tournament);
  const rows = [...runs].flatMap(([player, run]) =>
    run.picks.map((pick) => ({
      playerId: keyOf(player, 'player'),
      tournamentId: tournament.id,
      roundId: roundIdIn(roundIds, pick.round, tournament),
      teamId: keyOf(pick.team, 'team'),
    })),
  );
  await inChunks(rows, (chunk) =>
    db
      .insert(survivalPicks)
      .values(chunk)
      .onConflictDoUpdate({
        target: [survivalPicks.playerId, survivalPicks.roundId],
        set: { teamId: excluded(survivalPicks.teamId) },
      }),
  );
}

/** Each player's pick history in the tournament through SurvivalRun.stored, by player. */
export async function loadSurvivalRuns(
  db: Executor,
  tournament: Tournament,
): Promise<Map<PlayerId, SurvivalRun>> {
  const rows = await db
    .select({
      player: survivalPicks.playerId,
      round: rounds.number,
      team: survivalPicks.teamId,
    })
    .from(survivalPicks)
    .innerJoin(rounds, eq(rounds.id, survivalPicks.roundId))
    .where(eq(survivalPicks.tournamentId, tournament.id))
    .orderBy(asc(survivalPicks.playerId), asc(rounds.number));
  const byPlayer = new Map<number, SurvivalPick[]>();
  for (const row of pickRows.parse(rows)) {
    byPlayer.set(row.player, [
      ...(byPlayer.get(row.player) ?? []),
      {
        round: stored(roundNumber(row.round), 'survival_picks', row.player),
        team: teamOf(row.team),
      },
    ]);
  }
  return new Map(
    [...byPlayer].map(([player, picks]) => [
      playerOf(player),
      stored(SurvivalRun.stored(picks), 'survival_picks', player),
    ]),
  );
}

/**
 * The tournament's survival rows of `source` as the stored rows sportbet's
 * full recalculation refolds (SU-10), by sportbet's id, which is each
 * stored row's id. Only a production row is a stored row with a sportbet
 * id: a derived row of the named source is a programmer error, and throws.
 */
export async function loadStoredSurvivalRows(
  db: Executor,
  tournament: Tournament,
  source: PointsSource,
): Promise<StoredSurvivalRow[]> {
  const rows = await db
    .select({
      rowId: survivalPoints.id,
      id: survivalPoints.sportbetId,
      player: survivalPoints.playerId,
      round: rounds.number,
      team: survivalPoints.teamId,
      points: survivalPoints.points,
    })
    .from(survivalPoints)
    .innerJoin(rounds, eq(rounds.id, survivalPoints.roundId))
    .where(
      and(
        eq(survivalPoints.tournamentId, tournament.id),
        eq(survivalPoints.source, source),
      ),
    )
    .orderBy(asc(survivalPoints.sportbetId));
  const derived = rows.find(({ id }) => id === null);
  if (derived !== undefined) {
    throw new Error(
      `loadStoredSurvivalRows: ${source} survival row ${String(derived.rowId)} is derived, not a stored row with a sportbet id`,
    );
  }
  return storedRows.parse(rows).map((row) => ({
    id: row.id,
    player: playerOf(row.player),
    round: stored(roundNumber(row.round), 'survival_points', row.id),
    team: teamOf(row.team),
    storedPoints: stored(
      Points.ofHundredths(
        unitsOf(row.points, 2, 'survival_points', String(row.id)),
      ),
      'survival_points',
      row.id,
    ),
  }));
}
