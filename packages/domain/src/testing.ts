// Test-only entry point. Never imported by runtime code (web or db); lint
// enforces that (eslint.config.js). The invariants carry their own examples;
// this holds inputs too many to list, for sweeps on both sides, and the
// builders domain tests share.

import {
  gameId,
  playerId,
  roundNumber,
  teamId,
  type GameId,
  type PlayerId,
  type RoundNumber,
  type TeamId,
} from './shared/ids';
import { instantFrom, type Instant } from './shared/instant';
import type { Result } from './shared/result';

/**
 * Every code point from 1 to 0xffff as a one-character string, skipping the
 * UTF-16 surrogate range. Starts at 1: Postgres text cannot hold code point
 * 0 (NUL).
 */
export function everyBmpCharacter(): string[] {
  const characters: string[] = [];
  for (let codePoint = 1; codePoint <= 0xffff; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates
    characters.push(String.fromCharCode(codePoint));
  }
  return characters;
}

/** The accepted value, or a thrown error naming the refusal. */
export function unwrap<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) {
    throw new Error(`refused: ${result.refusal}`);
  }
  return result.value;
}

export const at = (iso: string): Instant => unwrap(instantFrom(iso));
export const team = (id: string): TeamId => unwrap(teamId(id));
export const player = (id: string): PlayerId => unwrap(playerId(id));
export const gameNo = (id: number): GameId => unwrap(gameId(id));
export const roundNo = (n: number): RoundNumber => unwrap(roundNumber(n));
