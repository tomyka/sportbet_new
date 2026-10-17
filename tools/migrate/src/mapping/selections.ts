import { playerOf } from '@sportbet/db/edge';
import type { SavedLeague } from '@sportbet/db/league';
import type { LeagueId, LeagueMember, PlayerId } from '@sportbet/domain';
import type { MappedLeagues } from './leagues';

/** What the load must write beside a tournament's loaded leagues. */
export interface LeagueSelections {
  /** The league each player selects, where it is not the public one. */
  readonly selections: ReadonlyMap<PlayerId, LeagueId>;
  /** Players with no `active` membership in the tournament: they select the public league. */
  readonly noneActive: number;
  /** Players with two or more: the lowest member id is kept. */
  readonly severalActive: number;
  /**
   * What the saver adds that no sportbet row stands for: the public league
   * (when the tournament has none) and a public membership for each player
   * who has none (`ensurePublicLeague`, `joinPublicLeague`).
   */
  readonly added: { readonly leagues: number; readonly members: number };
}

/** The player's member rows marked `active`, lowest member id first. */
function activeRowsOf(
  own: readonly SavedLeague[],
  active: ReadonlySet<number>,
  player: PlayerId,
): LeagueMember[] {
  return own
    .flatMap(({ members }) => members)
    .filter(({ player: who, id }) => who === player && active.has(id))
    .toSorted((a, b) => a.id - b.id);
}

/** The league the lowest active row is in, unless it is the public one. */
function privateLeagueOf(
  active: readonly LeagueMember[],
  publicId: LeagueId | undefined,
): LeagueId | undefined {
  const [first] = active;
  return first !== undefined && first.league !== publicId
    ? first.league
    : undefined;
}

/**
 * Each of a tournament's players' selected league: the tournament's member
 * row with `active = 1`, else the public league (sportbet's session read
 * the `active` row of the tournament, TournamentController::enter); with
 * two such rows, the lowest member id. The counts are notices.
 */
export function selectLeagues(
  leagues: MappedLeagues,
  tournament: number,
  playing: readonly number[],
): LeagueSelections {
  const own = [...leagues.saved.values()].filter(
    ({ league }) => leagues.tournamentOf.get(league.id) === tournament,
  );
  const publicLeague = own.find(({ league }) => league.kind.public);
  const publicId = publicLeague?.league.id;
  const publicMembers = new Set(
    (publicLeague?.members ?? []).map(({ player }) => player),
  );
  const selections = new Map<PlayerId, LeagueId>();
  let noneActive = 0;
  let severalActive = 0;
  let missingMembership = 0;
  for (const user of playing) {
    const player = playerOf(user);
    const active = activeRowsOf(own, leagues.active, player);
    noneActive += active.length === 0 ? 1 : 0;
    severalActive += active.length > 1 ? 1 : 0;
    const chosen = privateLeagueOf(active, publicId);
    if (chosen !== undefined) selections.set(player, chosen);
    missingMembership += publicMembers.has(player) ? 0 : 1;
  }
  return {
    selections,
    noneActive,
    severalActive,
    added: {
      leagues: publicLeague === undefined ? 1 : 0,
      members: missingMembership,
    },
  };
}
