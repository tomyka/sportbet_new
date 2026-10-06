import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREST_FILES, CREST_PLACEHOLDER, crestPath } from './crests';

// sportbet's TeamLogo: a team's crest by its lower-cased, space-collapsed
// name, SVG before PNG, URL-encoded; the placeholder when none exists.

describe('crests', () => {
  it('crests: CREST_FILES names exactly the crests in public/img/teams', () => {
    const directory = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'public',
      'img',
      'teams',
    );
    const files = readdirSync(directory).filter(
      (name) => name !== '_placeholder.svg',
    );
    expect([...CREST_FILES].sort()).toEqual(files.sort());
  });

  it("crests: a team's crest is its name lower-cased, URL-encoded", () => {
    expect(crestPath('Zalgiris Kaunas')).toBe(
      '/img/teams/zalgiris%20kaunas.png',
    );
  });

  it('crests: stray, doubled and trailing spaces do not detach a team from its crest', () => {
    expect(crestPath('  Real   Madrid ')).toBe('/img/teams/real%20madrid.png');
  });

  it('crests: an SVG wins over a PNG of the same name', () => {
    expect(crestPath('Lietuva', ['lietuva.png', 'lietuva.svg'])).toBe(
      '/img/teams/lietuva.svg',
    );
  });

  it('crests: a team with no crest, or no name, gets the placeholder', () => {
    expect(crestPath('Nežinoma')).toBe(CREST_PLACEHOLDER);
    expect(crestPath('   ')).toBe(CREST_PLACEHOLDER);
    expect(CREST_PLACEHOLDER).toBe('/img/teams/_placeholder.svg');
  });
});
