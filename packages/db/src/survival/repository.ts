import {
  Points,
  roundNumber,
  SurvivalRun,
  type PlayerId,
  type RoundNumber,
  type StoredSurvivalRow,
  type SurvivalPick,
  type TeamId,
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
import { rounds } from '../season/schema';
import { listTeams } from '../team/repository';
import { TournamentScope } from '../tournament/scope';
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

/**
 * Upserts every run's picks, one per player and round. A pick in a round,
 * of a team or by a player that is not one of the tournament's throws
 * (TournamentScope), and none is saved.
 */
export async function saveSurvivalPicks(
  db: Executor,
  tournament: Tournament,
  runs: ReadonlyMap<PlayerId, SurvivalRun>,
): Promise<void> {
  const scope = await TournamentScope.read(db, tournament);
  const save = 'saveSurvivalPicks';
  const rows = [...runs].flatMap(([player, run]) =>
    run.picks.map((pick) => ({
      playerId: scope.player(player, save),
      tournamentId: tournament.id,
      roundId: scope.roundId(pick.round, save),
      teamId: scope.team(pick.team, save),
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

/**
 * One survival pick written: the player's pick of the round moved to the
 * pick's team (survival_picks_pk). saveSurvivalPick's write; a round not
 * stored is an impossible state and throws.
 */
export async function writeSurvivalPick(
  tx: Executor,
  tournament: Tournament,
  player: PlayerId,
  pick: SurvivalPick,
): Promise<void> {
  const [round] = z.array(z.object({ id: z.int() })).parse(
    await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(
        and(
          eq(rounds.tournamentId, tournament.id),
          eq(rounds.number, pick.round),
        ),
      ),
  );
  if (round === undefined) {
    throw new Error(
      `writeSurvivalPick: round ${String(pick.round)} is not stored`,
    );
  }
  await tx
    .insert(survivalPicks)
    .values({
      playerId: keyOf(player, 'player'),
      tournamentId: tournament.id,
      roundId: round.id,
      teamId: keyOf(pick.team, 'team'),
    })
    .onConflictDoUpdate({
      target: [survivalPicks.playerId, survivalPicks.roundId],
      set: { teamId: excluded(survivalPicks.teamId) },
    });
}

/** The tournament's round names (`rounds.name`, empty when unnamed), by number. */
export async function loadRoundNames(
  db: Executor,
  tournament: Tournament,
): Promise<Map<RoundNumber, string>> {
  const rows = z
    .array(z.object({ id: z.int(), number: z.int(), name: z.string() }))
    .parse(
      await db
        .select({ id: rounds.id, number: rounds.number, name: rounds.name })
        .from(rounds)
        .where(eq(rounds.tournamentId, tournament.id))
        .orderBy(asc(rounds.number)),
    );
  return new Map(
    rows.map((row) => [
      stored(roundNumber(row.number), 'rounds', row.id),
      row.name,
    ]),
  );
}

/** One player's pick history in the tournament (SurvivalRun.stored); empty with none. */
export async function loadSurvivalRun(
  db: Executor,
  tournament: Tournament,
  player: PlayerId,
): Promise<SurvivalRun> {
  const runs = await loadSurvivalRuns(db, tournament, player);
  return runs.get(player) ?? SurvivalRun.EMPTY;
}

/**
 * Each player's pick history in the tournament through SurvivalRun.stored,
 * by player (one player's, when named).
 */
export async function loadSurvivalRuns(
  db: Executor,
  tournament: Tournament,
  player?: PlayerId,
): Promise<Map<PlayerId, SurvivalRun>> {
  const rows = await db
    .select({
      player: survivalPicks.playerId,
      round: rounds.number,
      team: survivalPicks.teamId,
    })
    .from(survivalPicks)
    .innerJoin(rounds, eq(rounds.id, survivalPicks.roundId))
    .where(
      and(
        eq(survivalPicks.tournamentId, tournament.id),
        player === undefined
          ? undefined
          : eq(survivalPicks.playerId, keyOf(player, 'player')),
      ),
    )
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

/** The tournament's teams' names, by id, in the team list's order. */
export async function loadTeamNames(
  db: Executor,
  tournament: Tournament,
): Promise<Map<TeamId, string>> {
  const teams = await listTeams(db, tournament);
  return new Map(teams.map((row) => [row.id, row.name]));
}
