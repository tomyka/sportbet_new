import {
  resultBoxesOpen,
  resultsPageGames,
  type GameId,
  type Instant,
  type RoundNumber,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loadSeason } from '../season/repository';
import { rounds } from '../season/schema';
import { teamNamesOf } from '../team/repository';

/** A round of the tournament: its number, name and knockout flag. */
export interface ResultsPageRound {
  readonly number: RoundNumber;
  readonly name: string;
  readonly knockout: boolean;
}

/** One game of a results page. */
export interface ResultsPageGame {
  readonly game: GameId;
  readonly round: RoundNumber;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
  readonly result: { readonly home: number; readonly away: number } | null;
  /** R-41, R-63: shown as -1 : -1, "Atidėta". */
  readonly postponed: boolean;
  /** Whether the boxes take input (resultBoxesOpen). */
  readonly open: boolean;
}

export interface ResultsPage {
  readonly rounds: readonly ResultsPageRound[];
  readonly games: readonly ResultsPageGame[];
}

const roundRows = z.array(
  z.object({ number: z.int(), name: z.string(), knockout: z.boolean() }),
);

/**
 * ResultController::getResultsCurrentRound (`round` the current round,
 * null when there is none) and getResultsAll ('all': the tournament's
 * games, R-66). This only loads; which games, in which order, and whether
 * their boxes take input are the domain's.
 */
export async function loadResultsPage(
  db: Executor,
  input: {
    readonly tournament: Tournament;
    readonly round: RoundNumber | 'all' | null;
    readonly now: Instant;
    readonly rules: RuleSet;
  },
): Promise<ResultsPage> {
  const { tournament, round, now } = input;
  const season = await loadSeason(db, tournament);
  const nameOf = await teamNamesOf(db, tournament);
  const menu = roundRows.parse(
    await db
      .select({
        number: rounds.number,
        name: rounds.name,
        knockout: rounds.knockout,
      })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id))
      .orderBy(asc(rounds.number), asc(rounds.id)),
  );
  const listed = resultsPageGames(season.games, round);
  return {
    rounds: menu.map((row) => {
      const number = season.rounds.find((each) => each.number === row.number);
      if (number === undefined) {
        throw new Error(
          `loadResultsPage: round ${String(row.number)} is not in its season`,
        );
      }
      return { number: number.number, name: row.name, knockout: row.knockout };
    }),
    games: listed.map((game) => ({
      game: game.id,
      round: game.round,
      tipOff: game.tipOff,
      home: nameOf(game.home),
      away: nameOf(game.away),
      result:
        game.result === null
          ? null
          : { home: game.result.home, away: game.result.away },
      postponed: game.postponed,
      open: resultBoxesOpen(game, now),
    })),
  };
}
