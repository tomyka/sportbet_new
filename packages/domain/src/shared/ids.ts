import { z } from 'zod';
import { defineRangeInvariant } from '../invariant/range-invariant';
import { ok, refuse, type Result } from './result';

/** A round's number in its tournament: a whole number from 1. */
export const roundNumberInvariant = defineRangeInvariant({
  name: 'round number',
  min: 1,
  accepts: [
    { label: 'the first round', value: 1 },
    { label: 'the last regular-season round', value: 38 },
  ],
  refuses: [
    { label: 'zero', value: 0 },
    { label: 'a negative round', value: -1 },
  ],
});

const teamIdSchema = z.string().min(1).brand<'TeamId'>();
const playerIdSchema = z.string().min(1).brand<'PlayerId'>();
const tournamentIdSchema = z.string().min(1).brand<'TournamentId'>();
const gameIdSchema = z.int().positive().brand<'GameId'>();
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
