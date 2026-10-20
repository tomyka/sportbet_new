// searchPlayers (#29, R-88, R-120): how a league admin finds a player to
// invite - case- and accent-insensitive, by name, surname or username only.

import {
  type League,
  type LeagueMember,
  type PlayerId,
  type StoredPlayer,
} from '@sportbet/domain';
import {
  at,
  leagueNo,
  player,
  testPlayer,
  tournamentKey,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers } from '../src';
import { isLeagueAdmin, searchPlayers } from '../src/league/search';
import { saveInvites, saveLeagues } from '../src/league/repository';
import { useTestDatabase } from '../src/testing';
import { ADA, BEN, savePlaying, saveWorld, TOURNAMENT } from './world';

const { db } = useTestDatabase();

const CLUB = leagueNo(42);
const OTHER_CLUB = leagueNo(43);

const club: League = {
  id: CLUB,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name: 'Klubas',
  description: null,
  kind: { public: false, owner: ADA },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-02T10:00:00Z'),
};

const member = (
  id: number,
  who: PlayerId,
  isAdmin: boolean,
  of = CLUB,
): LeagueMember => ({
  id,
  league: of,
  player: who,
  isAdmin,
  isGuest: false,
  paid: null,
  joinedAt: null,
});

const person = (
  id: string,
  username: string,
  name: string,
  surname = '',
): StoredPlayer => ({ ...testPlayer(player(id), username), name, surname });

const SARUNAS = player('11');
const ANGELE = player('12');
const JONAS = player('13');

/** ADA is the club's admin owner; BEN is a plain member; the rest are in the tournament, not the club. */
beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [
    person('11', 'sk', 'Šarūnas', 'Kazlauskas'),
    person('12', 'angele7', 'Angelė', 'Žukauskaitė'),
    person('13', 'jonas', 'Jonas', 'Jonaitis'),
  ]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, SARUNAS, ANGELE);
  await saveLeagues(db, TOURNAMENT, [
    {
      league: club,
      members: [member(701, ADA, true), member(702, BEN, false)],
    },
    {
      league: { ...club, id: OTHER_CLUB, name: 'Kitas klubas' },
      members: [member(703, ADA, true, OTHER_CLUB)],
    },
  ]);
});

const search = (query: string, actor = ADA) =>
  searchPlayers(db, { league: CLUB, actor, query });

const idsOf = async (query: string) => {
  const found = await search(query);
  if (!found.ok) throw new Error(`refused: ${found.refusal}`);
  return found.value.map(({ id }) => id);
};

describe('searchPlayers', () => {
  it.each(['sarunas', 'SARU', 'šaRŪ', 'Šarūnas', 'kazlauskas'])(
    'finds Šarūnas by %s',
    async (query) => {
      expect(await idsOf(query)).toEqual([SARUNAS]);
    },
  );

  it('answers the id, username, name and surname and nothing else', async () => {
    expect(await search('sarunas')).toEqual({
      ok: true,
      value: [
        {
          id: SARUNAS,
          username: 'sk',
          name: 'Šarūnas',
          surname: 'Kazlauskas',
        },
      ],
    });
  });

  it('matches the username, the name or the surname', async () => {
    expect(await idsOf('angele7')).toEqual([ANGELE]);
    expect(await idsOf('zukausk')).toEqual([ANGELE]);
    expect(await idsOf('ngel')).toEqual([ANGELE]);
  });

  it('does not match "name surname" across the two', async () => {
    expect(await idsOf('sarunas kazlauskas')).toEqual([]);
    expect(await idsOf('as k')).toEqual([]);
  });

  it('leaves out members and pending invitees', async () => {
    await saveInvites(db, [
      {
        id: 1,
        league: CLUB,
        invitee: SARUNAS,
        invitedBy: ADA,
        createdAt: null,
      },
    ]);
    expect(await idsOf('sarunas')).toEqual([]);
    expect(await idsOf('ben')).toEqual([]);
    expect(await idsOf('angele')).toEqual([ANGELE]);
  });

  it('caps at 10, ordered by id', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      person(String(100 + index), `many${String(index)}`, 'Daug'),
    );
    await savePlayers(db, many);
    await savePlaying(db, TOURNAMENT, ...many.map(({ id }) => id));
    const found = await idsOf('daug');
    expect(found).toEqual(
      Array.from({ length: 10 }, (_, index) => player(String(100 + index))),
    );
  });

  it('refuses a member who is not an admin, a stranger and an unknown league', async () => {
    expect(await search('sarunas', BEN)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect(await search('sarunas', JONAS)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
    expect(
      await searchPlayers(db, {
        league: leagueNo(999),
        actor: ADA,
        query: 'sarunas',
      }),
    ).toEqual({ ok: false, refusal: 'not-an-admin' });
  });

  it('checks the admin before the length', async () => {
    expect(await search('s', BEN)).toEqual({
      ok: false,
      refusal: 'not-an-admin',
    });
  });

  it('answers none for a query of one character (R-120)', async () => {
    expect(await idsOf('s')).toEqual([]);
    expect(await idsOf('')).toEqual([]);
  });

  it('counts characters, not bytes: a Lithuanian letter alone is one (R-120)', async () => {
    expect(await idsOf('š')).toEqual([]);
    expect(await idsOf('ša')).toEqual([SARUNAS]);
  });

  it('answers none for a query that folds to nothing', async () => {
    expect(await idsOf('́́')).toEqual([]);
  });

  it('matches % and _ literally, not as wildcards (R-120)', async () => {
    await savePlayers(db, [person('20', 'underscore', 'Under_score')]);
    await savePlaying(db, TOURNAMENT, player('20'));
    expect(await idsOf('%%')).toEqual([]);
    expect(await idsOf('j%s')).toEqual([]);
    expect(await idsOf('r_s')).toEqual([player('20')]);
  });

  it('finds only players of the tournament, not every account (R-88)', async () => {
    expect(await idsOf('jonas')).toEqual([]);
    expect(await idsOf('sarunas')).toEqual([SARUNAS]);
  });

  it('an address never matches', async () => {
    await savePlayers(db, [
      {
        ...person('30', 'quiet', 'Tylus'),
        email: testPlayer(player('30'), 'hidden.mail').email,
      },
    ]);
    await savePlaying(db, TOURNAMENT, player('30'));
    expect(await idsOf('hidden')).toEqual([]);
    expect(await idsOf('example')).toEqual([]);
    expect(await idsOf('tylus')).toEqual([player('30')]);
  });
});

describe('isLeagueAdmin', () => {
  it('is true only for an admin member of that league', async () => {
    const check = (actor: PlayerId, league = CLUB) =>
      isLeagueAdmin(db, { actor, league });
    expect(await check(ADA)).toBe(true);
    expect(await check(BEN)).toBe(false);
    expect(await check(JONAS)).toBe(false);
    expect(await check(ADA, leagueNo(999))).toBe(false);
  });
});
