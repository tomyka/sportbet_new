import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  dayHeader,
  vilniusClock,
  vilniusDate,
  vilniusDateTime,
  vilniusStamp,
} from './vilnius-time';

// R-51: game times in Vilnius time, written in Lithuanian.

describe('vilniusDateTime', () => {
  it.each([
    ['2026-10-06T18:00:00Z', 'spalio 6 d., 21:00'],
    ['2027-01-15T17:30:00Z', 'sausio 15 d., 19:30'],
    ['2027-03-04T18:00:00Z', 'kovo 4 d., 20:00'],
    ['2026-10-25T00:30:00Z', 'spalio 25 d., 03:30'],
    ['2026-12-31T22:30:00Z', 'sausio 1 d., 00:30'],
  ] as const)('R-51: %s is %s', (instant, text) => {
    expect(vilniusDateTime(at(instant))).toBe(text);
  });
});

describe('the predictions page (results.blade.php, game-single.blade.php)', () => {
  it("vilniusDate: the Vilnius calendar day, which can be UTC's next one", () => {
    expect(vilniusDate(at('2026-10-05T21:30:00Z'))).toBe('2026-10-06');
    expect(vilniusDate(at('2026-10-05T20:30:00Z'))).toBe('2026-10-05');
    expect(vilniusDate(at('2027-03-04T22:30:00Z'))).toBe('2027-03-05');
  });

  it('vilniusClock: H:i in Vilnius, summer and winter', () => {
    expect(vilniusClock(at('2026-10-06T18:00:00Z'))).toBe('21:00');
    expect(vilniusClock(at('2027-03-04T18:00:00Z'))).toBe('20:00');
    expect(vilniusClock(at('2027-03-04T07:05:00Z'))).toBe('09:05');
  });

  it('vilniusStamp: Y-m-d H:i in Vilnius (the single game page writes " LT" after it)', () => {
    expect(vilniusStamp(at('2027-03-04T18:00:00Z'))).toBe('2027-03-04 20:00');
  });

  // What sportbet's PHP printed for each, through Carbon 3.14.0 (its
  // composer.lock at 3eb95e7): ucfirst(Carbon::parse($day)->locale('lt')
  // ->isoFormat('MMMM D')) - the month in the genitive.
  it.each([
    ['2026-10-06', 'Spalio 6'],
    ['2027-01-01', 'Sausio 1'],
    ['2027-02-14', 'Vasario 14'],
    ['2027-03-05', 'Kovo 5'],
    ['2027-04-01', 'Balandžio 1'],
    ['2027-05-23', 'Gegužės 23'],
    ['2027-06-01', 'Birželio 1'],
    ['2027-07-01', 'Liepos 1'],
    ['2027-08-31', 'Rugpjūčio 31'],
    ['2026-09-10', 'Rugsėjo 10'],
    ['2026-11-03', 'Lapkričio 3'],
    ['2026-12-24', 'Gruodžio 24'],
  ] as const)('dayHeader: %s is %s', (day, header) => {
    expect(dayHeader(day)).toBe(header);
  });
});
