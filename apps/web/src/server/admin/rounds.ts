import { deleteRound, insertRound, updateRound } from '@sportbet/db';
import {
  idFromText,
  roundFormEntry,
  type Instant,
  type RoundEntry,
  type RoundFormCheck,
  type Tournament,
} from '@sportbet/domain';
import { ADMIN_EVENTS_PATH } from '../../components/admin/admin-paths';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { pointsChanged } from '../points-changed';
import type { AdminRequest } from './admin-action';
import { invalid, NOT_FOUND, said, type AdminAnswer } from './admin-answer';
import { throttledWrite } from './throttled-write';
import { workingTournament } from './working-tournament';

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
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_EVENTS_PATH, 'no-tournament');
  const entry = readRoundForm(form);
  if (!entry.ok) return invalid(ADMIN_EVENTS_PATH, entry.errors);
  const at = now();
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: at, to: ADMIN_EVENTS_PATH },
    async () => {
      const inserted = await insertRound(db, {
        tournament,
        entry: entry.value,
        now: at,
      });
      if (!inserted.ok) return said(ADMIN_EVENTS_PATH, inserted.refusal);
      pointsChanged();
      return said(ADMIN_EVENTS_PATH, 'round-added');
    },
  );
}

/** What a round's row is written under: the working tournament and the moment. */
interface RoundWrite {
  readonly tournament: Tournament;
  readonly round: number;
  readonly now: Instant;
}

async function removeRound(
  admin: AdminRequest['admin'],
  write: RoundWrite,
): Promise<AdminAnswer> {
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: write.now, to: ADMIN_EVENTS_PATH },
    async () => {
      const deleted = await deleteRound(db, write);
      if (!deleted.ok) return said(ADMIN_EVENTS_PATH, deleted.refusal);
      pointsChanged();
      return said(ADMIN_EVENTS_PATH, 'round-deleted');
    },
  );
}

async function changeRound(
  admin: AdminRequest['admin'],
  write: RoundWrite,
  entry: RoundEntry,
): Promise<AdminAnswer> {
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: write.now, to: ADMIN_EVENTS_PATH },
    async () => {
      const updated = await updateRound(db, { ...write, entry });
      if (!updated.ok) return said(ADMIN_EVENTS_PATH, updated.refusal);
      pointsChanged();
      return said(ADMIN_EVENTS_PATH, 'round-updated');
    },
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
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_EVENTS_PATH, 'no-tournament');
  const write = {
    tournament,
    round: round.value,
    now: now(),
  };
  if (formText(form, 'delete') !== '') return removeRound(admin, write);
  const entry = readRoundForm(form);
  return entry.ok
    ? changeRound(admin, write, entry.value)
    : invalid(ADMIN_EVENTS_PATH, entry.errors);
}
