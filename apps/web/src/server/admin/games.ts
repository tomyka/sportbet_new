import { insertGame, updateGame } from '@sportbet/db';
import {
  gameFormEntry,
  gameIdFromText,
  type GameFormCheck,
} from '@sportbet/domain';
import { ADMIN_GAMES_PATH } from '../../components/admin/admin-paths';
import { now } from '../clock';
// Not '../db': lint reads that as packages/db (eslint.config.mjs).
import { getDb } from '../../server/db';
import { formText } from '../request/form-input';
import { pointsChanged } from '../points-changed';
import type { AdminRequest } from './admin-action';
import { invalid, NOT_FOUND, said, type AdminAnswer } from './admin-answer';
import { findListedGame } from './confirm/delete-game';
import { requestConfirmation } from './confirm/request';
import { throttledWrite } from './throttled-write';
import { workingTournament } from './working-tournament';

/** insertGame's and updateGame's fields, by sportbet's names: the time is the form's `YYYY-MM-DDTHH:mm`, Vilnius time (R-91). */
export function readGameForm(form: FormData): GameFormCheck {
  return gameFormEntry({
    gameDateTime: formText(form, 'gameDateTime'),
    homeTeamID: formText(form, 'homeTeamID'),
    awayTeamID: formText(form, 'awayTeamID'),
    eventID: formText(form, 'eventID'),
  });
}

/**
 * GameController::insertGame, into the tournament the admin works on: the
 * form checked field by field (a clock-change hour refused, R-91), then
 * written by insertGame under the tournament's lock, which decides R-110,
 * the tournament of the round and teams (issue 272) and a pair the round
 * already has, and seeds every player's blank row.
 */
export async function addGame({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const tournament = await workingTournament(admin.player);
  if (tournament === null) return said(ADMIN_GAMES_PATH, 'no-tournament');
  const entry = readGameForm(form);
  if (!entry.ok) return invalid(ADMIN_GAMES_PATH, entry.errors);
  const at = now();
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: at, to: ADMIN_GAMES_PATH },
    async () => {
      const inserted = await insertGame(db, {
        tournament,
        entry: entry.value,
        now: at,
      });
      if (!inserted.ok) return said(ADMIN_GAMES_PATH, inserted.refusal);
      pointsChanged();
      return said(ADMIN_GAMES_PATH, 'game-added', {
        number: inserted.value.game,
      });
    },
  );
}

/**
 * GameController::updateGame: `gameID` read by gameIdFromText (unreadable
 * or no such game is a 404), the form checked, then written by updateGame
 * under the tournament's lock and the game row's, which decides R-90 and
 * R-13 and recalculates a scored game.
 */
export async function changeGame({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const game = gameIdFromText(formText(form, 'gameID'));
  if (!game.ok) return NOT_FOUND;
  const entry = readGameForm(form);
  if (!entry.ok) return invalid(ADMIN_GAMES_PATH, entry.errors);
  const at = now();
  const db = getDb();
  return throttledWrite(
    db,
    { player: admin.player, now: at, to: ADMIN_GAMES_PATH },
    async () => {
      const updated = await updateGame(db, {
        game: game.value,
        entry: entry.value,
        now: at,
      });
      if (!updated.ok) {
        return updated.refusal === 'no-game'
          ? NOT_FOUND
          : said(ADMIN_GAMES_PATH, updated.refusal);
      }
      pointsChanged();
      return said(ADMIN_GAMES_PATH, 'game-updated', { number: game.value });
    },
  );
}

/**
 * GameController::deleteGame's first step (R-89, R-26 amended): the game
 * must be the working tournament's, and the domain must allow the delete
 * now - a refused delete sends no mail. Then the emailed code is asked for;
 * nothing is deleted until it comes back (server/admin/confirm/check.ts).
 */
export async function askToDeleteGame({
  admin,
  form,
}: AdminRequest): Promise<AdminAnswer> {
  const game = gameIdFromText(formText(form, 'gameID'));
  if (!game.ok) return NOT_FOUND;
  const listed = await findListedGame(admin.player, game.value);
  if (listed === null) return NOT_FOUND;
  if (listed.deletion !== null) return said(ADMIN_GAMES_PATH, listed.deletion);
  return requestConfirmation({
    admin,
    action: { kind: 'delete-game', game: game.value },
    back: ADMIN_GAMES_PATH,
  });
}
