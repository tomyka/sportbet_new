import {
  deleteRound,
  insertRound,
  updateRound,
  type BoardEffect,
} from '@sportbet/db';
import {
  idFromText,
  roundFormEntry,
  type Result,
  type RoundFormCheck,
} from '@sportbet/domain';
import { ADMIN_EVENTS_PATH } from '../../components/admin/admin-paths';
import { formText } from '../request/form-input';
import { expireBoard } from '../points-changed';
import type { AdminRequest } from './admin-action';
import { invalid, NOT_FOUND, said, type AdminAnswer } from './admin-answer';
import type { AdminMessage } from './admin-messages';
import {
  adminWrite,
  settle,
  withWorkingTournament,
  type AdminWriteContext,
} from './admin-write';

/** InsertEventRequest's and UpdateEventRequest's fields, by sportbet's names, as the round form posts them. */
export function readRoundForm(form: FormData): RoundFormCheck {
  return roundFormEntry({
    event: formText(form, 'event'),
    eventDay: formText(form, 'eventDay'),
    stage: formText(form, 'stage'),
    rate: formText(form, 'rate'),
    eventSurvival: formText(form, 'eventSurvival'),
    isKnockout: formText(form, 'isKnockout'),
  });
}

/**
 * EventController::insertEvent: into the tournament the admin works on
 * (none: sportbet's "Nepasirinktas turnyras. ..."), the form checked field
 * by field, then written by insertRound under the tournament's lock, which
 * decides R-110 and a duplicate number.
 */
export async function addRound({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  return withWorkingTournament(admin, ADMIN_EVENTS_PATH, async (tournament) => {
    const entry = readRoundForm(form);
    if (!entry.ok) return invalid(ADMIN_EVENTS_PATH, entry.errors);
    return writeRound(admin, 'round-added', async ({ db, now }) =>
      insertRound(db, { tournament, entry: entry.value, now }),
    );
  });
}

/** A round's writer behind the throttle: its refusal is the message of its own name, its success moves the board and says `done`. */
function writeRound<Written extends BoardEffect, Refusal extends AdminMessage>(
  admin: AdminRequest['admin'],
  done: AdminMessage,
  write: (context: AdminWriteContext) => Promise<Result<Written, Refusal>>,
): Promise<AdminAnswer> {
  return adminWrite(admin, ADMIN_EVENTS_PATH, async (context) =>
    settle(await write(context), ADMIN_EVENTS_PATH, (written) => {
      expireBoard(written);
      return said(ADMIN_EVENTS_PATH, done);
    }),
  );
}

/**
 * EventController::updateEvent: `eventID` read by idFromText (a round no
 * row has is a 404 or `unknown-round`); with `delete` posted the round is
 * deleted (deleteRound, which keeps a round with games), else the form is
 * checked and the round changed (updateRound, recalculating when its
 * number, stage, rate or a flag moved a point).
 */
export async function saveRound({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const round = idFromText(formText(form, 'eventID'));
  if (!round.ok) return NOT_FOUND;
  return withWorkingTournament(admin, ADMIN_EVENTS_PATH, async (tournament) => {
    const write = { tournament, round: round.value };
    if (formText(form, 'delete') !== '') {
      return writeRound(admin, 'round-deleted', ({ db, now }) =>
        deleteRound(db, { ...write, now }),
      );
    }
    const entry = readRoundForm(form);
    if (!entry.ok) return invalid(ADMIN_EVENTS_PATH, entry.errors);
    return writeRound(admin, 'round-updated', ({ db, now }) =>
      updateRound(db, { ...write, now, entry: entry.value }),
    );
  });
}
