import { unicodeCiCompare } from '../ranking/league-table';

/** One listed player's final place (1 to 4) for one team, by the team's name. */
export interface MedalPick {
  readonly team: string;
  readonly finalPlace: number;
}

/** One team's line of "Finalų prognozės". */
export interface MedalRow {
  readonly team: string;
  readonly first: number;
  readonly second: number;
  readonly third: number;
  readonly fourth: number;
}

/**
 * MedalTally::forTournament: how many players put each team first,
 * second, third and fourth, grouped by team name, the most firsts first,
 * then seconds, then thirds, then the name (utf8mb4_unicode_ci). Who
 * counts is the caller's: the listed players (MedalTally's active
 * accounts).
 */
export function tallyMedals(picks: readonly MedalPick[]): readonly MedalRow[] {
  const byTeam = new Map<string, [number, number, number, number]>();
  for (const { team, finalPlace } of picks) {
    const counts = byTeam.get(team) ?? [0, 0, 0, 0];
    const index = finalPlace - 1;
    if (index >= 0 && index < counts.length) {
      counts[index] = (counts[index] ?? 0) + 1;
    }
    byTeam.set(team, counts);
  }
  return Object.freeze(
    [...byTeam]
      .map(([team, [first, second, third, fourth]]) =>
        Object.freeze({ team, first, second, third, fourth }),
      )
      .sort(
        (a, b) =>
          b.first - a.first ||
          b.second - a.second ||
          b.third - a.third ||
          unicodeCiCompare(a.team, b.team),
      ),
  );
}
