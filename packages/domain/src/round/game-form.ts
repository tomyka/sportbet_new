import { idFromText, teamIdFromText, type TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { vilniusTipOff } from '../shared/vilnius-time';

/** A posted field of the game form, by sportbet's name. */
export type GameField =
  'gameDateTime' | 'homeTeamID' | 'awayTeamID' | 'eventID';

/** Why a field was refused. */
export type GameFieldProblem =
  'required' | 'not-an-id' | 'bad-time' | 'nonexistent-time' | 'ambiguous-time';

export interface GameFieldError {
  readonly field: GameField;
  readonly problem: GameFieldProblem;
}

export type GameFormFields = Readonly<Record<GameField, string>>;

/**
 * What the admin entered for a game. `roundId` is the round's database id,
 * as posted (sportbet's `eventID`): the tournament's rounds map it to the
 * round's number (GameScope).
 */
export interface GameFormEntry {
  readonly tipOff: Instant;
  readonly home: TeamId;
  readonly away: TeamId;
  readonly roundId: number;
}

export type GameFormCheck =
  | { readonly ok: true; readonly value: GameFormEntry }
  | { readonly ok: false; readonly errors: readonly GameFieldError[] };

type Read<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly error: GameFieldError };

function refused(field: GameField, problem: GameFieldProblem): Read<never> {
  return { ok: false, error: { field, problem } };
}

/** `required|integer` on an id, read only by idFromText. */
function idRead(field: GameField, text: string): Read<number> {
  if (text === '') return refused(field, 'required');
  const id = idFromText(text);
  return id.ok ? { ok: true, value: id.value } : refused(field, 'not-an-id');
}

function teamRead(field: GameField, text: string): Read<TeamId> {
  if (text === '') return refused(field, 'required');
  const id = teamIdFromText(text);
  return id.ok ? { ok: true, value: id.value } : refused(field, 'not-an-id');
}

/** R-91: the typed time as Vilnius time; blank is required (sportbet read it as now). */
function timeRead(text: string): Read<Instant> {
  if (text === '') return refused('gameDateTime', 'required');
  const tipOff = vilniusTipOff(text);
  return tipOff.ok
    ? { ok: true, value: tipOff.value }
    : refused('gameDateTime', tipOff.refusal);
}

/**
 * GameController's insertGame and updateGame on the trimmed fields, every
 * failing field listed (Laravel reports each): `homeTeamID`, `awayTeamID`
 * and `eventID` each `required|integer` (read by idFromText), in that
 * order, then the time (R-91: Vilnius time, a clock-change hour refused).
 */
export function gameFormEntry(fields: GameFormFields): GameFormCheck {
  const home = teamRead('homeTeamID', fields.homeTeamID);
  const away = teamRead('awayTeamID', fields.awayTeamID);
  const roundId = idRead('eventID', fields.eventID);
  const tipOff = timeRead(fields.gameDateTime);
  if (!home.ok || !away.ok || !roundId.ok || !tipOff.ok) {
    return {
      ok: false,
      errors: [home, away, roundId, tipOff].flatMap((read) =>
        read.ok ? [] : [read.error],
      ),
    };
  }
  return {
    ok: true,
    value: {
      tipOff: tipOff.value,
      home: home.value,
      away: away.value,
      roundId: roundId.value,
    },
  };
}
