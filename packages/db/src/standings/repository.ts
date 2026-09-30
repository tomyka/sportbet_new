import {
  StandingsPrediction,
  type StoredTeamPick,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored, teamOf } from '../edge';
import { teams } from '../team/schema';
import { standingsPredictions } from './schema';

const standingsRows = z.array(
  z.object({
    player: z.int(),
    team: z.int(),
    place: z.int().nullable(),
    playOffs: z.boolean().nullable(),
    finalFour: z.boolean().nullable(),
    finalPlace: z.int().nullable(),
  }),
);

/** Upserts every row of each prediction, by player and team. */
export async function saveStandingsPredictions(
  db: Executor,
  predictions: readonly StandingsPrediction[],
): Promise<void> {
  const rows = predictions.flatMap((prediction) =>
    prediction.picks.map((pick) => ({
      playerId: keyOf(prediction.player, 'player'),
      teamId: keyOf(pick.team, 'team'),
      place: pick.place,
      playOffs: pick.playOffs,
      finalFour: pick.finalFour,
      finalPlace: pick.finalPlace,
    })),
  );
  await inChunks(rows, (chunk) =>
    db
      .insert(standingsPredictions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [standingsPredictions.playerId, standingsPredictions.teamId],
        set: {
          place: excluded(standingsPredictions.place),
          playOffs: excluded(standingsPredictions.playOffs),
          finalFour: excluded(standingsPredictions.finalFour),
          finalPlace: excluded(standingsPredictions.finalPlace),
        },
      }),
  );
}

/**
 * One StandingsPrediction.stored per player with rows for the tournament's
 * teams, by player; each prediction's rows by team.
 */
export async function loadStandingsPredictions(
  db: Executor,
  tournament: Tournament,
): Promise<StandingsPrediction[]> {
  const rows = await db
    .select({
      player: standingsPredictions.playerId,
      team: standingsPredictions.teamId,
      place: standingsPredictions.place,
      playOffs: standingsPredictions.playOffs,
      finalFour: standingsPredictions.finalFour,
      finalPlace: standingsPredictions.finalPlace,
    })
    .from(standingsPredictions)
    .innerJoin(teams, eq(teams.id, standingsPredictions.teamId))
    .where(eq(teams.tournamentId, tournament.id))
    .orderBy(
      asc(standingsPredictions.playerId),
      asc(standingsPredictions.teamId),
    );
  const byPlayer = new Map<number, StoredTeamPick[]>();
  for (const row of standingsRows.parse(rows)) {
    byPlayer.set(row.player, [
      ...(byPlayer.get(row.player) ?? []),
      {
        team: teamOf(row.team),
        place: row.place,
        playOffs: row.playOffs,
        finalFour: row.finalFour,
        finalPlace: row.finalPlace,
      },
    ]);
  }
  return [...byPlayer].map(([player, picks]) =>
    stored(
      StandingsPrediction.stored(playerOf(player), picks),
      'standings_predictions',
      player,
    ),
  );
}
