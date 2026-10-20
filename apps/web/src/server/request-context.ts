import {
  countPendingInvites,
  loadPlayerLeagues,
  type PlayerLeague,
} from '@sportbet/db/league';
import { findTournamentById, loadSeason } from '@sportbet/db/tournament';
import {
  listPlayerTournaments,
  type SignedInPlayer,
} from '@sportbet/db/account';
import { loadMissingResultPredictions } from '@sportbet/db/prediction';
import {
  chooseTournament,
  isAdmin,
  tournamentContext,
  type PlayerId,
  type Tournament,
  type TournamentContext,
} from '@sportbet/domain';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { now } from './clock';
import { getDb } from './db';
import { currentPlayer } from './session/session';

/** Who the request is from: what the shell and the pages may read of them. */
interface ContextPlayer {
  readonly id: PlayerId;
  readonly name: string;
  /** Read on the server only; the shell is told its first letter (shell-for.ts). */
  readonly surname: string;
  readonly isAdmin: boolean;
  /** The invitations to leagues waiting for an answer, in every tournament (the invites badge, issue 183). */
  readonly pendingInvites: number;
}

interface ContextTournament extends TournamentContext {
  readonly tournament: Tournament;
  /** The "Spėjimai" badge: the current round's open games the player has not answered (MissingPredictions). */
  readonly missingResults: number;
  /** The player's leagues in this tournament, in membership order, the selected one marked (the switcher). */
  readonly leagues: readonly PlayerLeague[];
}

export interface RequestContext {
  readonly player: ContextPlayer | null;
  readonly tournament: ContextTournament | null;
}

/** The player this request's session cookie names, if the session is live (read every request). */
export const signedInPlayer = cache(async (): Promise<SignedInPlayer | null> =>
  currentPlayer(getDb(), await cookies(), now()),
);

/**
 * Who the request is from and the tournament it is about, read fresh each
 * request (decision 5: the session holds only the player): the player's
 * last-used tournament if they are in it (R-28), else sportbet's fallback
 * (chooseTournament); its current round under the live rules, whether
 * it has started, whether standings are locked, and the navigation's flags
 * (tournamentContext); the player's leagues there and their pending
 * invites, for the switcher.
 */
export const requestContext = cache(async (): Promise<RequestContext> => {
  const signedIn = await signedInPlayer();
  if (signedIn === null) return { player: null, tournament: null };
  const db = getDb();
  const player: ContextPlayer = {
    id: signedIn.player,
    name: signedIn.name,
    surname: signedIn.surname,
    isAdmin: isAdmin(signedIn.role),
    pendingInvites: await countPendingInvites(db, signedIn.player),
  };
  const chosen = chooseTournament({
    lastUsed: signedIn.lastTournament,
    playing: await listPlayerTournaments(db, signedIn.player),
  });
  const tournament =
    chosen === null ? undefined : await findTournamentById(db, chosen);
  if (tournament === undefined) return { player, tournament: null };
  const season = await loadSeason(db, tournament);
  const at = now();
  return {
    player,
    tournament: {
      tournament,
      ...tournamentContext({
        season,
        survival: tournament.survival,
        now: at,
      }),
      missingResults: await loadMissingResultPredictions(db, {
        player: signedIn.player,
        tournament,
        season,
        now: at,
      }),
      leagues: await loadPlayerLeagues(db, tournament, signedIn.player),
    },
  };
});
