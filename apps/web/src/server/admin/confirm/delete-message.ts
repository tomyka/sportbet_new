import { deleteMessage, findAdminMessage } from '@sportbet/db';
import { isSuperadmin, type PlayerId } from '@sportbet/domain';
import { ADMIN_MESSAGES_PATH } from '../../../components/admin/admin-paths';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { HOME, said, type AdminAnswer } from '../admin-answer';
import { workingTournament } from '../working-tournament';
import type { Performer } from './performer';

/** R-26 amended, R-116: a message is deleted by a superadmin only, by emailed code. */
export const deleteMessagePermission = isSuperadmin;

/**
 * What the confirmation page says will happen, or null when the message is
 * not there for the working tournament (another tournament's league's is
 * none, R-95). Only its number: a message's text is an admin's to write and
 * is not echoed.
 */
export async function deleteMessageText(
  player: PlayerId,
  message: number,
): Promise<string | null> {
  const tournament = await workingTournament(player);
  if (tournament === null) return null;
  const listed = await findAdminMessage(getDb(), tournament.id, message);
  return listed === null ? null : `Ištrinti žinutę #${String(message)}`;
}

/** The confirmed delete: decided again under its own locks (deleteMessage). */
export async function performDeleteMessage(
  message: number,
  { admin, tournament }: Performer,
): Promise<AdminAnswer> {
  if (tournament === null) return said(ADMIN_MESSAGES_PATH, 'no-tournament');
  const deleted = await deleteMessage(getDb(), {
    actor: admin,
    tournament: tournament.id,
    message,
  });
  if (deleted.ok) {
    return said(ADMIN_MESSAGES_PATH, 'message-deleted', { number: message });
  }
  return deleted.refusal === 'actor-not-allowed'
    ? HOME
    : said(ADMIN_MESSAGES_PATH, 'message-gone');
}
