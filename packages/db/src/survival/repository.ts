import {
  roundNumber,
  SurvivalRun,
  type Instant,
  type PlayerId,
  type SurvivalPick,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { excluded, inChunks, keyOf, playerOf, stored, teamOf } from '../edge';
import { rounds } from '../season/schema';
import { TournamentScope } from '../tournament/scope';
import { auditSurvivalPicks, survivalPicks } from './schema';

const pickRows = z.array(
  z.object({ player: z.int(), round: z.int(), team: z.int() }),
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
 * pick's team (survival_picks_pk), and an audit row (R-140) with the team it
 * replaced, judged at `at`. saveSurvivalPick's write, under the player's
 * statuses lock, so the replaced team read here is the one being replaced; a
 * round not stored is an impossible state and throws.
 */
export async function writeSurvivalPick(
  tx: Executor,
  tournament: Tournament,
  player: PlayerId,
  pick: SurvivalPick,
  at: Instant,
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
  const playerKey = keyOf(player, 'player');
  const teamKey = keyOf(pick.team, 'team');
  const [replaced] = z.array(z.object({ team: z.int() })).parse(
    await tx
      .select({ team: survivalPicks.teamId })
      .from(survivalPicks)
      .where(
        and(
          eq(survivalPicks.playerId, playerKey),
          eq(survivalPicks.roundId, round.id),
        ),
      ),
  );
  await tx
    .insert(survivalPicks)
    .values({
      playerId: playerKey,
      tournamentId: tournament.id,
      roundId: round.id,
      teamId: teamKey,
    })
    .onConflictDoUpdate({
      target: [survivalPicks.playerId, survivalPicks.roundId],
      set: { teamId: excluded(survivalPicks.teamId) },
    });
  await tx.insert(auditSurvivalPicks).values({
    playerId: playerKey,
    tournamentId: tournament.id,
    roundId: round.id,
    teamId: teamKey,
    oldTeamId: replaced?.team ?? null,
    at: new Date(at),
  });
}

/** One player's pick history in the tournament (SurvivalRun.stored); empty with none. */
export async function loadSurvivalRun(
  db: Executor,
  tournament: Tournament,
  player: PlayerId,
): Promise<SurvivalRun> {
  const rows = await picksOf(db)
    .where(
      and(
        eq(survivalPicks.tournamentId, tournament.id),
        eq(survivalPicks.playerId, keyOf(player, 'player')),
      ),
    )
    .orderBy(...PICK_ORDER);
  return runsOf(rows).get(player) ?? SurvivalRun.EMPTY;
}

/**
 * Each player's pick history in the tournament through SurvivalRun.stored,
 * by player.
 */
export async function loadSurvivalRuns(
  db: Executor,
  tournament: Tournament,
): Promise<Map<PlayerId, SurvivalRun>> {
  const rows = await picksOf(db)
    .where(eq(survivalPicks.tournamentId, tournament.id))
    .orderBy(...PICK_ORDER);
  return runsOf(rows);
}

/** The columns a pick is read with, still to be scoped and ordered. */
function picksOf(db: Executor) {
  return db
    .select({
      player: survivalPicks.playerId,
      round: rounds.number,
      team: survivalPicks.teamId,
    })
    .from(survivalPicks)
    .innerJoin(rounds, eq(rounds.id, survivalPicks.roundId));
}

const PICK_ORDER = [asc(survivalPicks.playerId), asc(rounds.number)];

/** Picks grouped by player, each through SurvivalRun.stored. */
function runsOf(rows: unknown): Map<PlayerId, SurvivalRun> {
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
