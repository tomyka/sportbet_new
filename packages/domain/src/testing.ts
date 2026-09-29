// Test-only entry point. Never imported by runtime code (web or db); lint
// enforces that (eslint.config.js). The invariants carry their own examples;
// this holds inputs too many to list, for sweeps on both sides, and the
// builders domain tests share.

import type { FillInDice } from './fill-in/fill-in';
import { Game } from './round/game';
import { Round } from './round/round';
import type { Stage } from './round/stage';
import { sportbetRules, type RuleSet } from './rules/rule-set';
import {
  gameId,
  playerId,
  roundNumber,
  teamId,
  tournamentId,
  type GameId,
  type PlayerId,
  type RoundNumber,
  type TeamId,
  type TournamentId,
} from './shared/ids';
import { instantFrom, type Instant } from './shared/instant';
import type { Result } from './shared/result';
import { Rate, Score } from './score/score';
import type { FinalPlace, TeamPick } from './standings/standings-prediction';
import type { TeamOutcome } from './standings/team-outcomes';

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
export const tournamentKey = (id: string): TournamentId =>
  unwrap(tournamentId(id));
export const gameNo = (id: number): GameId => unwrap(gameId(id));
export const roundNo = (n: number): RoundNumber => unwrap(roundNumber(n));
export const score = (home: number, away: number): Score =>
  unwrap(Score.of(home, away));
export const rate = (value: number): Rate => unwrap(Rate.of(value));

export interface RoundSpec {
  readonly number: number;
  readonly stage?: Stage;
  readonly rate?: number;
  readonly survival?: boolean;
  readonly knockout?: boolean;
}

/** A regular-season round at rate 1 with survival on, unless told otherwise. */
export function makeRound(
  spec: RoundSpec,
  rules: RuleSet = sportbetRules,
): Round {
  return unwrap(
    Round.create(
      {
        number: roundNo(spec.number),
        stage: spec.stage ?? 'regular',
        rate: rate(spec.rate ?? 1),
        survival: spec.survival ?? true,
        knockout: spec.knockout ?? false,
      },
      rules,
    ),
  );
}

export interface GameSpec {
  readonly id: number;
  readonly round: number;
  readonly home: string;
  readonly away: string;
  readonly tipOff: string;
  readonly result?: readonly [number, number];
}

export function makeGame(spec: GameSpec, rules: RuleSet = sportbetRules): Game {
  const game = unwrap(
    Game.schedule({
      id: gameNo(spec.id),
      round: roundNo(spec.round),
      home: team(spec.home),
      away: team(spec.away),
      tipOff: at(spec.tipOff),
    }),
  );
  return spec.result === undefined
    ? game
    : unwrap(game.withResult(score(...spec.result), rules));
}

/** Dice that roll the given numbers and flip the given coins, in order. */
export function scriptedDice(
  rolls: readonly number[],
  coins: readonly boolean[] = [],
): FillInDice {
  let nextRoll = 0;
  let nextCoin = 0;
  return {
    roll: () => {
      const value = rolls[nextRoll++];
      if (value === undefined) throw new Error('scriptedDice: out of rolls');
      return value;
    },
    coin: () => {
      const value = coins[nextCoin++];
      if (value === undefined) throw new Error('scriptedDice: out of coins');
      return value;
    },
  };
}

/** Repeatable pseudo-random dice: a linear congruential generator. */
export function seededDice(seed: number): FillInDice {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  return {
    roll: (die) => next() % (die + 1),
    coin: () => next() % 2 === 0,
  };
}

export interface StandingsColumns {
  readonly place?: number;
  readonly playOffs?: boolean;
  readonly finalFour?: boolean;
  readonly finalPlace?: FinalPlace;
}

/** A standings prediction row; every column not named was never saved. */
export function teamPick(
  name: string,
  columns: StandingsColumns = {},
): TeamPick {
  return {
    team: team(name),
    place: columns.place ?? null,
    playOffs: columns.playOffs ?? null,
    finalFour: columns.finalFour ?? null,
    finalPlace: columns.finalPlace ?? null,
  };
}

/** A team's outcome; a stage not named was not reached. */
export function teamOutcome(
  name: string,
  columns: StandingsColumns = {},
): TeamOutcome {
  return {
    team: team(name),
    place: columns.place ?? null,
    playOffs: columns.playOffs ?? false,
    finalFour: columns.finalFour ?? false,
    finalPlace: columns.finalPlace ?? null,
  };
}
