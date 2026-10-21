import {
  findAdminLeague,
  setLeagueGuest,
  updateLeagueAsSuperadmin,
} from '@sportbet/db/league';
import {
  leagueFormEntry,
  superadminDeleteLeague,
  type LeagueFormCheck,
} from '@sportbet/domain';
import {
  ADMIN_LEAGUES_PATH,
  adminLeagueMembersPath,
} from '../../components/admin/admin-paths';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import type { AdminRequest } from './admin-action';
import {
  HOME,
  invalid,
  NOT_FOUND,
  said,
  type AdminAnswer,
} from './admin-answer';
import { asLeague, asPlayer } from '../leagues/id-field';
import { requestConfirmation } from './confirm/request';
import { readPostedId } from './posted-id';
import { adminWrite, withWorkingTournament } from './admin-write';
import { workingTournament } from './working-tournament';

/** The edit dialog's fields, by sportbet's names (`LeagueController::adminUpdate` validates the owner's form, no reward). */
export function readAdminLeagueForm(form: FormData): LeagueFormCheck {
  return leagueFormEntry(
    {
      name: formText(form, 'name'),
      description: formText(form, 'description'),
      base_fee: formText(form, 'base_fee'),
      penalty_step: formText(form, 'penalty_step'),
    },
    'update',
  );
}

/**
 * LeagueController::adminUpdate (sportbet issue 128, R-105): a superadmin edits a
 * league of the tournament they work on with the owner's own form, the
 * public league included. `leagueID` by idFromText, the form checked field
 * by field (the 422 summary), then written by updateLeagueAsSuperadmin under
 * the league row's lock, which reads the actor's role again.
 */
export async function editLeague({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const posted = readPostedId(form, 'leagueID', ADMIN_LEAGUES_PATH);
  if (!posted.ok) return posted.answer;
  const entry = readAdminLeagueForm(form);
  if (!entry.ok) return invalid(ADMIN_LEAGUES_PATH, entry.errors);
  return withWorkingTournament(admin, ADMIN_LEAGUES_PATH, (tournament) =>
    adminWrite(admin, ADMIN_LEAGUES_PATH, async ({ db }) => {
      const edited = await updateLeagueAsSuperadmin(db, {
        actor: admin.player,
        tournament: tournament.id,
        league: asLeague(posted.id),
        entry: entry.value,
      });
      if (edited.ok) return said(ADMIN_LEAGUES_PATH, 'admin-league-updated');
      return edited.refusal === 'actor-not-superadmin' ? HOME : NOT_FOUND;
    }),
  );
}

/**
 * LeagueController::adminDelete's first step (R-118): the league must be one
 * the working tournament lists (404), and the domain must allow the delete
 * now - the public league is refused - so a refused delete sends no mail.
 * Then the emailed code is asked for; nothing is deleted here.
 */
export async function askToDeleteLeague({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const posted = readPostedId(form, 'leagueID', ADMIN_LEAGUES_PATH);
  if (!posted.ok) return posted.answer;
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_LEAGUES_PATH, 'no-tournament');
  const league = asLeague(posted.id);
  const listed = await findAdminLeague(getDb(), {
    tournament: tournament.id,
    league,
  });
  if (listed === null) return NOT_FOUND;
  const decided = superadminDeleteLeague({
    league: listed.league,
    selectingPlayers: [],
  });
  if (!decided.ok) return said(ADMIN_LEAGUES_PATH, 'league-public');
  return requestConfirmation({
    admin,
    action: { kind: 'delete-league', league },
    back: ADMIN_LEAGUES_PATH,
  });
}

/** The posted `guest`: `1` marks a guest, `0` a full member; anything else is refused. */
function readGuest(
  form: FormData,
): { readonly ok: true; readonly guest: boolean } | { readonly ok: false } {
  const posted = formText(form, 'guest');
  if (posted === '1') return { ok: true, guest: true };
  return posted === '0' ? { ok: true, guest: false } : { ok: false };
}

/**
 * R-87: a superadmin marks a member of a league of the tournament they work
 * on a guest, or a full member again, on the league's members list.
 * `leagueID` and `userID` by idFromText, `guest` `1` or `0`; written by
 * setLeagueGuest under the league and member locks. No points change, so
 * nothing recalculates.
 */
export async function markMemberGuest({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const league = readPostedId(form, 'leagueID', ADMIN_LEAGUES_PATH);
  if (!league.ok) return league.answer;
  const to = adminLeagueMembersPath(league.id);
  const member = readPostedId(form, 'userID', to);
  if (!member.ok) return member.answer;
  const guest = readGuest(form);
  if (!guest.ok)
    return invalid(to, [{ field: 'guest', problem: 'not-a-boolean' }]);
  return withWorkingTournament(admin, ADMIN_LEAGUES_PATH, (tournament) =>
    adminWrite(admin, to, async ({ db }) => {
      const marked = await setLeagueGuest(db, {
        actor: admin.player,
        tournament: tournament.id,
        league: asLeague(league.id),
        player: asPlayer(member.id),
        guest: guest.guest,
      });
      if (marked.ok) {
        return said(to, guest.guest ? 'member-guest' : 'member-full');
      }
      switch (marked.refusal) {
        case 'actor-not-superadmin':
          return HOME;
        case 'no-such-league':
          return NOT_FOUND;
        case 'not-member':
          return said(to, 'not-a-member');
        case 'unchanged':
          return said(to, 'guest-unchanged');
      }
    }),
  );
}
