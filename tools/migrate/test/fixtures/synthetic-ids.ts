// The synthetic dump's sportbet ids for the golden scenario's names, and
// the helpers that write the golden points as sportbet stores them.

import {
  gameNo,
  GOLDEN,
  player,
  team,
  type GoldenIds,
} from '@sportbet/domain/testing';

export type Name = (typeof GOLDEN.players)[number];
export type TeamName = (typeof GOLDEN.teams)[number];

/** sportbet's ids for the golden rows: the players 1-4, teams 5-8, games 7-9, events 4-5. */
export const IDS = {
  player: (name: Name): number => GOLDEN.players.indexOf(name) + 1,
  team: (name: TeamName): number => GOLDEN.teams.indexOf(name) + 5,
  game: (id: 1 | 2 | 3): number => id + 6,
  event: (round: 1 | 2): number => round + 3,
};

/** The golden names as the dump's sportbet ids, for the domain's golden helpers. */
export const DUMP_IDS: GoldenIds = {
  player: (name) => player(String(IDS.player(name))),
  team: (name) => team(String(IDS.team(name))),
  game: (id) => gameNo(IDS.game(id)),
};

/** The Euroleague tournament's id. */
export const EUROLEAGUE = 2;
/** An unscored Euroleague game with sportbet's blank odds row. */
export const UNSCORED_GAME = 10;

/** "380.0000" as PHP writes the double: 380. */
export const double = (fourPlaces: string | null): string | null =>
  fourPlaces === null ? null : String(Number(fourPlaces));
/** "79.5000" as the DECIMAL(8,2) text: 79.50. */
export const decimal = (fourPlaces: string | undefined): string => {
  if (fourPlaces === undefined) throw new Error('fixture: no such column');
  return fourPlaces.slice(0, -2);
};

/** A golden-points key, "ada / EL h2", as its player and the rest. */
export const golden = (key: string): { player: Name; rest: string } => {
  const [name, rest] = key.split(' / ');
  const player = GOLDEN.players.find((each) => each === name);
  if (player === undefined || rest === undefined) {
    throw new Error(`fixture: bad key ${key}`);
  }
  return { player, rest };
};

/** "EL h2" as the golden game 2. */
export const goldenGame = (label: string): 1 | 2 | 3 => {
  const game = GOLDEN.games.find(({ id }) => label === `EL h${String(id)}`);
  if (game === undefined) throw new Error(`fixture: bad game ${label}`);
  return game.id;
};
