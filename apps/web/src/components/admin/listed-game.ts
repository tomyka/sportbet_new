import type { AdminGame, AdminGamesPage } from '@sportbet/db';

/**
 * What a game's row and dialog need of it, as plain data: a client component
 * is given nothing but plain objects, and an AdminGame's result is a Score.
 */
export type ListedGame = Pick<
  AdminGame,
  | 'id'
  | 'roundId'
  | 'roundName'
  | 'home'
  | 'homeName'
  | 'away'
  | 'awayName'
  | 'tipOff'
  | 'deletion'
>;

/** The page's data the client components read: its games as ListedGame. */
export type GamesPageData = Omit<AdminGamesPage, 'games'> & {
  readonly games: readonly ListedGame[];
};

/** A listed game as plain data. */
export function listedGame(game: AdminGame): ListedGame {
  return {
    id: game.id,
    roundId: game.roundId,
    roundName: game.roundName,
    home: game.home,
    homeName: game.homeName,
    away: game.away,
    awayName: game.awayName,
    tipOff: game.tipOff,
    deletion: game.deletion,
  };
}
