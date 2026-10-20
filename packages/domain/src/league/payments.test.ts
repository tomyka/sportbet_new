import { describe, expect, it } from 'vitest';
import { leagueNo, player, tournamentKey, unwrap } from '../testing';
import { cents, type League, type LeagueMember } from './league';
import {
  accountFullName,
  mayManagePayments,
  paymentTotals,
  paymentsMeter,
  paymentsPage,
  recordPayments,
  type PaymentsMember,
} from './payments';

const league = (
  over: {
    public?: boolean;
    base?: number | null;
    beneficiary?: string | null;
    iban?: string | null;
    note?: string | null;
  } = {},
): League => ({
  id: leagueNo(1),
  tournament: tournamentKey('7'),
  name: 'Draugai',
  description: null,
  kind:
    over.public === true
      ? { public: true }
      : { public: false, owner: player('1') },
  fee: {
    base: over.base === undefined ? 20 : over.base,
    penaltyStep: null,
    reward: null,
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
  over: {
    admin?: boolean;
    guest?: boolean;
    paid?: number;
    league?: number;
  } = {},
): LeagueMember => ({
  id,
  league: leagueNo(over.league ?? 1),
  player: player(String(id)),
  isAdmin: over.admin ?? false,
  isGuest: over.guest ?? false,
  paid: over.paid === undefined ? null : unwrap(cents(over.paid)),
  joinedAt: null,
});

const entry = (...pairs: readonly (readonly [number, number | null])[]) =>
  new Map(
    pairs.map(([id, amount]) => [
      id,
      amount === null ? null : unwrap(cents(amount)),
    ]),
  );

const ADMIN = member(1, { admin: true });

describe('mayManagePayments', () => {
  it('lets an admin of a private league', () => {
    expect(mayManagePayments({ league: league(), actorMember: ADMIN }).ok).toBe(
      true,
    );
  });

  it('refuses the public league even for an is_admin member', () => {
    expect(
      mayManagePayments({
        league: league({ public: true }),
        actorMember: ADMIN,
      }),
    ).toEqual({ ok: false, refusal: 'public-league' });
  });

  it('refuses a plain member, an outsider and an admin of another league', () => {
    for (const actorMember of [
      member(2),
      null,
      member(3, { admin: true, league: 2 }),
    ]) {
      expect(mayManagePayments({ league: league(), actorMember })).toEqual({
        ok: false,
        refusal: 'not-an-admin',
      });
    }
  });
});

describe('mayManagePayments for a superadmin (the admin door)', () => {
  it('lets a superadmin in with no membership, the public league included', () => {
    for (const over of [{}, { public: true }]) {
      expect(
        mayManagePayments({
          league: league(over),
          actorMember: null,
          superadmin: true,
        }).ok,
      ).toBe(true);
    }
  });

  it('does not let a flag of false change the rules', () => {
    expect(
      mayManagePayments({
        league: league({ public: true }),
        actorMember: ADMIN,
        superadmin: false,
      }),
    ).toEqual({ ok: false, refusal: 'public-league' });
  });

  it('still refuses a posted id that is no member of this league', () => {
    expect(
      recordPayments({
        league: league({ public: true }),
        actorMember: null,
        superadmin: true,
        members: [member(2)],
        entry: entry([9, 2000]),
      }),
    ).toEqual({ ok: false, refusal: 'unknown-member' });
  });

  it('records for the public league', () => {
    const decided = recordPayments({
      league: league({ public: true }),
      actorMember: null,
      superadmin: true,
      members: [member(2)],
      entry: entry([2, 2000]),
    });
    expect(decided.ok).toBe(true);
  });
});

describe('recordPayments', () => {
  const members = [ADMIN, member(2), member(3, { guest: true })];

  it('refuses the public league even for an is_admin member', () => {
    expect(
      recordPayments({
        league: league({ public: true }),
        actorMember: ADMIN,
        members,
        entry: entry([2, 2000]),
      }),
    ).toEqual({ ok: false, refusal: 'public-league' });
  });

  it('refuses a plain member', () => {
    expect(
      recordPayments({
        league: league(),
        actorMember: member(2),
        members,
        entry: entry([2, 2000]),
      }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
  });

  it("refuses another league's member id and writes nothing", () => {
    const foreign = member(9, { league: 2 });
    expect(
      recordPayments({
        league: league(),
        actorMember: ADMIN,
        members: [...members, foreign],
        entry: entry([2, 2000], [9, 500]),
      }),
    ).toEqual({ ok: false, refusal: 'unknown-member' });
  });

  it('refuses an id of no member, such as 0', () => {
    expect(
      recordPayments({
        league: league(),
        actorMember: ADMIN,
        members,
        entry: entry([0, 500]),
      }),
    ).toEqual({ ok: false, refusal: 'unknown-member' });
  });

  it('authority is judged before the ids', () => {
    expect(
      recordPayments({
        league: league(),
        actorMember: member(2),
        members,
        entry: entry([77, 500]),
      }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
  });

  it('an admin records an amount above the fee and clears with blank', () => {
    const result = recordPayments({
      league: league(),
      actorMember: ADMIN,
      members,
      entry: entry([3, null], [2, 3550]),
    });
    expect(result).toEqual({
      ok: true,
      value: [
        { member: 2, paid: 3550 },
        { member: 3, paid: null },
      ],
    });
  });
});

describe('paymentTotals and paymentsMeter', () => {
  const members = [
    member(1, { paid: 2000 }),
    member(2, { guest: true, paid: 500 }),
    member(3),
  ];

  it('counts every member with an amount, out of all, and the pots under R-88', () => {
    expect(paymentTotals({ league: league(), members })).toEqual({
      collected: 2000,
      expected: 4000,
      paidCount: 2,
      memberCount: 3,
    });
  });

  it('draws one format: 1,234.50 and the bar, without a bar or an "iš" when there is no fee', () => {
    const totals = {
      collected: 123_450,
      expected: 246_900,
      paidCount: 4,
      memberCount: 9,
    };
    expect(paymentsMeter(totals, true)).toEqual({
      collected: '1,234.50',
      expected: '2,469.00',
      paidCount: 4,
      memberCount: 9,
      percent: 50,
    });
    expect(paymentsMeter({ ...totals, expected: 0 }, false)).toMatchObject({
      collected: '1,234.50',
      expected: null,
      percent: null,
    });
  });
});

describe('paymentsPage', () => {
  const account = (
    id: number,
    name: string,
    surname: string,
    over: Parameters<typeof member>[1] = {},
  ): PaymentsMember => ({
    member: member(id, over),
    person: { name, surname, username: `u${String(id)}` },
  });

  const page = (
    members: readonly PaymentsMember[],
    over: Partial<Parameters<typeof paymentsPage>[0]> = {},
  ) =>
    paymentsPage({
      league: league(),
      members,
      ownerName: null,
      ...over,
    });

  it('sorts by lower-cased full name by code point (Š after z), ties by id', () => {
    const rows = page([
      account(1, 'Šarūnas', 'A'),
      account(2, 'zigmas', 'B'),
      account(3, 'Ada', 'C'),
      account(5, 'ada', 'c'),
      account(4, 'Ada', 'C'),
    ]).rows;
    expect(rows.map((row) => row.member)).toEqual([3, 4, 5, 2, 1]);
  });

  it('a member with no account sorts first as empty', () => {
    const orphan: PaymentsMember = { member: member(9), person: null };
    const rows = page([account(1, 'Ada', 'C'), orphan]).rows;
    expect(rows.map((row) => row.member)).toEqual([9, 1]);
    expect(rows[0]).toMatchObject({ display: '', username: '' });
  });

  it('names a row: the trimmed full name, the username, the guest tag, the amount box', () => {
    const rows = page([
      account(1, 'Ada', '', { paid: 1250 }),
      account(2, 'Ben', 'Z', { guest: true }),
    ]).rows;
    expect(rows).toEqual([
      {
        member: 1,
        display: 'Ada',
        username: 'u1',
        isGuest: false,
        paid: true,
        amountText: '12.5',
      },
      {
        member: 2,
        display: 'Ben Z',
        username: 'u2',
        isGuest: true,
        paid: false,
        amountText: '',
      },
    ]);
  });

  it('meter: collected is the sum recorded, not fee times members', () => {
    expect(
      page([account(1, 'A', 'A', { paid: 750 }), account(2, 'B', 'B')]).meter,
    ).toMatchObject({ collected: '7.50', expected: '40.00', paidCount: 1 });
  });

  it('meter: a paid guest is not in collected', () => {
    const members = [
      account(1, 'A', 'A', { paid: 2000 }),
      account(2, 'B', 'B', { guest: true, paid: 2000 }),
    ];
    expect(page(members).meter.collected).toBe('20.00');
  });

  it('has no fee: no hasFee, no bar', () => {
    const result = page([account(1, 'A', 'A')], {
      league: league({ base: null }),
    });
    expect(result.hasFee).toBe(false);
    expect(result.meter).toMatchObject({ expected: null, percent: null });
  });

  it("the beneficiary box offers the owner's full name only when nothing is stored", () => {
    expect(page([], { ownerName: 'Jonas Jonaitis' }).details.beneficiary).toBe(
      'Jonas Jonaitis',
    );
    expect(
      page([], {
        ownerName: 'Jonas Jonaitis',
        league: league({ beneficiary: 'Petras' }),
      }).details.beneficiary,
    ).toBe('Petras');
  });

  it('an ownerless league offers none', () => {
    expect(page([], { ownerName: null }).details.beneficiary).toBe('');
  });

  it('shows the stored IBAN grouped and the note', () => {
    expect(
      page([], {
        league: league({ iban: 'LT121000011101001000', note: 'iki 5 d.' }),
      }).details,
    ).toMatchObject({ iban: 'LT12 1000 0111 0100 1000', note: 'iki 5 d.' });
    expect(page([]).details).toMatchObject({ iban: '', note: '' });
  });

  it('names the league', () => {
    expect(page([]).league).toEqual({ id: leagueNo(1), name: 'Draugai' });
  });
});

describe('accountFullName', () => {
  it('trims each part, then joins and trims', () => {
    expect(accountFullName({ name: ' Ada ', surname: '' })).toBe('Ada');
    expect(accountFullName({ name: 'Ada', surname: ' Lovelace ' })).toBe(
      'Ada Lovelace',
    );
  });
});
