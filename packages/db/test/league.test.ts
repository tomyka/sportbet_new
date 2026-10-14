// Leagues as stored (#29): the public league every writer finds or creates,
// sportbet's ids kept by the reader's savers, the switcher's list and the
// invite badge.

import { cents, type League, type LeagueMember } from '@sportbet/domain';
import { at, leagueNo, tournamentKey, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { advanceIdentitySequences } from '../src';
import {
  countPendingInvites,
  listLeagues,
  loadPlayerLeagues,
} from '../src/league/list';
import {
  ensurePublicLeague,
  saveInvites,
  saveLeagues,
  saveLeagueSelections,
  saveMessages,
} from '../src/league/repository';
import { saveTournamentPlayers } from '../src/player/repository';
import { useTestDatabase } from '../src/testing';
import { saveTournament } from '../src/tournament/repository';
import {
  ADA,
  BEN,
  CAI,
  OTHER,
  saveWorld,
  savePlaying,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const FRIENDS = leagueNo(41);
const PUBLIC_ID = leagueNo(40);

const publicLeague: League = {
  id: PUBLIC_ID,
  tournament: tournamentKey(String(TOURNAMENT.id)),
  name: TOURNAMENT.name,
  description: null,
  kind: { public: true },
  fee: { base: null, penaltyStep: null, reward: null },
  payment: { beneficiary: null, iban: null, note: null },
  createdAt: at('2026-09-01T10:00:00Z'),
};
const friends: League = {
  ...publicLeague,
  id: FRIENDS,
  name: 'Draugų lyga',
  description: 'Kas pirmas',
  kind: { public: false, owner: ADA },
  fee: { base: 10, penaltyStep: 2, reward: 'Pyragas' },
  payment: {
    beneficiary: 'Jonas Jonaitis',
    iban: 'LT121000011101001000',
    note: 'Vardas ir pavardė',
  },
  createdAt: at('2026-09-02T10:00:00Z'),
};

const member = (
  id: number,
  league: League,
  who: typeof ADA,
  options: Partial<LeagueMember> = {},
): LeagueMember => ({
  id,
  league: league.id,
  player: who,
  isAdmin: false,
  isGuest: false,
  paid: null,
  joinedAt: at('2026-09-03T10:00:00Z'),
  ...options,
});

const rows = z.array(z.record(z.string(), z.unknown()));

describe('ensurePublicLeague', () => {
  it('creates the public league, named after the tournament, once', async () => {
    await saveWorld(db);
    const first = await ensurePublicLeague(db, TOURNAMENT);
    const second = await ensurePublicLeague(db, TOURNAMENT);
    expect(second).toBe(first);
    expect(
      rows.parse(
        (
          await client.query(
            'select name, is_public, owner_id from leagues where tournament_id = $1',
            [TOURNAMENT.id],
          )
        ).rows,
      ),
    ).toEqual([{ name: TOURNAMENT.name, is_public: true, owner_id: null }]);
  });

  it('finds the public league a reader saved under sportbet id', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [{ league: publicLeague, members: [] }]);
    expect(await ensurePublicLeague(db, TOURNAMENT)).toBe(PUBLIC_ID);
    expect(
      rows.parse((await client.query('select id from leagues')).rows),
    ).toEqual([{ id: 40 }]);
  });

  it('keeps one public league per tournament', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    const one = await ensurePublicLeague(db, TOURNAMENT);
    const other = await ensurePublicLeague(db, OTHER);
    expect(other).not.toBe(one);
  });
});

describe('saveTournamentPlayers', () => {
  it('puts a new player in the public league and selects it', async () => {
    await saveWorld(db);
    await savePlaying(db, TOURNAMENT, ADA, BEN);
    expect(
      rows.parse(
        (
          await client.query(
            `select tp.player_id, m.league_id = tp.selected_league_id as selected
             from tournament_players tp
             join league_members m on m.league_id = tp.selected_league_id and m.player_id = tp.player_id
             order by tp.player_id`,
          )
        ).rows,
      ),
    ).toEqual([
      { player_id: 1, selected: true },
      { player_id: 2, selected: true },
    ]);
  });

  it('keeps the league a player selects when their status is upserted again', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [
      { league: publicLeague, members: [] },
      { league: friends, members: [] },
    ]);
    await savePlaying(db, TOURNAMENT, ADA);
    await saveLeagues(db, TOURNAMENT, [
      { league: friends, members: [member(7, friends, ADA)] },
    ]);
    await saveLeagueSelections(db, TOURNAMENT, new Map([[ADA, FRIENDS]]));
    await saveTournamentPlayers(db, TOURNAMENT, [
      { player: ADA, switchedOff: true, adminHidden: false, fillIns: 3 },
    ]);
    expect(
      rows.parse(
        (
          await client.query(
            'select selected_league_id, switched_off, fill_ins from tournament_players',
          )
        ).rows,
      ),
    ).toEqual([{ selected_league_id: 41, switched_off: true, fill_ins: 3 }]);
  });
});

