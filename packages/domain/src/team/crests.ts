/**
 * sportbet's Euroleague crests at 3eb95e7, copied into public/img/teams
 * (web's crests.test.ts holds this list equal to the directory). sportbet
 * reads the directory; a list keeps the pages and the import from touching
 * the disk.
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
 * crest; null for a blank name. It is also the key the schedule import
 * matches teams by, so a team the import matched is a team whose crest the
 * pages find.
 */
export function teamNameKey(team: string): string | null {
  const name = team.replace(/\s+/gu, ' ').trim();
  return name === '' ? null : name.toLowerCase();
}

/** The crest file of a team, SVG before PNG, or null when it has none. */
export function crestFile(
  team: string,
  files: readonly string[] = CREST_FILES,
): string | null {
  const key = teamNameKey(team);
  if (key === null) return null;
  for (const extension of ['svg', 'png']) {
    const file = `${key}.${extension}`;
    if (files.includes(file)) return file;
  }
  return null;
}

/** Whether the team has a committed crest (R-96). */
export function hasCrest(team: string): boolean {
  return crestFile(team) !== null;
}
