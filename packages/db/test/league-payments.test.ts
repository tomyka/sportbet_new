// savePayments, saveDetails and loadPaymentsPage (#29, R-88, R-103, R-105): a
// private league's admin records what each member paid and where to send the
// fee; nobody else does, and a refusal writes nothing.

import {
  cents,
  type DetailsEntry,
  type League,
  type LeagueId,
  type LeagueMember,
  type PlayerId,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { savePlayers } from '../src';
import { removeLeague } from '../src/league/exit';
import { leagueExists } from '../src/league/locked';
import {
  loadPaymentsPage,
  saveDetails,
  savePayments,
} from '../src/league/payments';
import { ensurePublicLeague, saveLeagues } from '../src/league/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const CLUB = leagueNo(41);
const OTHER_CLUB = leagueNo(42);
const DAN = player('4');

const IBAN = 'LT121000011101001000';

const privateLeague = (
  id: LeagueId,
  owner: PlayerId,
  over: Partial<League> = {},
): League => ({
  id,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name: `Lyga ${String(id)}`,
  description: null,
  kind: { public: false, owner },
  fee: { base: 20, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
  ...over,
});

const member = (
  id: number,
  of: LeagueId,
  who: PlayerId,
  over: { admin?: boolean; guest?: boolean; paid?: number } = {},
): LeagueMember => ({
  id,
  league: of,
  player: who,
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

/**
 * Club (41): ADA owns and administers it, BEN is a plain member, CAI a guest
 * member. Another club (42): ADA is a plain member, BEN its admin. DAN plays
 * but is in neither. Members 701-703 are Club's, 704 and 705 the other's.
 */
beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI, DAN);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, ADA),
      members: [
        member(701, CLUB, ADA, { admin: true }),
        member(702, CLUB, BEN),
        member(703, CLUB, CAI, { guest: true }),
      ],
    },
    {
      league: privateLeague(OTHER_CLUB, BEN),
      members: [
        member(704, OTHER_CLUB, BEN, { admin: true }),
        member(705, OTHER_CLUB, ADA),
      ],
    },
  ]);
});

const paidOf = async () =>
  new Map(
    z
      .array(z.object({ id: z.int(), paid_cents: z.int().nullable() }))
      .parse(
        (
          await client.query(
            'select id, paid_cents from league_members order by id',
          )
        ).rows,
      )
      .map((row) => [row.id, row.paid_cents]),
  );

const detailsOf = async (league: number) =>
  z
    .object({
      payment_beneficiary: z.string().nullable(),
      payment_iban: z.string().nullable(),
      payment_note: z.string().nullable(),
    })
    .parse(
      (
        await client.query(
          'select payment_beneficiary, payment_iban, payment_note from leagues where id = $1',
          [league],
        )
      ).rows[0],
    );

const save = (actor: PlayerId, paid: ReturnType<typeof entry>, league = CLUB) =>
  savePayments(db, { actor, league, entry: paid });

