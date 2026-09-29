import { z } from 'zod';
import { ok, refuse, type Result } from './result';

const teamIdSchema = z.string().min(1).brand<'TeamId'>();
const playerIdSchema = z.string().min(1).brand<'PlayerId'>();
const gameIdSchema = z.int().positive().brand<'GameId'>();
const roundNumberSchema = z.int().positive().brand<'RoundNumber'>();

export type TeamId = z.infer<typeof teamIdSchema>;
export type PlayerId = z.infer<typeof playerIdSchema>;
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
