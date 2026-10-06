const DIRECTORY = '/img/teams';

/** Shown instead of a broken image when a team has no crest (TeamLogo::PLACEHOLDER). */
export const CREST_PLACEHOLDER = `${DIRECTORY}/_placeholder.svg`;

/**
 * sportbet's Euroleague crests at 3eb95e7, copied into public/img/teams
 * (crests.test.ts holds this list equal to the directory). sportbet reads
 * the directory; a list keeps the page from touching the disk.
 */
export const CREST_FILES: readonly string[] = [
  'anadolu efes istanbul.png',
  'armani olimpia milan.png',
  'besiktas istanbul.png',
  'crvena zvezda meridianbet belgrade.png',
  'dubai basketball.png',
  'fc barcelona.png',
  'fc bayern munich.png',
  'fenerbahce tarfin istanbul.png',
  'hapoel ibi tel aviv.png',
  'kosner baskonia vitoria-gasteiz.png',
  'ldlc asvel villeurbanne.png',
  'maccabi rapyd tel aviv.png',
  'olympiacos piraeus.png',
  'panathinaikos aktor athens.png',
  'paris basketball.png',
  'partizan mozzart bet belgrade.png',
  'real madrid.png',
  'valencia basket.png',
  'virtus bologna.png',
  'zalgiris kaunas.png',
];

/**
 * TeamLogo::baseName: the name lower-cased with its whitespace collapsed,
 * so a stray space in the teams table does not detach a team from its
 * crest; null for a blank name.
 */
function baseName(team: string): string | null {
  const name = team.replace(/\s+/gu, ' ').trim();
  return name === '' ? null : name.toLowerCase();
}

/** TeamLogo::url: the team's crest, SVG before PNG, its name URL-encoded; else the placeholder. */
export function crestPath(
  team: string,
  files: readonly string[] = CREST_FILES,
): string {
  const base = baseName(team);
  if (base === null) return CREST_PLACEHOLDER;
  for (const extension of ['svg', 'png']) {
    const file = `${base}.${extension}`;
    if (files.includes(file)) return `${DIRECTORY}/${encodeURIComponent(file)}`;
  }
  return CREST_PLACEHOLDER;
}
