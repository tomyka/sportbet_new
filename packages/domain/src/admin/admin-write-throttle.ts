import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * Slice 13: an admin's accepted structure writes (tournaments, rounds,
 * games, teams), 60 a minute. Counted after the form check, so a refused
 * form costs nothing. sportbet sets no limit.
 */
export function adminWriteLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [
    {
      key: `admin-write:player:${player}`,
      maxAttempts: 60,
      windowSeconds: 60,
    },
  ];
}
