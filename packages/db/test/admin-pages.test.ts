// Slice 13: the admin structure pages' loaders, on the world's tournament.

import { at, gameNo, roundNo, team } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findAdminGame,
  findAdminTournament,
  loadAdminGames,
  loadAdminRounds,
  loadAdminTeams,
  loadAdminTournaments,
} from '../src';
import { saveGames } from '../src/season/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  FEN,
  G10,
  G7,
  G8,
  G9,
  OLY,
  OTHER,
  REA,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();
const NOW = at('2026-10-15T12:00:00Z');

beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await saveGames(db, TOURNAMENT, [G7, G8, G9, G10]);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
});

describe('loadAdminTournaments (adminIndex)', () => {
  it('admin tournaments: every tournament with its profile, newest first', async () => {
    await client.query(
      "update tournaments set created_at = '2026-01-01T00:00:00Z', status = 'active', description = 'Pirmas' where id = 3",
    );
    await client.query(
      "update tournaments set created_at = '2026-06-01T00:00:00Z' where id = 4",
    );
    const listed = await loadAdminTournaments(db);
    expect(listed.map(({ tournament }) => tournament.id)).toEqual([4, 3]);
    expect(listed[1]).toEqual({
      tournament: TOURNAMENT,
      profile: {
        status: 'active',
        startsOn: null,
        sport: 'basketball',
        description: 'Pirmas',
        isPublic: true,
      },
    });
  });

  it('admin tournaments: one by id, or none', async () => {
    expect((await findAdminTournament(db, 4))?.tournament).toEqual(OTHER);
    expect(await findAdminTournament(db, 99)).toBeUndefined();
  });
});

describe('loadAdminRounds (getEvent)', () => {
  it('admin rounds: the tournament`s rounds by number, each with its game count', async () => {
    const listed = await loadAdminRounds(db, TOURNAMENT);
    expect(
      listed.map(
        ({ id, number, name, stage, rate, survival, knockout, games }) => ({
          id,
          number,
          name,
          stage,
          rate: rate.value,
          survival,
          knockout,
          games,
        }),
      ),
    ).toEqual([
      {
        id: 21,
        number: roundNo(1),
        name: '1 turas',
        stage: 'regular',
        rate: 1,
        survival: true,
        knockout: false,
        games: 2,
      },
      {
        id: 22,
        number: roundNo(2),
        name: '2 turas',
        stage: 'regular',
        rate: 2,
        survival: false,
        knockout: true,
        games: 2,
      },
    ]);
  });

  it('admin rounds: another tournament has none of them', async () => {
    expect(await loadAdminRounds(db, OTHER)).toEqual([]);
  });
});

describe('loadAdminGames (getGameAll)', () => {
  beforeEach(async () => {
    // Game 7: ADA's real score, BEN's blank row, CAI's fill-in. Game 9: BEN
    // once saved a score and cleared it again (the audit row stays).
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin, filled_in_at) values (1, 7, 88, 79, 'real', null), (2, 7, null, null, 'real', null), (3, 7, 70, 65, 'fill-in', now())",
    );
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (2, 9, null, null, 'real')",
    );
    await client.query(
      'insert into audit_prediction_games (player_id, game_id, home, away, old_home, old_away, at) values (2, 9, 90, 80, null, null, now())',
    );
    await client.query(
      'insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at) values (1, 8, null, null, false, 80, 80, false, now())',
    );
  });

  const load = (tournament = TOURNAMENT) =>
    loadAdminGames(db, tournament, { now: NOW });

  it('admin games: newest id first, with team and round names', async () => {
    const page = await load();
    expect(page.games.map(({ id }) => id)).toEqual([
      gameNo(10),
      gameNo(9),
      gameNo(8),
      gameNo(7),
    ]);
    expect(page.games[3]).toMatchObject({
      id: gameNo(7),
      roundId: 21,
      round: roundNo(1),
      roundName: '1 turas',
      home: ZAL,
      homeName: 'Zalgiris',
      away: OLY,
      awayName: 'Olympiacos',
      tipOff: G7.tipOff,
      postponed: false,
    });
    expect(page.games[3]?.result).toEqual(G7.result);
    expect(page.games[1]).toMatchObject({ postponed: true, result: null });
  });

  it('admin games: real predictions counted as R-89 reads them - a score or an audit row, not a blank row or a fill-in', async () => {
    const page = await load();
    expect(
      Object.fromEntries(
        page.games.map(({ id, realPredictions }) => [id, realPredictions]),
      ),
    ).toEqual({ 7: 1, 8: 0, 9: 1, 10: 0 });
  });

  it('admin games: who may be deleted, by gameDeletion`s verdict', async () => {
    const page = await load();
    expect(
      Object.fromEntries(page.games.map(({ id, deletion }) => [id, deletion])),
    ).toEqual({
      7: 'has-real-predictions',
      8: 'has-result',
      9: 'has-real-predictions',
      10: null,
    });
  });

  it('admin games: the tournament`s teams and rounds, for the two dropdowns', async () => {
    const page = await load();
    expect(page.teams).toEqual([
      { id: ZAL, name: 'Zalgiris' },
      { id: OLY, name: 'Olympiacos' },
      { id: REA, name: 'Real' },
      { id: FEN, name: 'Fenerbahce' },
    ]);
    expect(page.rounds).toEqual([
      { id: 21, number: roundNo(1), name: '1 turas' },
      { id: 22, number: roundNo(2), name: '2 turas' },
    ]);
    expect(team('11')).toBe(ZAL);
  });

  it('admin games: the latest tip-off and the last-entered round are the new game`s defaults', async () => {
    const page = await load();
    expect(page.latestTipOff).toBe(G10.tipOff);
    expect(page.lastRoundId).toBe(21);
    expect(page.finished).toBe(false);
  });

  it('admin games: a tournament with no game has no default time or round', async () => {
    const page = await load(OTHER);
    expect(page).toMatchObject({
      games: [],
      teams: [],
      rounds: [],
      latestTipOff: null,
      lastRoundId: null,
    });
  });

  it('admin games: a finished tournament says so, and offers no deletion (R-110)', async () => {
    await client.query(
      "update tournaments set ends_on = '2026-01-01' where id = 4",
    );
    expect((await load({ ...OTHER, endsOn: '2026-01-01' })).finished).toBe(
      true,
    );
    await client.query(
      'update games set home_score = 1, away_score = 0, postponed = false where id in (9, 10)',
    );
    await client.query(
      "update tournaments set ends_on = '2026-10-10' where id = 3",
    );
    const page = await load({ ...TOURNAMENT, endsOn: '2026-10-10' });
    expect(page.finished).toBe(true);
    expect(page.games.every(({ deletion }) => deletion !== null)).toBe(true);
    expect(page.games.find(({ id }) => id === gameNo(10))?.deletion).toBe(
      'tournament-finished',
    );
  });
});

