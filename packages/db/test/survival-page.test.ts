import { Game, ruledRules } from '@sportbet/domain';
import { at, gameNo, roundNo, team, unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSurvivalPickPage } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
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
const MON = team('15');
/** Round 1's second open game: Fenerbahce - Monaco, the day after game 10. */
const G11 = unwrap(
  Game.schedule({
    id: gameNo(11),
    round: roundNo(1),
    home: FEN,
    away: MON,
    tipOff: at('2026-10-21T18:00:00Z'),
  }),
);

beforeEach(async () => {
  await saveWorld(db);
  await client.query(
    "insert into teams (id, tournament_id, name) overriding system value values (15, 3, 'Monaco')",
  );
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN, G11]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
});

const load = (rules = ruledRules, tournament = TOURNAMENT) =>
  loadSurvivalPickPage(db, { player: ADA, tournament, rules, now: NOW });
const open = async (rules = ruledRules) => {
  const data = await load(rules);
  if (data.page.kind !== 'open') throw new Error('the page is over');
  return { ...data, page: data.page };
};

describe('loadSurvivalPickPage', () => {
  it("survival page: round 1's cards, the round's name and the teams' names", async () => {
    const { page, roundName, teamNames } = await open();
    expect(page.round).toBe(1);
    expect(
      page.cards.map(
        (card) => `${card.team}:${card.state.kind}:${String(card.selectable)}`,
      ),
    ).toEqual([
      '11:started:false',
      '12:started:false',
      '13:open:true',
      '14:open:true',
      '15:open:true',
    ]);
    expect(roundName).toBe('1 turas');
    expect(teamNames.get(MON)).toBe('Monaco');
    expect(teamNames.get(team('11'))).toBe('Zalgiris');
  });

  it('survival page: an empty run - nothing picked, no streak, the first stake', async () => {
    const { page } = await open();
    expect(page.picked).toBeNull();
    expect(page.run).toEqual([]);
    expect(page.stake).toEqual({ home: 10, away: 12 });
  });

  it("survival page: the player's own pick, never another player's", async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 3, 21, 13), (2, 3, 21, 14)',
    );
    const { page } = await open();
    expect(page.picked).toBe(team('13'));
    expect(
      page.cards.filter((card) => card.picked).map((card) => card.team),
    ).toEqual([team('13')]);
  });

  it("survival page: the rows read are the rule set's source only, and the player's own", async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 3, 21, 13)',
    );
    await client.query(
      `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional, sportbet_id)
       values ('ruled', 1, 3, 21, 13, 10, false, null), ('sportbet', 1, 3, 21, 13, 0, false, null),
              ('production', 1, 3, 21, 13, 0, false, 500), ('ruled', 2, 3, 21, 14, 0, false, null)`,
    );
    // Any other source's row, or Ben's, would read as the round lost.
    expect((await open()).page.verdict).toEqual({
      state: 'survived',
      points: 10,
    });
  });

  it('survival page: over in a tournament without survival, with no round name', async () => {
    await client.query('update tournaments set survival = false where id = 3');
    const data = await load(ruledRules, { ...TOURNAMENT, survival: false });
    expect(data.page).toEqual({ kind: 'over' });
    expect(data.roundName).toBeNull();
  });
});
