import { describe, expect, it } from 'vitest';
import { at, unwrap } from '../testing';
import { utcPreview, vilniusTipOff } from './vilnius-time';

// R-91: a typed Vilnius time that does not exist or is ambiguous on a
// clock-change day is refused, and the UTC time is shown before saving.

describe('vilniusTipOff (R-91)', () => {
  it.each([
    ['2026-12-01T20:00', '2026-12-01T18:00:00Z'],
    ['2026-07-01T20:00', '2026-07-01T17:00:00Z'],
    ['2026-12-31T23:59', '2026-12-31T21:59:00Z'],
    ['2027-01-01T00:00', '2026-12-31T22:00:00Z'],
    ['2026-10-25T02:59', '2026-10-24T23:59:00Z'],
    ['2026-10-25T04:00', '2026-10-25T02:00:00Z'],
    ['2027-03-28T02:59', '2027-03-28T00:59:00Z'],
    ['2027-03-28T04:00', '2027-03-28T01:00:00Z'],
    ['2028-02-29T12:00', '2028-02-29T10:00:00Z'],
  ])('vilniusTipOff: %s is %s', (typed, utc) => {
    expect(vilniusTipOff(typed)).toEqual({ ok: true, value: at(utc) });
  });

  it.each(['2027-03-28T03:00', '2027-03-28T03:30', '2027-03-28T03:59'])(
    'vilniusTipOff: %s does not exist (the spring change skips 03:00-03:59)',
    (typed) => {
      expect(vilniusTipOff(typed)).toEqual({
        ok: false,
        refusal: 'nonexistent-time',
      });
    },
  );

  it.each(['2026-10-25T03:00', '2026-10-25T03:30', '2026-10-25T03:59'])(
    'vilniusTipOff: %s is ambiguous (the autumn change repeats 03:00-03:59)',
    (typed) => {
      expect(vilniusTipOff(typed)).toEqual({
        ok: false,
        refusal: 'ambiguous-time',
      });
    },
  );

  it.each([
    '',
    '2026-13-01T10:00',
    '2026-02-30T10:00',
    '2027-02-29T10:00',
    '2026-12-01 20:00',
    '2026-12-01T24:00',
    '2026-12-01T20:60',
    '2026-12-01T20:00:00',
    '2026-12-01',
    ' 2026-12-01T20:00',
    'tomorrow',
  ])('vilniusTipOff: %j is not a time', (typed) => {
    expect(vilniusTipOff(typed)).toEqual({ ok: false, refusal: 'bad-time' });
  });
});

describe('utcPreview (R-91)', () => {
  it('utcPreview: the UTC time the box will save, to the minute', () => {
    expect(utcPreview(at('2026-12-01T18:00:00Z'))).toBe('2026-12-01 18:00 UTC');
    expect(utcPreview(at('2026-07-01T17:05:00Z'))).toBe('2026-07-01 17:05 UTC');
  });

  it('utcPreview: shows what vilniusTipOff saved', () => {
    const saved = unwrap(vilniusTipOff('2026-07-01T20:00'));
    expect(utcPreview(saved)).toBe('2026-07-01 17:00 UTC');
  });
});
