import { describe, expect, it } from 'vitest';
import { CREST_FILES, crestFile, hasCrest, teamNameKey } from './crests';

describe('teamNameKey', () => {
  it('lower-cases and collapses whitespace, as TeamLogo::baseName', () => {
    expect(teamNameKey('  Zalgiris   KAUNAS ')).toBe('zalgiris kaunas');
    expect(teamNameKey('Dubai\t  Basketball')).toBe('dubai basketball');
  });

  it('is null for a blank name', () => {
    expect(teamNameKey('')).toBeNull();
    expect(teamNameKey(' \t ')).toBeNull();
  });
});

describe('crestFile and hasCrest', () => {
  it('finds the crest of a spaced, upper-case name', () => {
    expect(crestFile('  Real   Madrid ')).toBe('real madrid.png');
    expect(hasCrest('Zalgiris Kaunas')).toBe(true);
  });

  it('prefers an SVG to a PNG of the same name', () => {
    expect(crestFile('Lietuva', ['lietuva.png', 'lietuva.svg'])).toBe(
      'lietuva.svg',
    );
  });

  it('is null and false for an unknown or blank team', () => {
    expect(crestFile('Zalgiris')).toBeNull();
    expect(hasCrest('Zalgiris')).toBe(false);
    expect(hasCrest('  ')).toBe(false);
  });

  it('lists 20 crests, every one findable by its own name', () => {
    expect(CREST_FILES).toHaveLength(20);
    for (const file of CREST_FILES) {
      expect(hasCrest(file.replace(/\.png$/, ''))).toBe(true);
    }
  });
});