describe('savePayments', () => {
  it('an admin records an amount and the totals answer follows the row', async () => {
    const saved = await save(ADA, entry([702, 2000]));
    expect(saved).toEqual({
      ok: true,
      value: { collected: 2000, expected: 4000, paidCount: 1, memberCount: 3 },
    });
    expect((await paidOf()).get(702)).toBe(2000);
  });

  it('an amount above the fee and one with cents are stored as cents', async () => {
    await save(ADA, entry([702, 3550], [701, 5]));
    const paid = await paidOf();
    expect(paid.get(702)).toBe(3550);
    expect(paid.get(701)).toBe(5);
  });

  it('a blank clears it', async () => {
    await save(ADA, entry([702, 2000]));
    const cleared = await save(ADA, entry([702, null]));
    expect(cleared).toEqual({
      ok: true,
      value: { collected: 0, expected: 4000, paidCount: 0, memberCount: 3 },
    });
    expect((await paidOf()).get(702)).toBeNull();
  });

  it('a bad member id writes nothing for the other posted ids either', async () => {
    expect(await save(ADA, entry([702, 2000], [705, 500]))).toEqual({
      ok: false,
      refusal: 'unknown-member',
    });
    expect(await save(ADA, entry([702, 2000], [0, 500]))).toEqual({
      ok: false,
      refusal: 'unknown-member',
    });
    expect((await paidOf()).get(702)).toBeNull();
    expect((await paidOf()).get(705)).toBeNull();
  });

  it('a plain member, an outsider and an admin of another league are refused and nothing is written', async () => {
    for (const actor of [BEN, DAN]) {
      expect(await save(actor, entry([702, 2000]))).toEqual({
        ok: false,
        refusal: 'not-an-admin',
      });
    }
    expect(await save(BEN, entry([705, 2000]), CLUB)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect([...(await paidOf()).values()].every((paid) => paid === null)).toBe(
      true,
    );
  });

  it("the public league's is_admin member is refused", async () => {
    const publicLeague = await ensurePublicLeague(db, TOURNAMENT);
    await client.query(
      'update league_members set is_admin = true where league_id = $1 and player_id = 1',
      [publicLeague],
    );
    const publicMember = z
      .object({ id: z.int() })
      .parse(
        (
          await client.query(
            'select id from league_members where league_id = $1 and player_id = 2',
            [publicLeague],
          )
        ).rows[0],
      ).id;
    expect(await save(ADA, entry([publicMember, 1000]), publicLeague)).toEqual({
      ok: false,
      refusal: 'public-league',
    });
    expect((await paidOf()).get(publicMember)).toBeNull();
  });

  it('two concurrent saves of different members both land; of one member, one of them does', async () => {
    const [a, b] = await Promise.all([
      save(ADA, entry([702, 1000])),
      save(ADA, entry([703, 2000])),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect((await paidOf()).get(702)).toBe(1000);
    expect((await paidOf()).get(703)).toBe(2000);
    await Promise.all([
      save(ADA, entry([702, 3000])),
      save(ADA, entry([702, 4000])),
    ]);
    expect([3000, 4000]).toContain((await paidOf()).get(702));
  });

  it('a league deleted meanwhile is no-such-league', async () => {
    await removeLeague(db, { actor: ADA, league: CLUB });
    expect(await save(ADA, entry([702, 2000]))).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
    expect(await save(ADA, entry([702, 2000]), leagueNo(999))).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
  });

  it('leagueExists is true for a stored league and false for a missing one', async () => {
    expect(await leagueExists(db, CLUB)).toBe(true);
    expect(await leagueExists(db, leagueNo(999))).toBe(false);
    await removeLeague(db, { actor: ADA, league: CLUB });
    expect(await leagueExists(db, CLUB)).toBe(false);
  });

  it('collected leaves a paid guest out (R-88)', async () => {
    const ruled = await save(ADA, entry([702, 2000], [703, 1500]));
    expect(ruled).toMatchObject({
      ok: true,
      value: { collected: 2000, paidCount: 2 },
    });
  });

  it('writes no points and touches no other league', async () => {
    await save(ADA, entry([702, 2000]));
    expect((await paidOf()).get(704)).toBeNull();
    expect((await paidOf()).get(705)).toBeNull();
  });
});

const DETAILS: DetailsEntry = {
  beneficiary: 'Jonas Jonaitis',
  iban: IBAN,
  note: 'Iki penktadienio',
};

describe('saveDetails', () => {
  it('stores the three columns and clears with null', async () => {
    expect(
      await saveDetails(db, { actor: ADA, league: CLUB, entry: DETAILS }),
    ).toEqual({ ok: true, value: undefined });
    expect(await detailsOf(41)).toEqual({
      payment_beneficiary: 'Jonas Jonaitis',
      payment_iban: IBAN,
      payment_note: 'Iki penktadienio',
    });
    await saveDetails(db, {
      actor: ADA,
      league: CLUB,
      entry: { beneficiary: null, iban: null, note: null },
    });
    expect(await detailsOf(41)).toEqual({
      payment_beneficiary: null,
      payment_iban: null,
      payment_note: null,
    });
  });

  it('is refused for a plain member, an outsider, and the public league, and writes nothing', async () => {
    for (const actor of [BEN, DAN]) {
      expect(
        await saveDetails(db, { actor, league: CLUB, entry: DETAILS }),
      ).toEqual({ ok: false, refusal: 'not-an-admin' });
    }
    const publicLeague = await ensurePublicLeague(db, TOURNAMENT);
    expect(
      await saveDetails(db, {
        actor: ADA,
        league: publicLeague,
        entry: DETAILS,
      }),
    ).toEqual({ ok: false, refusal: 'public-league' });
    expect(await detailsOf(41)).toEqual({
      payment_beneficiary: null,
      payment_iban: null,
      payment_note: null,
    });
  });

  it('is no-such-league for a league that is not there', async () => {
    expect(
      await saveDetails(db, {
        actor: ADA,
        league: leagueNo(999),
        entry: DETAILS,
      }),
    ).toEqual({ ok: false, refusal: 'no-such-league' });
  });

  it('does not change another league', async () => {
    await saveDetails(db, { actor: ADA, league: CLUB, entry: DETAILS });
    expect((await detailsOf(42)).payment_iban).toBeNull();
  });
});

describe('the lock timeout (saveTransaction: 5 s, then 55P03 for the web to answer 503)', () => {
  it("savePayments and saveDetails wait at most 5 s for the league's lock, then fail as lock_not_available and write nothing", async () => {
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from leagues where id = $1 for update', [
        CLUB,
      ]);
      const timedOut = { cause: { code: '55P03' } };
      await Promise.all([
        expect(save(ADA, entry([702, 1000]))).rejects.toMatchObject(timedOut),
        expect(
          saveDetails(db, { actor: ADA, league: CLUB, entry: DETAILS }),
        ).rejects.toMatchObject(timedOut),
      ]);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
    expect((await paidOf()).get(702)).toBeNull();
    expect((await detailsOf(41)).payment_iban).toBeNull();
  }, 20_000);
});

describe('loadPaymentsPage', () => {
  const load = (actor: PlayerId, league = CLUB) =>
    loadPaymentsPage(db, { actor, league });

  it('lists every member, sorted, with the meter and the owner prefilled', async () => {
    await save(ADA, entry([702, 1250]));
    const page = await load(ADA);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.rows.map((row) => row.member)).toEqual([701, 702, 703]);
    expect(page.value.rows[1]).toMatchObject({
      username: 'ben',
      paid: true,
      amountText: '12.5',
    });
    expect(page.value.rows[2]).toMatchObject({ isGuest: true });
    expect(page.value.meter).toMatchObject({
      collected: '12.50',
      expected: '40.00',
      paidCount: 1,
      memberCount: 3,
    });
    expect(page.value.details.beneficiary).toBe('ada');
  });

  it('is refused for the public league and for a plain member', async () => {
    const publicLeague = await ensurePublicLeague(db, TOURNAMENT);
    expect(await load(ADA, publicLeague)).toEqual({
      ok: false,
      refusal: 'public-league',
    });
    expect(await load(BEN)).toEqual({ ok: false, refusal: 'not-an-admin' });
    expect(await load(DAN)).toEqual({ ok: false, refusal: 'not-an-admin' });
    expect(await load(ADA, leagueNo(999))).toEqual({
      ok: false,
      refusal: 'no-such-league',
    });
  });

  it("a migrated row's paid cents and IBAN read back (R-103)", async () => {
    await saveLeagues(db, TOURNAMENT, [
      {
        league: privateLeague(CLUB, ADA, {
          payment: { beneficiary: 'Tomas', iban: IBAN, note: 'Pastaba' },
        }),
        members: [
          member(701, CLUB, ADA, { admin: true, paid: 2000 }),
          member(702, CLUB, BEN, { paid: 1255 }),
        ],
      },
    ]);
    const page = await load(ADA);
    if (!page.ok) throw new Error('expected the page');
    expect(page.value.details).toEqual({
      beneficiary: 'Tomas',
      iban: 'LT12 1000 0111 0100 1000',
      note: 'Pastaba',
    });
    expect(page.value.rows.map((row) => row.amountText)).toEqual([
      '20',
      '12.55',
      '',
    ]);
  });
});
