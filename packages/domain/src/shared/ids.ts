import { z } from 'zod';
import { defineRangeInvariant } from '../invariant/range-invariant';
import { LAST_REGULAR_SEASON_ROUND } from '../round/stage';
import { ok, refuse, type Result } from './result';

/** A round's number in its tournament: a whole number from 1. */
export const roundNumberInvariant = defineRangeInvariant({
  name: 'round number',
  min: 1,
  accepts: [
    { label: 'the first round', value: 1 },
    {
      label: 'the last regular-season round',
      value: LAST_REGULAR_SEASON_ROUND,
    },
  ],
  refuses: [
    { label: 'zero', value: 0 },
    { label: 'a negative round', value: -1 },
  ],
});

const teamIdSchema = z.string().min(1).brand<'TeamId'>();
const playerIdSchema = z.string().min(1).brand<'PlayerId'>();
const tournamentIdSchema = z.string().min(1).brand<'TournamentId'>();
/** Postgres `integer`'s maximum: games.id is one. */
const POSTGRES_INTEGER_MAX = 2_147_483_647;
/**
 * A game's id: a positive whole number a games row can hold. A posted id
 * past the column's range names no game and is refused, not queried.
 */
const gameIdSchema = z
  .int()
  .positive()
  .max(POSTGRES_INTEGER_MAX)
  .brand<'GameId'>();
export const roundNumberSchema =
  roundNumberInvariant.schema.brand<'RoundNumber'>();

export type TeamId = z.infer<typeof teamIdSchema>;
export type PlayerId = z.infer<typeof playerIdSchema>;
/**
 * A tournament, by any key that names one (its slug, its database id as
 * text): the domain only compares them. Runs, counts and serijas never
 * cross tournaments.
 */
export type TournamentId = z.infer<typeof tournamentIdSchema>;
export type GameId = z.infer<typeof gameIdSchema>;
/** A round's number in its tournament: sportbet's `events.event_day`. */
export type RoundNumber = z.infer<typeof roundNumberSchema>;

export function teamId(value: string): Result<TeamId, 'empty'> {
  const parsed = teamIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('empty');
}

export function playerId(value: string): Result<PlayerId, 'empty'> {
  const parsed = playerIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('empty');
}

export function tournamentId(value: string): Result<TournamentId, 'empty'> {
  const parsed = tournamentIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('empty');
}

export function gameId(
  value: number,
): Result<GameId, 'not-a-positive-integer'> {
  const parsed = gameIdSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-a-positive-integer');
}

/**
 * A database id as typed into a URL or a form: a whole number from 1 with
 * no sign, no leading zero, at most ten digits. A pattern's source, so a
 * path matcher can be built on it (e.g. the sign-in return guard).
 */
export const ID_TEXT = '[1-9][0-9]{0,9}';

const ID_TEXT_ONLY = new RegExp(`^${ID_TEXT}$`, 'u');

/** Why typed text is no id: not its shape, or a number past Postgres `integer`. */
export type IdTextRefusal = 'not-an-id' | 'out-of-range';

/**
 * The one reading of an id typed into a URL or a form (ID_TEXT, then at
 * most 2147483647, Postgres `integer`'s maximum): its number, or why not.
 */
export function idFromText(text: string): Result<number, IdTextRefusal> {
  if (!ID_TEXT_ONLY.test(text)) return refuse('not-an-id');
  const value = Number(text);
  return value <= POSTGRES_INTEGER_MAX ? ok(value) : refuse('out-of-range');
}

/** A game's id typed into a URL or a form (idFromText). */
export function gameIdFromText(text: string): Result<GameId, IdTextRefusal> {
  const id = idFromText(text);
  if (!id.ok) return id;
  const parsed = gameIdSchema.safeParse(id.value);
  return parsed.success ? ok(parsed.data) : refuse('out-of-range');
}

export function roundNumber(
  value: number,
): Result<RoundNumber, 'not-a-positive-integer'> {
  const parsed = roundNumberSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : refuse('not-a-positive-integer');
}

/**
 * One Map key for several ids together, e.g. a player in a tournament. Each
 * part is prefixed with its length, so two different tuples of the same shape never
 * share a key, whatever characters the parts hold.
 */
export function idKey(...parts: readonly (string | number)[]): string {
  return parts
    .map((part) => {
      const text = String(part);
      return `${String(text.length)}:${text}`;
    })
    .join('');
}
