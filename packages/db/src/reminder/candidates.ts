import {
  REMINDER_HORIZON_HOURS,
  secondsAfter,
  type Instant,
  type ReminderCandidate,
} from '@sportbet/domain';
import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { playerSettings } from '../account/schema';
import type { Executor } from '../client';
import { playerOf } from '../edge';
import { matchPredictions } from '../prediction/schema';
import { gameColumns, storedGamesOf } from '../season/repository';
import { games, rounds } from '../season/schema';

const playerRows = z.array(z.object({ player: z.int() }));

const HOUR_SECONDS = 3_600;

/**
 * The games each opted-in player has not answered and has not been
 * reminded of (SendPredictionReminders::unremindedGamesByPlayer), every
 * tournament's, earliest first: a row is unanswered when home or away is
 * empty (a half-typed one counts), and the game kicks off within 48 hours.
 * SQL narrows by the clock and the missing result; the loaded `Game` has
 * the last word on whether it is open at `now` (the rule a save uses), so
 * a postponed or locked game is never reminded. Does not read
 * `tournament_players`: an inactive player is still reminded (R-7).
 */
export async function loadReminderCandidates(
  db: Executor,
  input: { readonly now: Instant },
): Promise<readonly ReminderCandidate[]> {
  const { now } = input;
  const horizon = secondsAfter(now, REMINDER_HORIZON_HOURS * HOUR_SECONDS);
  const rows = await db
    .select({ ...gameColumns, player: matchPredictions.playerId })
    .from(matchPredictions)
    .innerJoin(games, eq(games.id, matchPredictions.gameId))
    .innerJoin(rounds, eq(rounds.id, games.roundId))
    .innerJoin(
      playerSettings,
      eq(playerSettings.playerId, matchPredictions.playerId),
    )
    .where(
      and(
        eq(playerSettings.receiveReminders, true),
        isNull(matchPredictions.remindedAt),
        or(isNull(matchPredictions.home), isNull(matchPredictions.away)),
        isNull(games.homeScore),
        gt(games.tipOff, new Date(now)),
        lt(games.tipOff, new Date(horizon)),
      ),
    )
    .orderBy(asc(games.tipOff), asc(games.id), asc(matchPredictions.playerId));
  const loaded = storedGamesOf(rows);
  const owners = playerRows.parse(rows);
  return loaded.flatMap((game, index) => {
    const owner = owners[index];
    if (owner === undefined || !game.isOpenAt(now)) return [];
    return [
      { player: playerOf(owner.player), game: game.id, tipOff: game.tipOff },
    ];
  });
}
