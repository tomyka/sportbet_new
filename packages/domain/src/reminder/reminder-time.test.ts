import { describe, expect, it } from 'vitest';
import { at } from '../testing';
import { reminderTimeOf } from './reminder-time';

/** Vilnius is UTC+3 on 2026-10-10 (summer time). */
describe('reminderTimeOf', () => {
  it('a tip-off at 12:00 is reminded at 11:00', () => {
    expect(reminderTimeOf(at('2026-10-10T09:00:00Z'))).toBe(
      at('2026-10-10T08:00:00Z'),
    );
  });

  it('a tip-off at 21:59 is reminded at 20:59', () => {
    expect(reminderTimeOf(at('2026-10-10T18:59:00Z'))).toBe(
      at('2026-10-10T17:59:00Z'),
    );
  });

  it('a tip-off at 22:00 is reminded at 21:00 that day', () => {
    expect(reminderTimeOf(at('2026-10-10T19:00:00Z'))).toBe(
      at('2026-10-10T18:00:00Z'),
    );
  });

  it('a tip-off at 23:30 is reminded at 21:00 that day', () => {
    expect(reminderTimeOf(at('2026-10-10T20:30:00Z'))).toBe(
      at('2026-10-10T18:00:00Z'),
    );
  });

  it('a tip-off at 00:30 is reminded at 21:00 the day before', () => {
    expect(reminderTimeOf(at('2026-10-09T21:30:00Z'))).toBe(
      at('2026-10-09T18:00:00Z'),
    );
  });

  it('a tip-off at 07:59 is reminded at 21:00 the day before', () => {
    expect(reminderTimeOf(at('2026-10-10T04:59:00Z'))).toBe(
      at('2026-10-09T18:00:00Z'),
    );
  });

  it("a tip-off at 08:00 is reminded at 07:00 (sportbet's code, open question 1)", () => {
    expect(reminderTimeOf(at('2026-10-10T05:00:00Z'))).toBe(
      at('2026-10-10T04:00:00Z'),
    );
  });

  describe('when the clocks go forward (2027-03-28, 03:00 becomes 04:00)', () => {
    it('02:30 is reminded at 21:00 the evening before, at winter time', () => {
      expect(reminderTimeOf(at('2027-03-28T00:30:00Z'))).toBe(
        at('2027-03-27T19:00:00Z'),
      );
    });

    it('a tip-off just after the change (04:30) is reminded at 21:00 the evening before', () => {
      expect(reminderTimeOf(at('2027-03-28T01:30:00Z'))).toBe(
        at('2027-03-27T19:00:00Z'),
      );
    });

    it('19:00 is reminded at 18:00 summer time', () => {
      expect(reminderTimeOf(at('2027-03-28T16:00:00Z'))).toBe(
        at('2027-03-28T15:00:00Z'),
      );
    });

    it('23:30 is reminded at 21:00 that day, at summer time', () => {
      expect(reminderTimeOf(at('2027-03-28T20:30:00Z'))).toBe(
        at('2027-03-28T18:00:00Z'),
      );
    });
  });

  describe('when the clocks go back (2027-10-31, 04:00 becomes 03:00)', () => {
    it('02:30 is reminded at 21:00 the evening before, at summer time', () => {
      expect(reminderTimeOf(at('2027-10-30T23:30:00Z'))).toBe(
        at('2027-10-30T18:00:00Z'),
      );
    });

    it('03:30, both times it happens, is reminded at 21:00 the evening before', () => {
      expect(reminderTimeOf(at('2027-10-31T00:30:00Z'))).toBe(
        at('2027-10-30T18:00:00Z'),
      );
      expect(reminderTimeOf(at('2027-10-31T01:30:00Z'))).toBe(
        at('2027-10-30T18:00:00Z'),
      );
    });

    it('19:00 is reminded at 18:00 winter time', () => {
      expect(reminderTimeOf(at('2027-10-31T17:00:00Z'))).toBe(
        at('2027-10-31T16:00:00Z'),
      );
    });

    it('a 00:30 tip-off the day after is reminded at 21:00 winter time of the change day', () => {
      expect(reminderTimeOf(at('2027-10-31T22:30:00Z'))).toBe(
        at('2027-10-31T19:00:00Z'),
      );
    });
  });
});
