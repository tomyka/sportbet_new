import { describe, expect, it } from 'vitest';
import { PROFILE } from '../../../tests/support/hub-cards';
import { headerLine, sportName } from './header-line';

// hub.blade.php and register.blade.php: the sport (R-56), then "· start - end"
// or "· nuo start".

describe('sportName (R-56)', () => {
  it.each([
    ['basketball', 'Krepšinis'],
    ['Basketball', 'Krepšinis'],
    ['FOOTBALL', 'Futbolas'],
    ['football', 'Futbolas'],
    ['handball', 'handball'],
    ['Rankinis', 'Rankinis'],
  ] as const)('sport (R-56): %s is shown as %s', (stored, shown) => {
    expect(sportName(stored)).toBe(shown);
  });
});

describe('headerLine', () => {
  it('header: the sport with its first letter raised, and both dates', () => {
    expect(headerLine(PROFILE, '2027-05-23')).toBe(
      'Krepšinis · 2026-09-30 - 2027-05-23',
    );
  });

  it('header: "nuo" the start date when there is no end date', () => {
    expect(headerLine(PROFILE, null)).toBe('Krepšinis · nuo 2026-09-30');
  });

  it('header: the sport alone with no start date', () => {
    expect(headerLine({ ...PROFILE, startsOn: null }, '2027-05-23')).toBe(
      'Krepšinis',
    );
  });
});
