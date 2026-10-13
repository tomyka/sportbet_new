import type { Points, TeamId } from '@sportbet/domain';

/** Points as sportbet's survival pages print them: PHP's (int), towards zero. */
export const wholePoints = (points: Points): number =>
  Math.trunc(points.hundredths / 100);

/** A team's stored name; every team the domain names is the tournament's, so a missing one is an impossible state. */
export function teamName(
  names: ReadonlyMap<TeamId, string>,
  team: TeamId,
): string {
  const name = names.get(team);
  if (name === undefined) throw new Error(`team ${team} has no name`);
  return name;
}
