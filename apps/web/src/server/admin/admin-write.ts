import type { Db } from '@sportbet/db';
import {
  adminWriteLimits,
  type Instant,
  type PlayerId,
  type Result,
  type Tournament,
} from '@sportbet/domain';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { throttle } from '../sign-in/throttle';
import { said, throttledTo, type AdminAnswer } from './admin-answer';
import type { AdminMessage } from './admin-messages';
import { workingTournament } from './working-tournament';

/** Who an admin write is for: the account whose throttle it counts against. */
interface Writer {
  readonly player: PlayerId;
}

/** What an admin write is given: the database and the moment, read once for the throttle and the writer alike. */
export interface AdminWriteContext {
  readonly db: Db;
  readonly now: Instant;
}

/**
 * An admin write behind the throttle: 60 accepted writes a minute per
 * account (adminWriteLimits), past which nothing is written and the page
 * `to` says for how long. Asked only once the form is checked, so a
 * refused form costs nothing. The write is handed the database and the
 * moment it was throttled at.
 */
export async function adminWrite(
  admin: Writer,
  to: string,
  write: (context: AdminWriteContext) => Promise<AdminAnswer>,
): Promise<AdminAnswer> {
  const context = { db: getDb(), now: now() };
  const verdict = await throttle(
    context.db,
    adminWriteLimits(admin.player),
    context.now,
  );
  return verdict.allowed ? write(context) : throttledTo(to, verdict.minutes);
}

/**
 * Runs `then` with the tournament the admin works on, or answers sportbet's
 * "Nepasirinktas turnyras. ..." on `to` when there is none (R-110, R-22 and
 * R-67 are the writer's, under the lock).
 */
export async function withWorkingTournament(
  admin: Writer,
  to: string,
  then: (tournament: Tournament) => Promise<AdminAnswer>,
): Promise<AdminAnswer> {
  const tournament = await workingTournament(admin.player);
  return tournament === null ? said(to, 'no-tournament') : then(tournament);
}

/** A writer's outcome as the answer: a refusal is the message of its own name on `to`, a success is `done`'s. */
export function settle<Value, Refusal extends AdminMessage>(
  outcome: Result<Value, Refusal>,
  to: string,
  done: (value: Value) => AdminAnswer,
): AdminAnswer {
  return outcome.ok ? done(outcome.value) : said(to, outcome.refusal);
}
