import {
  chooseAdminTournament,
  createTournament,
  updateTournament,
} from '@sportbet/db/tournament';
import { findAdminTournament, type AdminTournament } from '@sportbet/db/admin';
import {
  idFromText,
  tournamentFormEntry,
  type TournamentFormCheck,
} from '@sportbet/domain';
import {
  ADMIN_TOURNAMENT_CREATE_PATH,
  ADMIN_TOURNAMENTS_PATH,
  tournamentEditPath,
} from '../../components/admin/admin-paths';
import { ADMIN_PATH } from '../../components/shell/shell-paths';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { expireBoard } from '../points-changed';
import type { AdminRequest } from './admin-action';
import { invalid, NOT_FOUND, said, type AdminAnswer } from './admin-answer';
import { adminWrite, settle } from './admin-write';

/**
 * adminStore's and adminUpdate's fields, by sportbet's names, against the
 * one format this app has (decision 11) and what is stored (null for a new
 * tournament: R-55 offers `upcoming` and `active`, and a stored `finished`
 * stays while it is unchanged).
 */
export function readTournamentForm(
  form: FormData,
  stored: AdminTournament | null,
): TournamentFormCheck {
  return tournamentFormEntry(
    {
      name: formText(form, 'name'),
      slug: formText(form, 'slug'),
      standings_deadline_round: formText(form, 'standings_deadline_round'),
      status: formText(form, 'status'),
      start_date: formText(form, 'start_date'),
      end_date: formText(form, 'end_date'),
      description: formText(form, 'description'),
      is_public: formText(form, 'is_public'),
      survival_game: formText(form, 'survival_game'),
    },
    {
      format: 'euroleague',
      stored:
        stored === null
          ? null
          : {
              status: stored.profile.status,
              survival: stored.tournament.survival,
            },
    },
  );
}

/**
 * TournamentController::adminStore: the form checked field by field, then
 * the tournament, its profile and its public league made in one
 * transaction (createTournament); a slug another tournament holds is
 * refused with nothing written.
 */
export async function storeTournament({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const entry = readTournamentForm(form, null);
  if (!entry.ok) return invalid(ADMIN_TOURNAMENT_CREATE_PATH, entry.errors);
  return adminWrite(admin, ADMIN_TOURNAMENT_CREATE_PATH, async ({ db }) =>
    settle(
      await createTournament(db, entry.value),
      ADMIN_TOURNAMENT_CREATE_PATH,
      () => said(ADMIN_TOURNAMENTS_PATH, 'tournament-created'),
    ),
  );
}

/**
 * TournamentController::adminUpdate: the tournament read by idFromText
 * (a tournament no row has is a 404), the form checked against what is
 * stored, then written by updateTournament under the tournament's lock,
 * which refuses a changed end date, survival or deadline round once it is
 * finished (R-110) and a slug another tournament holds.
 */
export async function changeTournament(
  { admin, form }: AdminRequest,
  idText: string,
): Promise<AdminAnswer> {
  const id = idFromText(idText);
  if (!id.ok) return NOT_FOUND;
  const stored = await findAdminTournament(getDb(), id.value);
  if (stored === undefined) return NOT_FOUND;
  const back = tournamentEditPath(id.value);
  const entry = readTournamentForm(form, stored);
  if (!entry.ok) return invalid(back, entry.errors);
  return adminWrite(admin, back, async ({ db, now }) =>
    settle(
      await updateTournament(db, {
        tournament: stored.tournament,
        entry: entry.value,
        now,
      }),
      back,
      (written) => {
        expireBoard(written);
        return said(ADMIN_TOURNAMENTS_PATH, 'tournament-updated');
      },
    ),
  );
}

/**
 * TournamentController::adminEnterContext: "Dirbti šiame turnyre" stores
 * the tournament the admin works on with the account (a 404 for one that
 * does not exist), and goes to the dashboard naming it.
 */
export async function enterContext(
  { admin }: AdminRequest,
  idText: string,
): Promise<AdminAnswer> {
  const id = idFromText(idText);
  if (!id.ok) return NOT_FOUND;
  const db = getDb();
  const chosen = await findAdminTournament(db, id.value);
  if (chosen === undefined) return NOT_FOUND;
  const saved = await chooseAdminTournament(db, admin.player, id.value);
  if (!saved.ok) return NOT_FOUND;
  return said(ADMIN_PATH, 'context-chosen', { name: chosen.tournament.name });
}
