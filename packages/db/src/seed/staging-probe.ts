import {
  Game,
  gameId,
  roundNumber,
  secondsAfter,
  teamId,
  vilniusDay,
  vilniusTipOff,
  type Instant,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Executor } from '../client';
import { instantOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { saveGames } from '../season/repository';
import { games } from '../season/schema';

/**
 * The reminders' probe game (slice 16): staging-only seed data that gives
 * the owner a reminder to receive after every deploy. Round 1, a pair of
 * teams no other game uses, an id clear of the season's.
 */
export const PROBE_GAME = {
  id: 9010,
  round: 1,
  home: '9007',
  away: '9008',
} as const;

/** The local hour the probe game tips off, and how far ahead of the seed's clock it is at least. */
const PROBE_HOUR = '19:00';
const PROBE_MIN_LEAD_SECONDS = 3 * 3_600;
const DAY_MS = 86_400_000;

function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`seed: ${result.refusal}`);
  return result.value;
}

function nextDay(day: string): string {
  const noon = Date.parse(`${day}T12:00:00Z`);
  return new Date(noon + DAY_MS).toISOString().slice(0, 10);
}

/**
 * The next 19:00 in Vilnius at least three hours after `now`, so a deploy
 * is followed by the game's reminder (an hour before, 18:00) that day or the
 * next, and the owner has time to see it before it tips off.
 */
export function probeTipOff(now: Instant): Instant {
  const earliest = secondsAfter(now, PROBE_MIN_LEAD_SECONDS);
  const today = must(vilniusTipOff(`${vilniusDay(now)}T${PROBE_HOUR}`));
  if (today >= earliest) return today;
  return must(vilniusTipOff(`${nextDay(vilniusDay(now))}T${PROBE_HOUR}`));
}

export type ProbeOutcome = 'created' | 'moved' | 'kept' | 'closed';

const probeRows = z.array(
  z.object({ tipOff: z.date(), homeScore: z.int().nullable() }),
);
const playerRows = z.array(z.object({ player: z.int() }));

/** Every player of the tournament gets a blank row for the game, where missing. */
async function seedBlankRows(
  tx: Executor,
  tournament: Tournament,
): Promise<void> {
  const seated = playerRows.parse(
    await tx
      .select({ player: tournamentPlayers.playerId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id)),
  );
  if (seated.length === 0) return;
  await tx
    .insert(matchPredictions)
    .values(
      seated.map(({ player }) => ({
        playerId: player,
        gameId: PROBE_GAME.id,
        home: null,
        away: null,
        origin: 'real' as const,
        filledInAt: null,
      })),
    )
    .onConflictDoNothing({
      target: [matchPredictions.playerId, matchPredictions.gameId],
    });
}

async function createProbe(
  tx: Executor,
  tournament: Tournament,
  tipOff: Instant,
): Promise<void> {
  await saveGames(tx, tournament, [
    must(
      Game.schedule({
        id: must(gameId(PROBE_GAME.id)),
        round: must(roundNumber(PROBE_GAME.round)),
        home: must(teamId(PROBE_GAME.home)),
        away: must(teamId(PROBE_GAME.away)),
        tipOff,
      }),
    ),
  ]);
}

/**
 * Seeds the probe game, dated by `probeTipOff(now)`: created when missing,
 * moved forward on every later run while it has no result (the reminder of
 * the old date no longer describes it, so `reminded_at` is cleared, as
 * sportbet does for a moved game; the predictions are left as they are), and
 * left alone once it has a result or is already dated right. Every player of
 * the tournament has a blank row for it. Staging only: the bin passes a
 * clock only there, so CI's E2E stack never sees a game that moves.
 */
export async function seedProbeGame(
  db: Db,
  tournament: Tournament,
  now: Instant,
): Promise<ProbeOutcome> {
  return db.transaction(async (tx) => {
    const tipOff = probeTipOff(now);
    const [current] = probeRows.parse(
      await tx
        .select({ tipOff: games.tipOff, homeScore: games.homeScore })
        .from(games)
        .where(eq(games.id, PROBE_GAME.id)),
    );
    if (current === undefined) {
      await createProbe(tx, tournament, tipOff);
      await seedBlankRows(tx, tournament);
      return 'created';
    }
    await seedBlankRows(tx, tournament);
    if (current.homeScore !== null) return 'closed';
    const held = instantOf(current.tipOff, 'games', String(PROBE_GAME.id));
    if (held === tipOff) return 'kept';
    await tx
      .update(games)
      .set({ tipOff: new Date(tipOff), lockedSince: null, postponed: false })
      .where(eq(games.id, PROBE_GAME.id));
    await tx
      .update(matchPredictions)
      .set({ remindedAt: null })
      .where(eq(matchPredictions.gameId, PROBE_GAME.id));
    return 'moved';
  });
}
