// loadDashboardLeague (#29, R-104, R-122, R-124): the fee panel and the active
// messages of the viewer's selected league.

import {
  cents,
  ruledRules,
  sportbetRules,
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
import { savePlayers } from '../src';
import { loadDashboardLeague } from '../src/league/dashboard';
import {
  ensurePublicLeague,
  saveLeagues,
  saveMessages,
} from '../src/league/repository';
import { selectLeague } from '../src/league/select';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, CAI, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const CLUB = leagueNo(41);
const FRIENDS = leagueNo(42);
const ADMIN = player('9');
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
  fee: { base: 20, penaltyStep: null, reward: 'Pyragas' },
  payment: { beneficiary: 'Jonas', iban: IBAN, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
  ...over,
});

const member = (
  id: number,
  of: LeagueId,
  who: PlayerId,
  over: { guest?: boolean; paid?: number } = {},
): LeagueMember => ({
  id,
  league: of,
  player: who,
  isAdmin: false,
  isGuest: over.guest ?? false,
  paid: over.paid === undefined ? null : unwrap(cents(over.paid)),
  joinedAt: null,
});

/**
 * Club (41, fee 20): ADA and BEN full members, CAI a guest who paid 15.
 * Friends (42, no fee): ADA and BEN. ADMIN plays no part in the tournament.
 */
beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(ADMIN, 'admin')]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: privateLeague(CLUB, ADA),
      members: [
        member(701, CLUB, ADA),
        member(702, CLUB, BEN, { paid: 2000 }),
        member(703, CLUB, CAI, { guest: true, paid: 1500 }),
      ],
    },
    {
      league: privateLeague(FRIENDS, ADA, {
        fee: { base: null, penaltyStep: null, reward: null },
      }),
      members: [member(704, FRIENDS, ADA), member(705, FRIENDS, BEN)],
    },
  ]);
  await saveMessages(db, [
    { id: 3, league: CLUB, text: 'Trečias', active: true },
    { id: 1, league: CLUB, text: 'Pirmas', active: true },
    { id: 2, league: CLUB, text: 'Išjungtas', active: false },
    { id: 4, league: FRIENDS, text: 'Kita lyga', active: true },
    { id: 5, league: null, text: 'Atsieta', active: true },
  ]);
  await selectLeague(db, { player: ADA, league: CLUB });
  await selectLeague(db, { player: BEN, league: CLUB });
  await selectLeague(db, { player: CAI, league: CLUB });
});

const load = (who: PlayerId, rules = ruledRules) =>
  loadDashboardLeague(db, { player: who, tournament: TOURNAMENT, rules });

describe('loadDashboardLeague', () => {
  it('a member of a league with a fee gets the panel and its messages', async () => {
    const view = await load(ADA);
    expect(view.panel).toEqual({
      money: {
        state: 'due',
        feeText: '20,00',
        counts: { players: 2, expected: '40.00', collected: '20.00' },
        popup: {
          amount: '20,00',
          payment: {
            beneficiary: 'Jonas',
            iban: 'LT12 1000 0111 0100 1000',
            reference: 'Jaunimo linijai',
            note: null,
          },
        },
      },
      reward: 'Pyragas',
    });
    expect(view.messages).toEqual(['Pirmas', 'Trečias']);
  });

  it('a member who has paid gets the paid line and no pop-up', async () => {
    const view = await load(BEN);
    expect(view.panel?.money).toMatchObject({ state: 'paid', popup: null });
  });

  it('the panel follows the selected league, not another membership', async () => {
    await selectLeague(db, { player: ADA, league: FRIENDS });
    const view = await load(ADA);
    expect(view.panel).toBeNull();
    expect(view.messages).toEqual(['Kita lyga']);
  });

  it('an inactive or detached message is not listed', async () => {
    const view = await load(ADA);
    expect(view.messages).not.toContain('Išjungtas');
    expect(view.messages).not.toContain('Atsieta');
  });

  it('messages come in id order', async () => {
    expect((await load(BEN)).messages).toEqual(['Pirmas', 'Trečias']);
  });

  it('no fee: no panel, but the league still lists its messages (R-122)', async () => {
    await selectLeague(db, { player: BEN, league: FRIENDS });
    const view = await load(BEN);
    expect(view.panel).toBeNull();
    expect(view.messages).toEqual(['Kita lyga']);
  });

  it('R-124: a guest under ruledRules gets only the reward and the messages; under sportbetRules the money', async () => {
    const ruled = await load(CAI);
    expect(ruled.panel).toEqual({ money: null, reward: 'Pyragas' });
    expect(ruled.messages).toEqual(['Pirmas', 'Trečias']);
    const sportbet = await load(CAI, sportbetRules);
    expect(sportbet.panel?.money).toMatchObject({
      state: 'paid',
      counts: { players: 2, expected: '40.00', collected: '35.00' },
    });
  });

  it('a viewer who plays no part gets the public league at full level: no panel, its messages', async () => {
    await saveMessages(db, [
      {
        id: 6,
        league: await ensurePublicLeague(db, TOURNAMENT),
        text: 'Visiems',
        active: true,
      },
    ]);
    const view = await load(ADMIN);
    expect(view.panel).toBeNull();
    expect(view.messages).toEqual(['Visiems']);
  });
});
