import {
  findAdminMessage,
  insertMessage,
  loadAdminMessages,
  updateMessage,
} from '@sportbet/db';
import {
  isSuperadmin,
  messageFormEntry,
  messageIdEntry,
  type MessageFormCheck,
  type Tournament,
} from '@sportbet/domain';
import { ADMIN_MESSAGES_PATH } from '../../components/admin/admin-paths';
import { now } from '../clock';
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
import { requestConfirmation } from './confirm/request';
import { throttledWrite } from './throttled-write';
import { workingTournament } from './working-tournament';

/** The message form's fields, by sportbet's names, trimmed as Laravel does; the league must be one of the tournament's (R-95). */
async function readMessageForm(
  form: FormData,
  tournament: Tournament,
): Promise<MessageFormCheck> {
  const { leagues } = await loadAdminMessages(getDb(), tournament.id);
  return messageFormEntry(
    {
      message: formText(form, 'message'),
      leagueID: formText(form, 'leagueID'),
      active: formText(form, 'active'),
    },
    leagues.map((league) => league.id),
  );
}

/**
 * MessageController::insertMessage (R-95, R-116), for a results manager or a
 * superadmin: the form checked field by field against the working
 * tournament's leagues (the 422 summary), then written by insertMessage under
 * the league row's lock, which reads the actor's role again.
 */
export async function addMessage({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_MESSAGES_PATH, 'no-tournament');
  const entry = await readMessageForm(form, tournament);
  if (!entry.ok) return invalid(ADMIN_MESSAGES_PATH, entry.errors);
  const db = getDb();
  const at = now();
  return throttledWrite(
    db,
    { player: admin.player, now: at, to: ADMIN_MESSAGES_PATH },
    async () => {
      const inserted = await insertMessage(db, {
        actor: admin.player,
        tournament: tournament.id,
        entry: entry.value,
        now: at,
      });
      if (inserted.ok) return said(ADMIN_MESSAGES_PATH, 'message-added');
      return inserted.refusal === 'actor-not-allowed'
        ? HOME
        : invalid(ADMIN_MESSAGES_PATH, [
            { field: 'leagueID', problem: 'league-not-allowed' },
          ]);
    },
  );
}

/** What the post does to the message: its `update` or `delete` button, neither being "Nėra ką išsaugoti". */
const buttonOf = (form: FormData): 'update' | 'delete' | null => {
  if (form.has('update')) return 'update';
  return form.has('delete') ? 'delete' : null;
};

/**
 * MessageController::updateMessage's `delete` (R-116, R-26 amended): a
 * superadmin only (a results manager's post is refused, home), the message
 * must be one the working tournament lists or a detached one (404). Then the
 * emailed code is asked for; nothing is deleted here.
 */
async function askToDeleteMessage(
  { admin }: AdminRequest,
  message: number,
): Promise<AdminAnswer> {
  if (!isSuperadmin(admin.role)) return HOME;
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_MESSAGES_PATH, 'no-tournament');
  const listed = await findAdminMessage(getDb(), tournament.id, message);
  if (listed === null) return NOT_FOUND;
  return requestConfirmation({
    admin,
    action: { kind: 'delete-league-message', message },
    back: ADMIN_MESSAGES_PATH,
  });
}

/** MessageController::updateMessage's `update`: the form checked, then written by updateMessage under its locks. */
async function updateListedMessage(
  { admin, form }: AdminRequest,
  message: number,
): Promise<AdminAnswer> {
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_MESSAGES_PATH, 'no-tournament');
  const entry = await readMessageForm(form, tournament);
  if (!entry.ok) return invalid(ADMIN_MESSAGES_PATH, entry.errors);
  const db = getDb();
  const at = now();
  return throttledWrite(
    db,
    { player: admin.player, now: at, to: ADMIN_MESSAGES_PATH },
    async () => {
      const updated = await updateMessage(db, {
        actor: admin.player,
        tournament: tournament.id,
        message,
        entry: entry.value,
        now: at,
      });
      if (updated.ok) {
        return said(ADMIN_MESSAGES_PATH, 'message-updated', {
          number: message,
        });
      }
      switch (updated.refusal) {
        case 'actor-not-allowed':
          return HOME;
        case 'no-such-message':
          return NOT_FOUND;
        case 'league-not-allowed':
          return invalid(ADMIN_MESSAGES_PATH, [
            { field: 'leagueID', problem: 'league-not-allowed' },
          ]);
      }
    },
  );
}

/**
 * MessageController::updateMessage (sportbet's POST `/admin/messages`):
 * `messageID` checked first, so its refusal stands alone, then the button
 * posted - `update` or `delete` (the delete asks for the emailed code), and
 * neither is "Nėra ką išsaugoti: formoje nenurodytas veiksmas.".
 */
export async function saveMessage(input: AdminRequest): Promise<AdminAnswer> {
  const id = messageIdEntry(formText(input.form, 'messageID'));
  if (!id.ok) {
    return invalid(ADMIN_MESSAGES_PATH, [
      { field: 'messageID', problem: id.refusal },
    ]);
  }
  switch (buttonOf(input.form)) {
    case 'update':
      return updateListedMessage(input, id.value);
    case 'delete':
      return askToDeleteMessage(input, id.value);
    case null:
      return said(ADMIN_MESSAGES_PATH, 'nothing-to-save');
  }
}
