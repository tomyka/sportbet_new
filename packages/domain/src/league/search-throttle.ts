import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * The member search's throttle: 30 searches a minute per account, checked
 * before anything is read. sportbet limits no league route; this one lists
 * names, and a search box typed into stays far below it (the page waits
 * for a pause in typing).
 */
export function leagueSearchLimits(player: PlayerId): readonly ThrottleLimit[] {
  return [
    {
      key: `league-search:player:${player}`,
      maxAttempts: 30,
      windowSeconds: 60,
    },
  ];
}
