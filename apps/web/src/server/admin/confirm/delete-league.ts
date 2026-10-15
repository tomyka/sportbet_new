import { deleteLeagueAsSuperadmin, findAdminLeague } from '@sportbet/db';
import { isSuperadmin, type LeagueId, type PlayerId } from '@sportbet/domain';
import { ADMIN_LEAGUES_PATH } from '../../../components/admin/admin-paths';
// Not '../../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../../server/db';
import { HOME, said, type AdminAnswer } from '../admin-answer';
import { workingTournament } from '../working-tournament';
import type { Performer } from './performer';

/** R-26 amended, R-118: a league is deleted by a superadmin only, by emailed code. */
export const deleteLeaguePermission = isSuperadmin;

/**
 * What the confirmation page says will happen, from the database: the league
 * as the working tournament lists it, or null when it is not there (another
 * tournament's is none, R-95).
 */
export async function deleteLeagueText(
  player: PlayerId,
  league: LeagueId,
): Promise<string | null> {
  const tournament = await workingTournament(player);
  if (tournament === null) return null;
  const listed = await findAdminLeague(getDb(), {
    tournament: tournament.id,
    league,
  });
  return listed === null ? null : `Ištrinti lygą ${listed.league.name}`;
}

/** What the mail says: the league's number only - a league's name is a player's text. */
export const deleteLeagueMailText = (league: LeagueId): string =>
  `Ištrinti lygą #${String(league)}`;

/**
 * The confirmed delete (R-118): decided again under its own locks
 * (deleteLeagueAsSuperadmin), whatever the page showed - the actor's role
 * read again, the public league refused, another tournament's league not
 * there.
 */
export async function performDeleteLeague(
  league: LeagueId,
  { admin, tournament }: Performer,
): Promise<AdminAnswer> {
  if (tournament === null) return said(ADMIN_LEAGUES_PATH, 'no-tournament');
  const deleted = await deleteLeagueAsSuperadmin(getDb(), {
    actor: admin,
    tournament: tournament.id,
    league,
  });
  if (deleted.ok) return said(ADMIN_LEAGUES_PATH, 'admin-league-deleted');
  switch (deleted.refusal) {
    case 'actor-not-superadmin':
      return HOME;
    case 'no-such-league':
      return said(ADMIN_LEAGUES_PATH, 'league-gone');
    case 'public':
      return said(ADMIN_LEAGUES_PATH, 'league-public');
  }
}
