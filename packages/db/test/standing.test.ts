// One tournament's standing (loadTournamentStanding): the read the league
// table, the game page, the leaderboard and the hub's guest panels share.

import {
  Points,
  ruledRules,
  StandingsPoints,
  type PlayerId,
} from '@sportbet/domain';
import { player, testPlayer } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTournamentPoints,
  loadTournamentStanding,
  recalculateLocked,
  savePlayers,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { loadScoredOrigins } from '../src/dashboard/standing';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');
const dan = IDS.player('dan');
const eve = player('5');

beforeEach(async () => {
  await saveGolden(db);
  await savePlayers(db, [testPlayer(eve, 'eve')]);
  await saveTournamentPlayers(db, GOLDEN_EL, [
    { player: eve, switchedOff: false, adminHidden: false, fillIns: 0 },
    { player: cai, switchedOff: true, adminHidden: false, fillIns: 0 },
  ]);
  await recalculateLocked(db, GOLDEN_EL, ruledRules);
});

describe('loadTournamentStanding', () => {
  it("holds the rule set's own rows", async () => {
    const standing = await loadTournamentStanding(db, GOLDEN_EL, ruledRules);
    expect(standing.rows).toEqual(
      await loadTournamentPoints(db, GOLDEN_EL, 'ruled'),
    );
  });

  it('names the listed players: who counts (RA-4; a league roster from slice 12)', async () => {
    const standing = await loadTournamentStanding(db, GOLDEN_EL, ruledRules);
    expect(standing.listed).toEqual(new Set([ada, ben, dan, eve]));
  });

  it('totals the listed players first, one with no row at zero, then anyone else with a row', async () => {
    const { totals } = await loadTournamentStanding(db, GOLDEN_EL, ruledRules);
    const players = totals.map(({ player: who }) => who);
    expect(new Set(players.slice(0, 4))).toEqual(new Set([ada, ben, dan, eve]));
    expect(players.slice(4)).toEqual([cai]);
    expect(totals.find(({ player: who }) => who === eve)).toEqual({
      player: eve,
      match: Points.ZERO,
      serija: Points.ZERO,
      standings: StandingsPoints.ZERO,
      survival: Points.ZERO,
    });
  });

  it('names every listed player and everyone with a row', async () => {
    const { usernames } = await loadTournamentStanding(
      db,
      GOLDEN_EL,
      ruledRules,
    );
    expect(new Map(usernames)).toEqual(
      new Map<PlayerId, string>([
        [ada, 'ada'],
        [ben, 'ben'],
        [cai, 'cai'],
        [dan, 'dan'],
        [eve, 'eve'],
      ]),
    );
  });

  it('reads no prediction: the origins are loaded only where they are judged', async () => {
    const standing = await loadTournamentStanding(db, GOLDEN_EL, ruledRules);
    expect(Object.keys(standing).toSorted()).toEqual([
      'listed',
      'rows',
      'totals',
      'tournament',
      'usernames',
    ]);
  });
});

describe('loadScoredOrigins', () => {
  it("one player's: only theirs", async () => {
    const origins = await loadScoredOrigins(db, GOLDEN_EL, ruledRules, ada);
    expect(origins.map(({ player: who, game }) => [who, game])).toEqual(
      expect.arrayContaining([
        [ada, IDS.game(1)],
        [ada, IDS.game(2)],
        [ada, IDS.game(3)],
      ]),
    );
    expect(origins).toHaveLength(3);
  });

  it("holds each scored prediction's origin, and no other prediction", async () => {
    const origins = await loadScoredOrigins(db, GOLDEN_EL, ruledRules);
    expect(origins).toHaveLength(9);
    expect(new Set(origins.map(({ origin }) => origin))).toEqual(
      new Set(['real']),
    );
  });
});
