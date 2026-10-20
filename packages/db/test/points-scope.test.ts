import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every query on a points table reads the live rows through `liveRows`
// (points/live.ts), so none can sum the retired `production` and `sportbet`
// rows. A source file outside points/ that touches a points table is either
// built on liveRows or named here with why it goes without.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const WITHOUT_LIVE_ROWS: Readonly<Record<string, string>> = {
  'account/deletion.ts':
    "deleteAccount removes the deleted player's own rows under every source: the player ceases to exist",
  'season/admin-games.ts':
    "deleteGame removes the game's own rows under every source: the game ceases to exist",
  'season/admin.ts':
    'a round that any points row, of any source, still names cannot be deleted (a foreign key restricts it)',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC)
  .map((path) => ({
    name: relative(SRC, path).split(sep).join('/'),
    text: readFileSync(path, 'utf8'),
  }))
  .filter(({ name }) => !name.startsWith('points/'));

const READS_POINTS_SCHEMA = /from '(\.\.\/)+points\/schema'/;
const USES_LIVE_ROWS = /from '(\.\.\/)+points\/live'/;

describe('points tables are read through liveRows', () => {
  it('every file outside points/ that imports a points table imports liveRows or is a listed exception', () => {
    const uncovered = files
      .filter(({ text }) => READS_POINTS_SCHEMA.test(text))
      .filter(({ text }) => !USES_LIVE_ROWS.test(text))
      .map(({ name }) => name)
      .filter((name) => !(name in WITHOUT_LIVE_ROWS))
      .sort();
    expect(uncovered).toEqual([]);
  });

  it('the listed exceptions still import a points table', () => {
    const stale = Object.keys(WITHOUT_LIVE_ROWS).filter(
      (name) =>
        !files.some(
          ({ name: file, text }) =>
            file === name && READS_POINTS_SCHEMA.test(text),
        ),
    );
    expect(stale).toEqual([]);
  });

  it('only points/ names the live source', () => {
    const naming = files
      .filter(({ text }) => text.includes('LIVE_SOURCE'))
      .map(({ name }) => name);
    expect(naming).toEqual([]);
  });
});