describe('saveLeagues', () => {
  it('keeps sportbet ids, and advanceIdentitySequences moves past them', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [
      {
        league: publicLeague,
        members: [member(900, publicLeague, ADA)],
      },
      {
        league: friends,
        members: [member(901, friends, ADA, { isAdmin: true, paid: null })],
      },
    ]);
    await advanceIdentitySequences(db);
    await client.query(
      `insert into leagues (tournament_id, name) values ($1, 'Nauja')`,
      [TOURNAMENT.id],
    );
    await client.query(
      'insert into league_members (league_id, player_id) select id, 2 from leagues where name = $1',
      ['Nauja'],
    );
    expect(
      rows.parse(
        (await client.query('select id from leagues order by id')).rows,
      ),
    ).toEqual([{ id: 40 }, { id: 41 }, { id: 42 }]);
    expect(
      rows.parse(
        (await client.query('select id from league_members order by id')).rows,
      ),
    ).toEqual([{ id: 900 }, { id: 901 }, { id: 902 }]);
  });

  it('reads back what it saved, parsed', async () => {
    await saveWorld(db);
    const paid = member(7, friends, BEN, {
      isGuest: true,
      paid: unwrap(cents(1250)),
    });
    await saveLeagues(db, TOURNAMENT, [
      { league: publicLeague, members: [] },
      {
        league: friends,
        members: [member(6, friends, ADA, { isAdmin: true }), paid],
      },
    ]);
    const listed = await listLeagues(db, TOURNAMENT);
    expect(listed.map(({ league }) => league)).toEqual([publicLeague, friends]);
    expect(listed[1]?.members).toEqual([
      member(6, friends, ADA, { isAdmin: true }),
      paid,
    ]);
  });

  it('refuses a league of another tournament', async () => {
    await saveWorld(db);
    await expect(
      saveLeagues(db, OTHER, [{ league: publicLeague, members: [] }]),
    ).rejects.toThrow(/league 40.*another tournament/);
  });
});

describe('loadPlayerLeagues', () => {
  it('lists the leagues of the tournament in membership order, the selected one marked', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [
      { league: publicLeague, members: [] },
      { league: friends, members: [] },
    ]);
    await savePlaying(db, TOURNAMENT, ADA, BEN);
    await saveLeagues(db, TOURNAMENT, [
      { league: friends, members: [member(2000, friends, ADA)] },
    ]);
    await saveLeagueSelections(db, TOURNAMENT, new Map([[ADA, FRIENDS]]));
    expect(await loadPlayerLeagues(db, TOURNAMENT, ADA)).toEqual([
      {
        id: PUBLIC_ID,
        name: TOURNAMENT.name,
        isPublic: true,
        isGuest: false,
        selected: false,
      },
      {
        id: FRIENDS,
        name: 'Draugų lyga',
        isPublic: false,
        isGuest: false,
        selected: true,
      },
    ]);
    expect(await loadPlayerLeagues(db, TOURNAMENT, BEN)).toEqual([
      {
        id: PUBLIC_ID,
        name: TOURNAMENT.name,
        isPublic: true,
        isGuest: false,
        selected: true,
      },
    ]);
  });

  it('leaves out another tournament leagues', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    await savePlaying(db, OTHER, ADA);
    expect(await loadPlayerLeagues(db, TOURNAMENT, ADA)).toEqual([]);
  });
});

describe('saveLeagueSelections', () => {
  it('refuses a player who plays no part in the tournament', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [{ league: publicLeague, members: [] }]);
    await expect(
      saveLeagueSelections(db, TOURNAMENT, new Map([[CAI, PUBLIC_ID]])),
    ).rejects.toThrow(/player 3.*not in tournament/);
  });
});

describe('countPendingInvites', () => {
  it('counts the invites of a player in every tournament, on purpose (issue 183)', async () => {
    await saveWorld(db);
    await saveTournament(db, OTHER);
    const otherLeague: League = {
      ...friends,
      id: leagueNo(50),
      tournament: tournamentKey(String(OTHER.id)),
    };
    await saveLeagues(
      db,
      TOURNAMENT,
      [friends].map((league) => ({ league, members: [] })),
    );
    await saveLeagues(db, OTHER, [{ league: otherLeague, members: [] }]);
    await saveInvites(db, [
      { id: 1, league: FRIENDS, invitee: BEN, invitedBy: ADA, createdAt: null },
      {
        id: 2,
        league: otherLeague.id,
        invitee: BEN,
        invitedBy: null,
        createdAt: null,
      },
      { id: 3, league: FRIENDS, invitee: CAI, invitedBy: ADA, createdAt: null },
    ]);
    expect(await countPendingInvites(db, BEN)).toBe(2);
    expect(await countPendingInvites(db, CAI)).toBe(1);
    expect(await countPendingInvites(db, ADA)).toBe(0);
  });
});

describe('saveMessages', () => {
  it('keeps sportbet ids, a message of a league and a detached one', async () => {
    await saveWorld(db);
    await saveLeagues(db, TOURNAMENT, [{ league: friends, members: [] }]);
    await saveMessages(db, [
      { id: 5, league: FRIENDS, text: 'Sveiki', active: true },
      { id: 6, league: null, text: 'Atsiskyrusi', active: false },
    ]);
    expect(
      rows.parse(
        (
          await client.query(
            'select id, league_id, text, active from messages order by id',
          )
        ).rows,
      ),
    ).toEqual([
      { id: 5, league_id: 41, text: 'Sveiki', active: true },
      { id: 6, league_id: null, text: 'Atsiskyrusi', active: false },
    ]);
  });
});
