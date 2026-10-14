'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { LEAGUE_SEARCH } from './league-paths';

/** What the member search answers: the four fields of each player, never an address. */
const foundSchema = z.array(
  z.object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    surname: z.string(),
  }),
);

export type FoundPlayerView = z.infer<typeof foundSchema>[number];

/** sportbet searches from two characters (`query.length < 2`); R-120 counts characters, not bytes. */
const MINIMUM_CHARACTERS = 2;

/** A pause in typing before the search is asked (the throttle is 30 a minute). */
const PAUSE_MS = 250;

interface Answer {
  readonly query: string;
  readonly players: readonly FoundPlayerView[] | null;
}

/**
 * The invite box's search: `query` as typed, and the players found for it,
 * asked of `/leagues/searchUsers` after a pause in typing - `null` while
 * nothing is shown (under two characters, no answer yet, or an answer that
 * is not a list of players), `[]` for "Nerasta". An answer to an earlier
 * query is never shown.
 */
export function usePlayerSearch(league: number): {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly found: readonly FoundPlayerView[] | null;
} {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (Array.from(query).length < MINIMUM_CHARACTERS) return;
    let current = true;
    const timer = setTimeout(() => {
      const url = `${LEAGUE_SEARCH}?query=${encodeURIComponent(query)}&leagueID=${String(league)}`;
      void fetch(url)
        .then((response) => response.json())
        .then((body: unknown) => {
          const players = foundSchema.safeParse(body);
          if (current) {
            setAnswer({
              query,
              players: players.success ? players.data : null,
            });
          }
        })
        .catch(() => {
          if (current) setAnswer({ query, players: null });
        });
    }, PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, league]);
  const shown =
    answer !== null &&
    answer.query === query &&
    Array.from(query).length >= MINIMUM_CHARACTERS
      ? answer.players
      : null;
  return { query, setQuery, found: shown };
}
