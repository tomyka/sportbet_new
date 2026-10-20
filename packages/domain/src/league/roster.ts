import type { PlayerStatus } from '../player/player-status';
import type { PlayerId, TournamentId } from '../shared/ids';
import type { LeagueMember } from './league';

/**
 * LeagueRoster::visibleTo: the league's members a viewer may see - listed
 * in the tournament (RA-4: R-7, R-19; sportbet's user_settings.active) and
 * no more a guest than the viewer (is_guest <= the viewer's): a full member
 * sees full members, a guest sees everyone. A member with no status is an
 * impossible state (every league member plays the tournament, R-20).
 */
export function leagueRoster(input: {
  readonly members: readonly Pick<LeagueMember, 'player' | 'isGuest'>[];
  readonly statuses: ReadonlyMap<PlayerId, PlayerStatus>;
  readonly viewerIsGuest: boolean;
  readonly tournament: TournamentId;
}): ReadonlySet<PlayerId> {
  const { members, statuses, viewerIsGuest, tournament } = input;
  return new Set(
    members
      .filter((member) => viewerIsGuest || !member.isGuest)
      .filter((member) => {
        const status = statuses.get(member.player);
        if (status === undefined) {
          throw new Error(
            `leagueRoster: league member ${member.player} has no status in tournament ${tournament}`,
          );
        }
        return status.isListedIn(tournament);
      })
      .map((member) => member.player),
  );
}
