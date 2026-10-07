import type { Game } from '../round/game';
import type { RoundNumber } from '../shared/ids';
import type { Instant } from '../shared/instant';

/** A round as the results page reads it. */
export interface ResultsRound {
  readonly number: RoundNumber;
  readonly knockout: boolean;
}

/** What the grouping reads of a game: a domain Game, or a page's row of one. */
export interface ResultsGroupable {
  readonly round: RoundNumber;
  readonly tipOff: Instant;
  readonly result: unknown;
}

/** One card of a round: its Vilnius day (a knockout round), or null (the round's one card, "Rungtynės"). */
export interface ResultsCard<G extends ResultsGroupable = Game> {
  readonly day: string | null;
  readonly games: readonly G[];
}

export interface ResultsRoundGroup<G extends ResultsGroupable = Game> {
  readonly round: RoundNumber;
  /** Every game scored: sportbet draws the round collapsed. */
  readonly finished: boolean;
  readonly cards: readonly ResultsCard<G>[];
}

/**
 * ResultController's two pages: "Rezultatai (turas)" lists the current
 * round's games (null: none), "Visi rezultatai" every game of the
 * tournament (R-66); by tip-off, then id (sportbet's orderBy('game_date')).
 */
export function resultsPageGames<G extends Game>(
  games: readonly G[],
  round: RoundNumber | 'all' | null,
): G[] {
  if (round === null) return [];
  return games
    .filter((game) => round === 'all' || game.round === round)
    .sort((a, b) => a.tipOff - b.tipOff || a.id - b.id);
}

/**
 * Whether a game's boxes take input: once it has tipped off, as sportbet's
 * page enables them, or while it is postponed, so its -1 : -1 can be
 * cleared (R-63, decision 10).
 */
export function resultBoxesOpen(game: Game, now: Instant): boolean {
  return game.postponed || game.hasTippedOffAt(now);
}

/**
 * results.blade.php's grouping: by round, in round order; a knockout round
 * by Vilnius calendar day as `dayOf` names it, any other as one card
 * (decision 5). A round whose games are all scored is finished.
 */
export function groupResultGames<G extends ResultsGroupable>(
  games: readonly G[],
  rounds: readonly ResultsRound[],
  dayOf: (instant: Instant) => string,
): ResultsRoundGroup<G>[] {
  return [...rounds]
    .sort((a, b) => a.number - b.number)
    .map((round) => {
      const own = games.filter((game) => game.round === round.number);
      const cards: { day: string | null; games: G[] }[] = [];
      for (const game of own) {
        const day = round.knockout ? dayOf(game.tipOff) : null;
        const card = cards.find((each) => each.day === day);
        if (card === undefined) cards.push({ day, games: [game] });
        else card.games.push(game);
      }
      return {
        round: round.number,
        finished: own.every((game) => game.result !== null),
        cards,
      };
    })
    .filter((group) => group.cards.length > 0);
}
