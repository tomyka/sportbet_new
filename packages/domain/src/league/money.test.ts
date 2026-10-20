import { describe, expect, it } from 'vitest';
import { playerId } from '../shared/ids';
import { tournamentKey, unwrap } from '../testing';
import { cents, leagueId, type League, type LeagueMember } from './league';
import {
  amountInputText,
  barPercent,
  formatFee,
  formatPlain,
  formatPot,
  leagueHasFee,
  pots,
} from './money';

const member = (
  id: number,
  over: { guest?: boolean; paid?: number } = {},
): LeagueMember => ({
  id,
  league: unwrap(leagueId(1)),
  player: unwrap(playerId(`p${String(id)}`)),
  isAdmin: false,
  isGuest: over.guest ?? false,
  paid: over.paid === undefined ? null : unwrap(cents(over.paid)),
  joinedAt: null,
});

describe('leagueHasFee', () => {
  const leagueWith = (base: number | null): League => ({
    id: unwrap(leagueId(1)),
    tournament: tournamentKey('7'),
    name: 'Lyga',
    description: null,
    kind: { public: false, owner: null },
    fee: { base, penaltyStep: null, reward: null },
    payment: { beneficiary: null, iban: null, note: null },
    createdAt: null,
  });

  it('is true for a fee above 0 only', () => {
    expect(leagueHasFee(leagueWith(20))).toBe(true);
    expect(leagueHasFee(leagueWith(0))).toBe(false);
    expect(leagueHasFee(leagueWith(null))).toBe(false);
  });
});

describe('money formats', () => {
  it('formatFee 1234 is "1 234,00" and 20 is "20,00"', () => {
    expect(formatFee(1234)).toBe('1 234,00');
    expect(formatFee(20)).toBe('20,00');
    expect(formatFee(0)).toBe('0,00');
    expect(formatFee(2_147_483_647)).toBe('2 147 483 647,00');
  });

  it('formatPot 123450 is "1,234.50" and 0 is "0.00"', () => {
    expect(formatPot(123_450)).toBe('1,234.50');
    expect(formatPot(0)).toBe('0.00');
    expect(formatPot(5)).toBe('0.05');
    expect(formatPot(100_000_000)).toBe('1,000,000.00');
    expect(formatPot(99_900)).toBe('999.00');
  });

  it('formatPlain 123450 is "1234.50"', () => {
    expect(formatPlain(123_450)).toBe('1234.50');
    expect(formatPlain(2000)).toBe('20.00');
  });

  it('refuses a sum that is no amount of cents', () => {
    expect(() => formatPot(-1)).toThrow();
    expect(() => formatPot(1.5)).toThrow();
  });
});

describe('barPercent', () => {
  it('rounds half up: 1 of 8 is 13, 1 of 3 is 33, 2 of 3 is 67', () => {
    expect(barPercent(100, 800)).toBe(13);
    expect(barPercent(100, 300)).toBe(33);
    expect(barPercent(200, 300)).toBe(67);
  });

  it('caps at 100 and is 0 when nothing is expected', () => {
    expect(barPercent(500, 200)).toBe(100);
    expect(barPercent(500, 0)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(0, 4000)).toBe(0);
  });

  it("follows PHP's doubles at a tie: 14.5 reached as 14.499999999999998 stays 14", () => {
    expect(barPercent(2900, 20_000)).toBe(14);
    expect(barPercent(1250, 10_000)).toBe(13);
  });
});

describe('amount text', () => {
  it('amountInputText 2000 is "20", 1250 is "12.5", 1255 is "12.55", null is ""', () => {
    expect(amountInputText(unwrap(cents(2000)))).toBe('20');
    expect(amountInputText(unwrap(cents(1250)))).toBe('12.5');
    expect(amountInputText(unwrap(cents(1255)))).toBe('12.55');
    expect(amountInputText(unwrap(cents(5)))).toBe('0.05');
    expect(amountInputText(unwrap(cents(0)))).toBe('0');
    expect(amountInputText(null)).toBe('');
  });
});

describe('pots', () => {
  const members = [
    member(1, { paid: 2000 }),
    member(2, { paid: 1000 }),
    member(3, { guest: true, paid: 2000 }),
    member(4),
  ];

  it('R-88: a paid guest is not collected, and expected leaves guests out too', () => {
    expect(pots({ baseFee: 20, members })).toEqual({
      expected: 6000,
      collected: 3000,
    });
  });

  it('with no fee has expected 0', () => {
    expect(pots({ baseFee: null, members }).expected).toBe(0);
    expect(pots({ baseFee: 0, members }).expected).toBe(0);
  });

  it('collected is what was recorded, not fee times members', () => {
    expect(
      pots({
        baseFee: 20,
        members: [member(1, { paid: 750 })],
      }).collected,
    ).toBe(750);
  });
});