describe('findAdminGame', () => {
  const context = { now: NOW };

  it('is the very row the list shows for the game, whatever its verdict', async () => {
    const page = await loadAdminGames(db, TOURNAMENT, context);
    for (const listed of page.games) {
      expect(await findAdminGame(db, TOURNAMENT, listed.id, context)).toEqual(
        listed,
      );
    }
  });

  it('carries the survival-pick refusal (R-125), on the page and alone, for the picked team in its round only', async () => {
    await client.query(
      'insert into survival_picks (player_id, tournament_id, round_id, team_id) values (1, 3, 21, 13), (2, 3, 22, 13)',
    );
    const page = await loadAdminGames(db, TOURNAMENT, context);
    expect(
      Object.fromEntries(page.games.map(({ id, deletion }) => [id, deletion])),
    ).toMatchObject({ 10: 'has-survival-picks', 9: null });
    expect(
      await findAdminGame(db, TOURNAMENT, gameNo(10), context),
    ).toMatchObject({ deletion: 'has-survival-picks' });
  });

  it('counts the real predictions and the result history of that game only', async () => {
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 7, 88, 79, 'real'), (1, 9, 70, 60, 'real')",
    );
    await client.query(
      'insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at) values (1, 8, null, null, false, 80, 80, false, now())',
    );
    expect(
      await findAdminGame(db, TOURNAMENT, gameNo(7), context),
    ).toMatchObject({ realPredictions: 1, deletion: 'has-real-predictions' });
    expect(
      await findAdminGame(db, TOURNAMENT, gameNo(10), context),
    ).toMatchObject({ realPredictions: 0, deletion: null });
  });

  it('is null for a game that is none, or of another tournament', async () => {
    expect(
      await findAdminGame(db, TOURNAMENT, gameNo(999), context),
    ).toBeNull();
    expect(await findAdminGame(db, OTHER, gameNo(7), context)).toBeNull();
  });
});

describe('loadAdminTeams (getTeam)', () => {
  it('admin teams: names with their outcomes, a team never entered blank, and the final mark', async () => {
    await client.query(
      'insert into team_outcomes (team_id, place, play_offs, final_four, final_place) values (11, 1, true, true, 1), (12, 2, true, true, 2)',
    );
    await client.query(
      'update tournaments set standings_table_final = true where id = 3',
    );
    const page = await loadAdminTeams(db, {
      ...TOURNAMENT,
      standingsTableFinal: true,
    });
    expect(page.final).toBe(true);
    expect(page.teams.map(({ id, name }) => [id, name])).toEqual([
      [ZAL, 'Zalgiris'],
      [OLY, 'Olympiacos'],
      [REA, 'Real'],
      [FEN, 'Fenerbahce'],
    ]);
    expect(page.teams[0]?.outcome).toEqual({
      team: ZAL,
      place: 1,
      playOffs: true,
      finalFour: true,
      finalPlace: 1,
    });
    expect(page.teams[3]?.outcome).toEqual({
      team: FEN,
      place: null,
      playOffs: false,
      finalFour: false,
      finalPlace: null,
    });
  });

  it('admin teams: a tournament with no team lists none, and is not final', async () => {
    expect(await loadAdminTeams(db, OTHER)).toEqual({
      teams: [],
      final: false,
    });
  });
});
