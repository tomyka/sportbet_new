import { at, roundNo } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadStandingsPage } from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  G10_OPEN,
  G7,
  G8,
  G9,
  OTHER,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
/** Round 2's first tip-off (game 8) closes standings when the deadline round is 2. */
const ROUND_TWO = { ...TOURNAMENT, standingsDeadlineRound: roundNo(2) };

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, ROUND_TWO);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10_OPEN]);
  await savePlaying(db, TOURNAMENT, ADA, BEN);
  await client.query(
    'insert into standings_predictions (player_id, team_id, place, play_offs) values (1, 13, 1, true), (2, 11, 1, null)',
  );
});

const page = () =>
  loadStandingsPage(db, { player: ADA, tournament: ROUND_TWO, now: NOW });

describe('loadStandingsPage', () => {
  it("standings page: the player's own rows only, every team listed, by place then name", async () => {
    const loaded = await page();
    expect(loaded.rows.map((row) => [row.name, row.place])).toEqual([
      ['Real', 1],
      ['Fenerbahce', null],
      ['Olympiacos', null],
      ['Zalgiris', null],
    ]);
    expect(loaded.rows[0]?.playOffs).toBe(true);
    expect(loaded.placesSaved).toBe(true);
  });

  it("standings page: the deadline is the deadline round's first tip-off (ST-2)", async () => {
    expect((await page()).closes).toEqual({ state: 'open', at: G8.tipOff });
  });

  it("standings page: none of another tournament's rows leaks in", async () => {
    await saveTournament(db, OTHER);
    await client.query(
      "insert into teams (id, tournament_id, name) overriding system value values (41, 4, 'Partizan')",
    );
    await client.query(
      'insert into standings_predictions (player_id, team_id, place) values (1, 41, 2)',
    );
    const loaded = await page();
    expect(loaded.rows.map((row) => row.name)).not.toContain('Partizan');
    expect(loaded.counts.places).toBe(1);
  });

  it("standings page: sportbet's stored place 0 and final place 3 are read as stored", async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place) values (1, 12, 0, true, true, 3)',
    );
    expect((await page()).rows[0]).toMatchObject({
      name: 'Olympiacos',
      place: 0,
      finalPlace: 3,
    });
  });

  it('standings page: a stored row breaking R-78 is shown mended, as the page has always shown it', async () => {
    await client.query(
      'insert into standings_predictions (player_id, team_id, place, final_place) values (1, 12, 0, 3)',
    );
    expect((await page()).rows[0]).toMatchObject({
      name: 'Olympiacos',
      place: 0,
      finalFour: null,
      finalPlace: null,
    });
  });
});
