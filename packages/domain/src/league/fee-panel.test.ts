import { describe, expect, it } from 'vitest';
import { leagueNo, player, tournamentKey, unwrap } from '../testing';
import {
  feePanel,
  feePayment,
  PAYMENT_REFERENCE,
  type FeePanel,
} from './fee-panel';
import { cents, type League, type LeagueMember } from './league';

const IBAN = 'LT121000011101001000';

const league = (
  over: {
    base?: number | null;
    reward?: string | null;
    beneficiary?: string | null;
    iban?: string | null;
    note?: string | null;
  } = {},
): League => ({
  id: leagueNo(1),
  tournament: tournamentKey('7'),
  name: 'Draugai',
  description: null,
  kind: { public: false, owner: player('1') },
  fee: {
    base: over.base === undefined ? 20 : over.base,
    penaltyStep: null,
    reward: over.reward === undefined ? 'Pyragas' : over.reward,
  },
  payment: {
    beneficiary: over.beneficiary ?? null,
    iban: over.iban ?? null,
    note: over.note ?? null,
  },
  createdAt: null,
});

const member = (
  id: number,
  over: { guest?: boolean; paid?: number } = {},
): LeagueMember => ({
  id,
  league: leagueNo(1),
  player: player(String(id)),
  isAdmin: false,
  isGuest: over.guest ?? false,
  paid: over.paid === undefined ? null : unwrap(cents(over.paid)),
  joinedAt: null,
});

const DETAILS = { beneficiary: 'Jonas Jonaitis', iban: IBAN, note: null };

const panel = (
  viewer: LeagueMember,
  over: Parameters<typeof league>[0] = {},
  others: readonly LeagueMember[] = [],
): FeePanel | null =>
  feePanel({
    league: league(over),
    viewer,
    members: [viewer, ...others],
  });

const moneyOf = (result: FeePanel | null) => {
  if (result?.money === null || result === null) {
    throw new Error('expected a money block');
  }
  return result.money;
};

describe('feePanel', () => {
  it('no fee: no panel', () => {
    expect(panel(member(1), { base: null })).toBeNull();
    expect(panel(member(1), { base: 0 })).toBeNull();
  });

  it('an unpaid member sees the due line and the pop-up', () => {
    const money = moneyOf(panel(member(1), DETAILS));
    expect(money.state).toBe('due');
    expect(money.feeText).toBe('20,00');
    expect(money.popup).toEqual({
      amount: '20,00',
      payment: {
        beneficiary: 'Jonas Jonaitis',
        iban: 'LT12 1000 0111 0100 1000',
        reference: 'Jaunimo linijai',
        note: null,
      },
    });
  });

  it('a paid member sees the paid line and no pop-up, no account number in the view', () => {
    const result = panel(member(1, { paid: 2000 }), DETAILS);
    expect(moneyOf(result).state).toBe('paid');
    expect(moneyOf(result).popup).toBeNull();
    expect(JSON.stringify(result)).not.toContain('LT12');
    expect(JSON.stringify(result)).not.toContain('Jonaitis');
  });

  it('an amount of 0 recorded is a payment: the paid line', () => {
    expect(moneyOf(panel(member(1, { paid: 0 }))).state).toBe('paid');
  });

  it('an unpaid member of a league with no details gets the "administratorius dar nenurodė" pop-up', () => {
    expect(moneyOf(panel(member(1))).popup).toEqual({
      amount: '20,00',
      payment: null,
    });
  });

  it('beneficiary and IBAN are both required for the rows', () => {
    expect(
      moneyOf(panel(member(1), { beneficiary: 'Jonas' })).popup?.payment,
    ).toBeNull();
    expect(moneyOf(panel(member(1), { iban: IBAN })).popup?.payment).toBeNull();
    expect(
      moneyOf(panel(member(1), { beneficiary: '  ', iban: IBAN })).popup
        ?.payment,
    ).toBeNull();
  });

  it('counts: players are full members; pots follow pots()', () => {
    const money = moneyOf(
      panel(member(1, { paid: 2000 }), {}, [
        member(2),
        member(3, { guest: true, paid: 500 }),
      ]),
    );
    expect(money.counts.players).toBe(2);
    expect(money.counts.expected).toBe('40.00');
    expect(money.counts.collected).toBe('20.00');
  });

  it('prints the pots in one format with a thousands comma, the fee with a space', () => {
    const many = Array.from({ length: 70 }, (_, at) => member(at + 2));
    const money = moneyOf(panel(member(1), { base: 20 }, many));
    expect(money.counts.expected).toBe('1,420.00');
    expect(moneyOf(panel(member(1), { base: 1234 })).feeText).toBe('1 234,00');
  });

  it('the reward is the league text, null when blank', () => {
    expect(panel(member(1))?.reward).toBe('Pyragas');
    expect(panel(member(1), { reward: '' })?.reward).toBeNull();
    expect(panel(member(1), { reward: null })?.reward).toBeNull();
  });
});

describe('feePanel and guests (R-104, R-124)', () => {
  it('a guest sees no money at all, only the reward', () => {
    expect(panel(member(1, { guest: true }), DETAILS)).toEqual({
      money: null,
      reward: 'Pyragas',
    });
  });

  it('a paid guest sees no paid line either, even with a payment recorded', () => {
    expect(panel(member(1, { guest: true, paid: 2000 }), DETAILS)).toEqual({
      money: null,
      reward: 'Pyragas',
    });
  });

  it('a guest sees no counts, no pots, no pop-up', () => {
    const result = panel(member(1, { guest: true }), DETAILS, [member(2)]);
    expect(JSON.stringify(result)).not.toMatch(/popup|counts|due|paid/u);
  });

  it('a full member still sees the money', () => {
    expect(moneyOf(panel(member(1))).state).toBe('due');
  });

  it('a guest of a league with no fee has no panel', () => {
    expect(panel(member(1, { guest: true }), { base: null })).toBeNull();
  });
});

describe('feePayment', () => {
  it('is null without both details', () => {
    expect(feePayment(league())).toBeNull();
  });

  it('shows the note only when it is not blank', () => {
    expect(
      feePayment(league({ ...DETAILS, note: ' Mokėti iki penktadienio. ' }))
        ?.note,
    ).toBe('Mokėti iki penktadienio.');
    expect(feePayment(league({ ...DETAILS, note: '   ' }))?.note).toBeNull();
  });

  it('carries the one fixed reference', () => {
    expect(PAYMENT_REFERENCE).toBe('Jaunimo linijai');
    expect(feePayment(league(DETAILS))?.reference).toBe(PAYMENT_REFERENCE);
  });
});
