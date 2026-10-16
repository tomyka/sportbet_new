import type { DueReminder, GameId, Instant, PlayerId } from '@sportbet/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Executor } from '../client';
import { gameOf, instantOf, keyOf, playerOf } from '../edge';
import { players } from '../player/schema';
import { games } from '../season/schema';
import { teams } from '../team/schema';

/** One game of a reminder mail: its teams' names and its tip-off. */
export interface ReminderGame {
  readonly game: GameId;
  readonly home: string;
  readonly away: string;
  readonly tipOff: Instant;
}

/** Who a due reminder is mailed to, and the games it lists. */
export interface ReminderRecipient {
  readonly player: PlayerId;
  readonly email: string;
  /** By tip-off then game id, as read now. */
  readonly games: readonly ReminderGame[];
}

const playerRows = z.array(z.object({ id: z.int(), email: z.string() }));
const gameRows = z.array(
  z.object({
    id: z.int(),
    tipOff: z.date(),
    home: z.string(),
    away: z.string(),
  }),
);

async function loadEmails(
  db: Executor,
  due: readonly DueReminder[],
): Promise<Map<PlayerId, string>> {
  const rows = playerRows.parse(
    await db
      .select({ id: players.id, email: players.email })
      .from(players)
      .where(
        inArray(
          players.id,
          due.map(({ player }) => keyOf(player, 'player')),
        ),
      ),
  );
  return new Map(rows.map(({ id, email }) => [playerOf(id), email]));
}

async function loadGames(
  db: Executor,
  due: readonly DueReminder[],
): Promise<Map<GameId, ReminderGame>> {
  const home = alias(teams, 'home_team');
  const away = alias(teams, 'away_team');
  const ids = due.flatMap((reminder) => reminder.games.map(({ game }) => game));
  const rows = gameRows.parse(
    await db
      .select({
        id: games.id,
        tipOff: games.tipOff,
        home: home.name,
        away: away.name,
      })
      .from(games)
      .innerJoin(home, eq(home.id, games.homeTeamId))
      .innerJoin(away, eq(away.id, games.awayTeamId))
      .where(inArray(games.id, ids))
      .orderBy(asc(games.tipOff), asc(games.id)),
  );
  return new Map(
    rows.map((row) => [
      gameOf(row.id),
      {
        game: gameOf(row.id),
        home: row.home,
        away: row.away,
        tipOff: instantOf(row.tipOff, 'games', String(row.id)),
      },
    ]),
  );
}

/**
 * The address and the games' team names and tip-offs of each due reminder,
 * read now (sportbet re-reads both before it mails). A player gone since
 * the candidates were read is absent (sportbet issue 283), and so is one
 * none of whose games exists any more; a game gone is left out of its
 * list. The recipients keep the order of `due`.
 */
export async function loadReminderRecipients(
  db: Executor,
  due: readonly DueReminder[],
): Promise<readonly ReminderRecipient[]> {
  if (due.length === 0) return [];
  const emails = await loadEmails(db, due);
  const known = await loadGames(db, due);
  return due.flatMap((reminder) => {
    const email = emails.get(reminder.player);
    const listed = reminder.games
      .map(({ game }) => known.get(game))
      .filter((game) => game !== undefined)
      .sort((a, b) => a.tipOff - b.tipOff || a.game - b.game);
    return email === undefined || listed.length === 0
      ? []
      : [{ player: reminder.player, email, games: listed }];
  });
}
