import { deleteGame, findAdminGame, type AdminGame } from '@sportbet/db';
import {
  isSuperadmin,
  ruledRules,
  type GameId,
  type Instant,
  type PlayerId,
} from '@sportbet/domain';
import { vilniusStamp } from '../../../components/format/vilnius-time';
import { ADMIN_GAMES_PATH } from '../../../components/admin/admin-paths';
import { now } from '../../clock';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { pointsChanged } from '../../points-changed';
import { said, type AdminAnswer } from '../admin-answer';
import { workingTournament } from '../working-tournament';

/** R-26 amended: a game is deleted by a superadmin only (R-89). */
export const deleteGamePermission = isSuperadmin;

/**
 * The game as the admin's working tournament lists it (the pages and
 * writers all act on one tournament), or null when it is not there - no
 * such game, or another tournament's.
 */
export async function findListedGame(
  player: PlayerId,
  game: GameId,
): Promise<AdminGame | null> {
  const tournament = await workingTournament(player);
  if (tournament === null) return null;
  return findAdminGame(getDb(), tournament, game, {
    rules: ruledRules,
    now: now(),
  });
}

/** What the confirmation page says will happen: the game and its teams, Vilnius time (React escapes the names, which an import may have brought). */
export function deleteGameText(game: AdminGame): string {
  return `Ištrinti žaidimą #${String(game.id)}: ${game.homeName} - ${game.awayName}, ${vilniusStamp(game.tipOff)}`;
}

/** What the mail says will happen: the game's number only - no name that anyone but this app typed reaches an email's markup. */
export const deleteGameMailText = (game: GameId): string =>
  `Ištrinti žaidimą #${String(game)}`;

/** The confirmed delete: decided again under its own locks (deleteGame), whatever the page showed. */
export async function performDeleteGame(
  game: GameId,
  at: Instant,
): Promise<AdminAnswer> {
  const deleted = await deleteGame(getDb(), {
    game,
    rules: ruledRules,
    now: at,
  });
  if (!deleted.ok) return said(ADMIN_GAMES_PATH, deleted.refusal);
  pointsChanged();
  return said(ADMIN_GAMES_PATH, 'game-deleted', { number: game });
}
