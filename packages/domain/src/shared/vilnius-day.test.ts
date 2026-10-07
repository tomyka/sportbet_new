import { describe, expect, it } from 'vitest';
import { at } from '../testing';
import { vilniusDay } from './vilnius-day';

describe('vilniusDay', () => {
  it('names the calendar day in Vilnius, summer time (UTC+3)', () => {
    expect(vilniusDay(at('2026-10-24T20:59:59Z'))).toBe('2026-10-24');
    expect(vilniusDay(at('2026-10-24T21:00:00Z'))).toBe('2026-10-25');
  });

  it('follows the clock change: winter time is UTC+2', () => {
    expect(vilniusDay(at('2026-10-25T21:59:59Z'))).toBe('2026-10-25');
    expect(vilniusDay(at('2026-10-25T22:00:00Z'))).toBe('2026-10-26');
  });
});
