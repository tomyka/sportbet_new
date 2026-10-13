import type { TeamId } from '@sportbet/domain';

/** A team's stored name; every team the domain names is the tournament's, so a missing one is an impossible state. */
export function teamName(
  names: ReadonlyMap<TeamId, string>,
  team: TeamId,
): string {
  const name = names.get(team);
  if (name === undefined) throw new Error(`team ${team} has no name`);
  return name;
}
