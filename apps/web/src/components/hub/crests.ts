import { CREST_FILES, teamNameKey } from '@sportbet/domain';

const DIRECTORY = '/img/teams';

/** Shown instead of a broken image when a team has no crest (TeamLogo::PLACEHOLDER). */
export const CREST_PLACEHOLDER = `${DIRECTORY}/_placeholder.svg`;

/**
 * The domain's list of sportbet's Euroleague crests, copied into
 * public/img/teams (crests.test.ts holds it equal to the directory); the
 * schedule import reads the same list, so a team it matched is a team whose
 * crest this finds.
 */
export { CREST_FILES };

/** TeamLogo::url: the team's crest, SVG before PNG, its name URL-encoded; else the placeholder. */
export function crestPath(
  team: string,
  files: readonly string[] = CREST_FILES,
): string {
  const base = teamNameKey(team);
  if (base === null) return CREST_PLACEHOLDER;
  for (const extension of ['svg', 'png']) {
    const file = `${base}.${extension}`;
    if (files.includes(file)) return `${DIRECTORY}/${encodeURIComponent(file)}`;
  }
  return CREST_PLACEHOLDER;
}
