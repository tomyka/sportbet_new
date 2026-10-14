import type { PlayerId } from '@sportbet/domain';
import type { LeagueMessage } from '../../src/server/flash';
import type { LeagueWorld } from '../../src/server/leagues/league-action';

/** A league POST from this site, with the given fields and headers. */
export function leaguePost(
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return new Request(`https://sportbet.example${path}`, {
    method: 'POST',
    headers: {
      origin: 'https://sportbet.example',
      host: 'sportbet.example',
      ...headers,
    },
    body,
  });
}

/** The messages a fake world was asked to leave. */
export interface LeftMessages {
  readonly left: LeagueMessage[];
}

/** The session and the message, faked: who is signed in, and the messages left. */
export function fakeLeagueWorld(
  player: PlayerId | null,
): LeagueWorld & LeftMessages {
  const left: LeagueMessage[] = [];
  return {
    signedIn: () => Promise.resolve(player === null ? null : { player }),
    leaveMessage: (message) => {
      left.push(message);
      return Promise.resolve();
    },
    left,
  };
}
