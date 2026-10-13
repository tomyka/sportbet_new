import { Game, Points, ruledRules, sportbetRules } from '@sportbet/domain';
import { at, gameNo, roundNo, team, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSurvivalSummary } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10_OPEN,
  G7,
  G8,
  G9,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
/** Round 1's second open game: Fenerbahce - Monaco, the day after game 10. */
const G11 = unwrap(
  Game.schedule({
    id: gameNo(11),
    round: roundNo(1),
    home: FEN,
    away: team('15'),
    tipOff: at('2026-10-21T18:00:00Z'),
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await client.query(
    "insert into teams (id, tournament_id, name) overriding system value values (15, 3, 'Monaco')",
  );
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN, G11]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await client.query(
    "update players set name = 'Ada', surname = 'Lovelace' where id = 1",
  );
});

const load = (rules = ruledRules, viewer = ADA) =>
  loadSurvivalSummary(db, { viewer, tournament: TOURNAMENT, rules, now: NOW });

describe('loadSurvivalSummary', () => {
  it('survival summary: the roster is the listed players only (RA-4)', async () => {
    await client.query(
      'update tournament_players set switched_off = true where player_id = 3',
    );
    const { summary } = await load();
    expect(summary.rows.map((row) => row.username).sort()).toEqual([
      'ada',
      'ben',
    ]);
  });

  it("survival summary: the total is the stored total of the rule set's source", async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (2, 3, 21, 11)',
    );
    await client.query(
      `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional)
       values ('ruled', 2, 3, 21, 11, 10, false), ('sportbet', 2, 3, 21, 11, 12, false)`,
    );
    const ruled = (await load(ruledRules)).summary.rows.find(
      (row) => row.username === 'ben',
    );
    expect(ruled?.total).toEqual(unwrap(Points.whole(10)));
    expect(ruled?.rank).toBe(1);
    expect(ruled?.tiles).toEqual([
      {
        round: 1,
        state: 'hit',
        team: team('11'),
        hidden: false,
        points: unwrap(Points.whole(10)),
      },
    ]);
    const sportbet = (await load(sportbetRules)).summary.rows.find(
      (row) => row.username === 'ben',
    );
    expect(sportbet?.total).toEqual(unwrap(Points.whole(12)));
  });

  it('survival summary: initials leave the database, a surname never does', async () => {
    const data = await load();
    const ada = data.summary.rows.find((row) => row.username === 'ada');
    expect(ada?.initials).toBe('AL');
    expect(ada?.me).toBe(true);
    expect(JSON.stringify(data)).not.toContain('Lovelace');
  });

  it("survival summary: another player's pending pick reads hidden; the rounds and the names", async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (2, 3, 21, 13)',
    );
    const data = await load();
    const ben = data.summary.rows.find((row) => row.username === 'ben');
    expect(ben?.tiles[0]).toMatchObject({
      state: 'pending',
      hidden: true,
      team: null,
    });
    expect(data.summary.rounds).toEqual([1]);
    expect(data.roundNames.get(roundNo(1))).toBe('1 turas');
    expect(data.teamNames.get(team('15'))).toBe('Monaco');
  });
});
