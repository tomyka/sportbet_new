import {
  FORMATS,
  PREDICTION_ORIGINS,
  RULE_SET_NAMES,
  STAGES,
} from '@sportbet/domain';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase } from '../src/testing';

const { url, client } = useTestDatabase();

const run = (text: string, values: readonly unknown[] = []) =>
  client.query(text, [...values]);

const refusal = z.object({
  code: z.string(),
  constraint: z.string().optional(),
});

/**
 * What the database says to a statement: accepted, or the error code and
 * the constraint it was refused by.
 */
async function verdict(
  text: string,
  values: readonly unknown[] = [],
): Promise<'accepted' | z.infer<typeof refusal>> {
  try {
    await run(text, values);
    return 'accepted';
  } catch (error) {
    const { code, constraint } = refusal.parse(error);
    return { code, constraint };
  }
}

const refusedBy = (code: string, constraint: string) => ({ code, constraint });

const FOREIGN_KEY = '23503';
const UNIQUE = '23505';
const CHECK = '23514';

const insertTournament = (id: number, slug: string) =>
  run(
    `insert into tournaments (id, slug, name, format, ends_on, survival)
     overriding system value values ($1, $2, $2, 'euroleague', '2027-05-23', true)`,
    [id, slug],
  );

/**
 * Two tournaments: 1 has round 1 (id 10), teams 1, 2 and 3 and game 100
 * (1 v 2, unscored); 2 has round 1 (id 20) and team 4. Players 1 and 2.
 */
async function world(): Promise<void> {
  await insertTournament(1, 'euroleague-2026-27');
  await insertTournament(2, 'euroleague-2027-28');
  await run(
    `insert into rounds (id, tournament_id, number, name, stage, rate, survival, knockout)
     overriding system value values
       (10, 1, 1, '1 turas', 'regular', 1, true, false),
       (20, 2, 1, '1 turas', 'regular', 1, true, false)`,
  );
  await run(
    `insert into teams (id, tournament_id, name) overriding system value values
       (1, 1, 'Zalgiris'), (2, 1, 'Olympiacos'), (3, 1, 'Real'), (4, 2, 'Fenerbahce')`,
  );
  await run(
    `insert into games (id, tournament_id, round_id, home_team_id, away_team_id, tip_off)
     overriding system value values (100, 1, 10, 1, 2, '2026-10-02T18:00:00Z')`,
  );
  await run(
    `insert into players (id, username) overriding system value values (1, 'ada'), (2, 'ben')`,
  );
}

const GAME = `insert into games (id, tournament_id, round_id, home_team_id, away_team_id,
  tip_off, home_score, away_score, recorded_winner_id, postponed)
  overriding system value values ($1, $2, $3, $4, $5, '2026-10-02T18:00:00Z', $6, $7, $8, $9)`;
/** Game 101 of tournament 1's round 10: 1 v 3 unless told otherwise. */
const game = (changes: {
  id?: number;
  tournament?: number;
  round?: number;
  home?: number;
  away?: number;
  score?: readonly [number | null, number | null];
  winner?: number | null;
  postponed?: boolean;
}) => [
  changes.id ?? 101,
  changes.tournament ?? 1,
  changes.round ?? 10,
  changes.home ?? 1,
  changes.away ?? 3,
  changes.score?.[0] ?? null,
  changes.score?.[1] ?? null,
  changes.winner ?? null,
  changes.postponed ?? false,
];

// The invariant CHECKs are tested in invariant-checks.test.ts.
describe('tournaments constraints', () => {
  it('accepts a valid row', async () => {
    await expect(
      insertTournament(1, 'euroleague-2026-27'),
    ).resolves.toBeDefined();
  });

  it('rejects an unknown format', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, ends_on, survival)
         values ('euroleague-2026-27', 'Euroleague', 'tennis', '2027-05-23', true)`,
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });

  it('rejects a duplicate slug', async () => {
    await insertTournament(1, 'euroleague-2026-27');
    await expect(
      insertTournament(2, 'euroleague-2026-27'),
    ).rejects.toMatchObject({
      code: UNIQUE,
      constraint: 'tournaments_slug_unique',
    });
  });

  it('rejects a tournament without an end date', async () => {
    await expect(
      run(
        `insert into tournaments (slug, name, format, survival)
         values ('euroleague-2026-27', 'Euroleague', 'euroleague', true)`,
      ),
    ).rejects.toMatchObject({ code: '23502', column: 'ends_on' });
  });
});

describe('rounds and teams constraints', () => {
  beforeEach(world);

  it('refuse a round of an unknown tournament', async () => {
    expect(
      await verdict(
        `insert into rounds (tournament_id, number, name, stage, rate, survival, knockout)
       values (9, 2, '2 turas', 'regular', 1, true, false)`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'rounds_tournament_fk'));
  });

  it('refuse a second round with the same number in one tournament', async () => {
    expect(
      await verdict(
        `insert into rounds (tournament_id, number, name, stage, rate, survival, knockout)
       values (1, 1, 'again', 'regular', 1, true, false)`,
        [],
      ),
    ).toEqual(refusedBy(UNIQUE, 'rounds_tournament_number_unique'));
  });

  it('refuse a team of an unknown tournament', async () => {
    expect(
      await verdict(
        `insert into teams (id, tournament_id, name) overriding system value values (9, 9, 'Nobody')`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'teams_tournament_fk'));
  });

  it("accept a stored team outcome's shared place and final place 3", async () => {
    expect(
      await verdict(`insert into team_outcomes (team_id, place, play_offs, final_four, final_place)
       values (1, 2, true, true, 3), (2, 2, true, false, null)`),
    ).toBe('accepted');
  });

  it('refuse an outcome of an unknown team', async () => {
    expect(
      await verdict(
        `insert into team_outcomes (team_id, place, play_offs, final_four) values (9, 1, true, true)`,
        [],
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'team_outcomes_team_fk'));
  });
});

describe('games constraints', () => {
  beforeEach(world);

  it('accept a valid game, and a level result (stored shape)', async () => {
    expect(await verdict(GAME, game({ score: [80, 80] }))).toBe('accepted');
  });

  it('refuse a round of another tournament', async () => {
    expect(await verdict(GAME, game({ round: 20 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_round_fk'),
    );
  });

  it('refuse a home team of another tournament', async () => {
    expect(await verdict(GAME, game({ home: 4 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_home_team_fk'),
    );
  });

  it('refuse an away team of another tournament', async () => {
    expect(await verdict(GAME, game({ away: 4 }))).toEqual(
      refusedBy(FOREIGN_KEY, 'games_away_team_fk'),
    );
  });

  // A winner must be the home or the away team, and both are the game's
  // tournament's (the two composite foreign keys above), so a winner of
  // another tournament is refused by the CHECK; no foreign key is needed.
  it('refuse a recorded winner of another tournament', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 4 }))).toEqual(
      refusedBy(CHECK, 'games_winner_in_game'),
    );
  });

  it('refuse a second game of one round between the same teams', async () => {
    expect(await verdict(GAME, game({ home: 1, away: 2 }))).toEqual(
      refusedBy(UNIQUE, 'games_round_teams_unique'),
    );
  });

  it('games_teams_differ accepts two teams and refuses one team twice', async () => {
    expect(await verdict(GAME, game({ home: 3, away: 1 }))).toBe('accepted');
    expect(await verdict(GAME, game({ id: 102, home: 3, away: 3 }))).toEqual(
      refusedBy(CHECK, 'games_teams_differ'),
    );
  });

  it('games_result_both_or_neither accepts both scores and refuses one', async () => {
    expect(await verdict(GAME, game({ score: [88, 79] }))).toBe('accepted');
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [88, null] }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_result_both_or_neither'));
  });

  it('games_winner_needs_result accepts a winner with a result and refuses one without', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 1 }))).toBe(
      'accepted',
    );
    expect(
      await verdict(GAME, game({ id: 102, home: 2, away: 3, winner: 2 })),
    ).toEqual(refusedBy(CHECK, 'games_winner_needs_result'));
  });

  it('games_winner_in_game accepts a winner who played and refuses one who did not', async () => {
    expect(await verdict(GAME, game({ score: [80, 80], winner: 3 }))).toBe(
      'accepted',
    );
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [80, 80], winner: 1 }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_winner_in_game'));
  });

  it('games_postponed_without_result accepts a postponed game without a result and refuses one with', async () => {
    expect(await verdict(GAME, game({ postponed: true }))).toBe('accepted');
    expect(
      await verdict(
        GAME,
        game({ id: 102, home: 2, away: 3, score: [88, 79], postponed: true }),
      ),
    ).toEqual(refusedBy(CHECK, 'games_postponed_without_result'));
  });
});

describe('players constraints', () => {
  beforeEach(world);

  it('refuse a second player with the same username', async () => {
    expect(
      await verdict(
        `insert into players (id, username) overriding system value values (3, 'ada')`,
        [],
      ),
    ).toEqual(refusedBy(UNIQUE, 'players_username_unique'));
  });

  it('accept a tournament player, and refuse one twice or of an unknown player or tournament', async () => {
    const insert = `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins) values ($1, $2, false, 0)`;
    expect(await verdict(insert, [1, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1])).toEqual(
      refusedBy(UNIQUE, 'tournament_players_pk'),
    );
    expect(await verdict(insert, [1, 9])).toEqual(
      refusedBy(FOREIGN_KEY, 'tournament_players_player_fk'),
    );
    expect(await verdict(insert, [9, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'tournament_players_tournament_fk'),
    );
  });
});

const PREDICTION = `insert into match_predictions (player_id, game_id, home, away, origin, filled_in_at)
  values ($1, $2, $3, $4, $5, $6)`;

describe('match_predictions constraints', () => {
  beforeEach(world);

  it('accept a half-typed and a blank row (stored shape)', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, null, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [2, 100, null, null, 'real', null])).toBe(
      'accepted',
    );
  });

  it('refuse a second row for one player and game', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [1, 100, 80, 85, 'real', null])).toEqual(
      refusedBy(UNIQUE, 'match_predictions_pk'),
    );
  });

  it('refuse an unknown player or game', async () => {
    expect(await verdict(PREDICTION, [9, 100, 85, 80, 'real', null])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_predictions_player_fk'),
    );
    expect(await verdict(PREDICTION, [1, 999, 85, 80, 'real', null])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_predictions_game_fk'),
    );
  });

  it('match_predictions_not_level accepts two scores that differ and refuses a level pair', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'real', null])).toBe(
      'accepted',
    );
    expect(await verdict(PREDICTION, [2, 100, 80, 80, 'real', null])).toEqual(
      refusedBy(CHECK, 'match_predictions_not_level'),
    );
  });

  it('match_predictions_fill_in_scored accepts a scored fill-in and refuses a half-typed one', async () => {
    expect(await verdict(PREDICTION, [1, 100, 85, 80, 'fill-in', null])).toBe(
      'accepted',
    );
    expect(
      await verdict(PREDICTION, [2, 100, 85, null, 'fill-in', null]),
    ).toEqual(refusedBy(CHECK, 'match_predictions_fill_in_scored'));
  });

  it('match_predictions_fill_in_time accepts a fill-in time on a fill-in and refuses one on a real row', async () => {
    expect(
      await verdict(PREDICTION, [
        1,
        100,
        85,
        80,
        'late-fill-in',
        '2026-10-01T09:00:00Z',
      ]),
    ).toBe('accepted');
    expect(
      await verdict(PREDICTION, [
        2,
        100,
        85,
        80,
        'real',
        '2026-10-01T09:00:00Z',
      ]),
    ).toEqual(refusedBy(CHECK, 'match_predictions_fill_in_time'));
  });
});

describe('standings_predictions constraints', () => {
  beforeEach(world);

  const insert = `insert into standings_predictions (player_id, team_id, place, play_offs, final_four, final_place)
    values ($1, $2, $3, $4, $5, $6)`;

  it("accept sportbet's place 0 and final place 3 (stored shape), and a saved unticked box", async () => {
    expect(await verdict(insert, [1, 1, 0, false, null, 3])).toBe('accepted');
  });

  it('refuse a second row for one player and team, and an unknown player or team', async () => {
    expect(await verdict(insert, [1, 1, 1, true, true, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1, 2, null, null, null])).toEqual(
      refusedBy(UNIQUE, 'standings_predictions_pk'),
    );
    expect(await verdict(insert, [9, 1, 1, null, null, null])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_predictions_player_fk'),
    );
    expect(await verdict(insert, [1, 9, 1, null, null, null])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_predictions_team_fk'),
    );
  });
});

describe('survival_picks constraints', () => {
  beforeEach(world);

  const insert = `insert into survival_picks (player_id, tournament_id, round_id, team_id) values ($1, $2, $3, $4)`;

  it('accept a pick, and refuse a second pick in one round', async () => {
    expect(await verdict(insert, [1, 1, 10, 1])).toBe('accepted');
    expect(await verdict(insert, [1, 1, 10, 2])).toEqual(
      refusedBy(UNIQUE, 'survival_picks_pk'),
    );
  });

  it('refuse a team or a round of another tournament, and an unknown player', async () => {
    expect(await verdict(insert, [1, 1, 10, 4])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_team_fk'),
    );
    expect(await verdict(insert, [1, 1, 20, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_round_fk'),
    );
    expect(await verdict(insert, [9, 1, 10, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'survival_picks_player_fk'),
    );
  });
});

describe('points tables constraints', () => {
  beforeEach(world);

  it('game_odds: accept one row per source and game, and refuse a second or an unknown game', async () => {
    const insert = `insert into game_odds (source, game_id, home, away, draw) values ($1, $2, 0.59, 1.59, 2.59)`;
    expect(await verdict(insert, ['production', 100])).toBe('accepted');
    expect(await verdict(insert, ['sportbet', 100])).toBe('accepted');
    expect(await verdict(insert, ['production', 100])).toEqual(
      refusedBy(UNIQUE, 'game_odds_pk'),
    );
    expect(await verdict(insert, ['ruled', 999])).toEqual(
      refusedBy(FOREIGN_KEY, 'game_odds_game_fk'),
    );
  });

  it('match_points: accept a negative margin, and refuse a second row or an unknown player or game', async () => {
    const insert = `insert into match_points (source, player_id, game_id, winner, margin, bingo, odds_points, "full", odds, serija)
      values ($1, $2, $3, 0, -45, 0, 0, -45, 1.59, 0)`;
    expect(await verdict(insert, ['production', 1, 100])).toBe('accepted');
    expect(await verdict(insert, ['production', 1, 100])).toEqual(
      refusedBy(UNIQUE, 'match_points_pk'),
    );
    expect(await verdict(insert, ['production', 9, 100])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_points_player_fk'),
    );
    expect(await verdict(insert, ['production', 1, 999])).toEqual(
      refusedBy(FOREIGN_KEY, 'match_points_game_fk'),
    );
  });

  it('standings_points: accept null apart from 0, and refuse a second row or an unknown team', async () => {
    const insert = `insert into standings_points (source, player_id, team_id, place_points, place_odds, play_offs_points)
      values ($1, $2, $3, 631.161, 1, 0)`;
    expect(await verdict(insert, ['production', 1, 1])).toBe('accepted');
    expect(await verdict(insert, ['production', 1, 1])).toEqual(
      refusedBy(UNIQUE, 'standings_points_pk'),
    );
    expect(await verdict(insert, ['production', 9, 1])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_points_player_fk'),
    );
    expect(await verdict(insert, ['production', 1, 9])).toEqual(
      refusedBy(FOREIGN_KEY, 'standings_points_team_fk'),
    );
  });
});

const SURVIVAL = `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional, sportbet_id, stored_row_id)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

/** Tournament 1's production row of player 1, round 10, team 1: sportbet's id `sportbetId`. */
const production = (sportbetId: number) =>
  run(SURVIVAL, ['production', 1, 1, 10, 1, 12, false, sportbetId, null]);

describe('survival_points constraints', () => {
  beforeEach(world);

  it('accept two production rows for one player and round (the refold allows them)', async () => {
    expect(
      await verdict(SURVIVAL, ['production', 1, 1, 10, 1, 12, false, 1, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, ['production', 1, 1, 10, 2, 0, false, 2, null]),
    ).toBe('accepted');
  });

  it('survival_points_production_shape accepts a scored final production row and refuses a pending or provisional one', async () => {
    expect(
      await verdict(SURVIVAL, ['production', 1, 1, 10, 1, 12, false, 1, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [
        'production',
        1,
        1,
        10,
        2,
        null,
        false,
        2,
        null,
      ]),
    ).toEqual(refusedBy(CHECK, 'survival_points_production_shape'));
    expect(
      await verdict(SURVIVAL, ['production', 1, 1, 10, 2, 12, true, 3, null]),
    ).toEqual(refusedBy(CHECK, 'survival_points_production_shape'));
  });

  it("survival_points_sportbet_id accepts sportbet's id on a production row only, and refuses a production row without one", async () => {
    expect(
      await verdict(SURVIVAL, ['production', 1, 1, 10, 1, 12, false, 1, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, ['ruled', 1, 1, 10, 1, 12, false, null, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, [
        'production',
        2,
        1,
        10,
        1,
        12,
        false,
        null,
        null,
      ]),
    ).toEqual(refusedBy(CHECK, 'survival_points_sportbet_id'));
    expect(
      await verdict(SURVIVAL, ['sportbet', 2, 1, 10, 1, 12, false, 5, null]),
    ).toEqual(refusedBy(CHECK, 'survival_points_sportbet_id'));
  });

  it("refuse a second production row with one sportbet id, and keep each row's own generated id", async () => {
    await production(1);
    expect(
      await verdict(SURVIVAL, ['production', 2, 1, 10, 2, 0, false, 1, null]),
    ).toEqual(refusedBy(UNIQUE, 'survival_points_sportbet_id_unique'));
    const ids = await run(
      `select id, sportbet_id from survival_points order by id`,
    );
    expect(ids.rows).toEqual([{ id: 1, sportbet_id: 1 }]);
  });

  it('survival_points_rewrites_production accepts a derived row that rewrites a production row and refuses a production row that does', async () => {
    await production(1);
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 1]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, ['production', 2, 1, 10, 1, 12, false, 3, 1]),
    ).toEqual(refusedBy(CHECK, 'survival_points_rewrites_production'));
  });

  it('refuse a rewrite of a sportbet id no production row holds', async () => {
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 99]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_stored_row_fk'));
  });

  it("refuse a rewrite of a derived row's own id: only a production row can be rewritten", async () => {
    const derived = await run(`${SURVIVAL} returning id`, [
      'ruled',
      1,
      1,
      10,
      1,
      12,
      false,
      null,
      null,
    ]);
    const { id } = z.tuple([z.object({ id: z.int() })]).parse(derived.rows)[0];
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, id]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_stored_row_fk'));
  });

  it("refuse a rewrite of another tournament's production row", async () => {
    await run(SURVIVAL, ['production', 1, 2, 20, 4, 12, false, 5, null]);
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 5]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_stored_row_fk'));
  });

  it('refuse moving a production row to another tournament while a derived row rewrites it', async () => {
    await production(1);
    await run(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 1]);
    expect(
      await verdict(
        `update survival_points set tournament_id = 2, round_id = 20, team_id = 4
         where sportbet_id = 1`,
      ),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_stored_row_fk'));
  });

  it('refuse two rewrites of one stored row under one source', async () => {
    await production(1);
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 1]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, ['sportbet', 1, 1, 10, 1, 12, false, null, 1]),
    ).toEqual(refusedBy(UNIQUE, 'survival_points_stored_row_unique'));
  });

  it('refuse two rows scored from the picks for one player and round under one source', async () => {
    expect(
      await verdict(SURVIVAL, ['ruled', 1, 1, 10, 1, null, false, null, null]),
    ).toBe('accepted');
    expect(
      await verdict(SURVIVAL, ['ruled', 1, 1, 10, 2, 10, false, null, null]),
    ).toEqual(refusedBy(UNIQUE, 'survival_points_pick_unique'));
  });

  it('refuse a team or a round of another tournament, and an unknown player', async () => {
    expect(
      await verdict(SURVIVAL, ['ruled', 1, 1, 10, 4, 10, false, null, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_team_fk'));
    expect(
      await verdict(SURVIVAL, ['ruled', 1, 1, 20, 1, 10, false, null, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_round_fk'));
    expect(
      await verdict(SURVIVAL, ['ruled', 9, 1, 10, 1, 10, false, null, null]),
    ).toEqual(refusedBy(FOREIGN_KEY, 'survival_points_player_fk'));
  });
});

const enumValues = async (name: string) => {
  const result = await run(
    `select unnest(enum_range(null::${name}))::text as value`,
  );
  return z
    .array(z.object({ value: z.string() }))
    .parse(result.rows)
    .map((row) => row.value);
};

describe('enums', () => {
  it('format holds exactly the domain formats, in order', async () => {
    expect(await enumValues('format')).toEqual([...FORMATS]);
  });

  it('stage holds exactly the domain stages, in order', async () => {
    expect(await enumValues('stage')).toEqual([...STAGES]);
  });

  it('prediction_origin holds exactly the domain origins, in order', async () => {
    expect(await enumValues('prediction_origin')).toEqual([
      ...PREDICTION_ORIGINS,
    ]);
  });

  it('points_source holds production and the rule sets, in order', async () => {
    expect(await enumValues('points_source')).toEqual([
      'production',
      ...RULE_SET_NAMES,
    ]);
  });
});

const journalSchema = z
  .object({ entries: z.array(z.object({ tag: z.string() }).loose()) })
  .loose();

/**
 * A second database in the same container, migrated through the first
 * `count` migrations only, handed to `use` with a client of its own and
 * dropped afterwards: a database as it stood before the later migrations.
 */
async function withDatabaseAt(
  count: number,
  use: (database: { url: string; client: pg.Client }) => Promise<void>,
): Promise<void> {
  const name = `migrations_${String(process.pid)}_${String(count)}`;
  await run(`drop database if exists ${name}`);
  await run(`create database ${name}`);
  const other = new URL(url);
  other.pathname = `/${name}`;
  const folder = mkdtempSync(join(tmpdir(), 'migrations-'));
  mkdirSync(join(folder, 'meta'));
  const journal = journalSchema.parse(
    JSON.parse(
      readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ),
  );
  const entries = journal.entries.slice(0, count);
  for (const { tag } of entries) {
    copyFileSync(
      join(MIGRATIONS_FOLDER, `${tag}.sql`),
      join(folder, `${tag}.sql`),
    );
  }
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  await runMigrations(other.href, folder);
  const client = new pg.Client({ connectionString: other.href });
  await client.connect();
  try {
    await use({ url: other.href, client });
  } finally {
    await client.end();
    await run(`drop database ${name}`);
  }
}

describe('migrations', () => {
  it('are idempotent: applying them again changes nothing', async () => {
    await expect(
      runMigrations(url, MIGRATIONS_FOLDER),
    ).resolves.toBeUndefined();
  });

  it("give staging's seeded tournaments the seed's end dates when the season columns arrive", async () => {
    // Migrated to 0000_init only, holding the two rows staging holds today.
    await withDatabaseAt(1, async (staging) => {
      await staging.client.query(
        `insert into tournaments (slug, name, format) values
           ('euroleague-2025-26', 'Euroleague 2025/26', 'euroleague'),
           ('euroleague-2026-27', 'Euroleague 2026/27', 'euroleague')`,
      );
      await runMigrations(staging.url, MIGRATIONS_FOLDER);
      const result = await staging.client.query(
        `select slug, ends_on::text as ends_on, survival, standings_table_final
         from tournaments order by slug`,
      );
      expect(result.rows).toEqual([
        {
          slug: 'euroleague-2025-26',
          ends_on: '2026-05-24',
          survival: true,
          standings_table_final: false,
        },
        {
          slug: 'euroleague-2026-27',
          ends_on: '2027-05-23',
          survival: true,
          standings_table_final: false,
        },
      ]);
    });
  });

  it("keep each production survival row's id as its sportbet_id when the column arrives", async () => {
    // Migrated through 0002_core-schema, where a production row's id was
    // sportbet's and a rewrite named it by that id.
    await withDatabaseAt(3, async (before) => {
      const query = (text: string) => before.client.query(text);
      await query(
        `insert into tournaments (id, slug, name, format, ends_on, survival)
         overriding system value values (1, 'euroleague-2026-27', 'Euroleague', 'euroleague', '2027-05-23', true)`,
      );
      await query(
        `insert into rounds (id, tournament_id, number, name, stage, rate, survival, knockout)
         overriding system value values (10, 1, 1, '1 turas', 'regular', 1, true, false)`,
      );
      await query(
        `insert into teams (id, tournament_id, name) overriding system value values (1, 1, 'Zalgiris')`,
      );
      await query(
        `insert into players (id, username) overriding system value values (1, 'ada')`,
      );
      await query(
        `insert into survival_points (id, source, player_id, tournament_id, round_id, team_id, points, provisional, stored_row_id)
         overriding system value values
           (41, 'production', 1, 1, 10, 1, 12, false, null),
           (42, 'sportbet', 1, 1, 10, 1, 12, false, 41),
           (43, 'ruled', 1, 1, 10, 1, null, false, null)`,
      );
      await runMigrations(before.url, MIGRATIONS_FOLDER);
      const result = await query(
        `select id, source, sportbet_id, stored_row_id from survival_points order by id`,
      );
      expect(result.rows).toEqual([
        { id: 41, source: 'production', sportbet_id: 41, stored_row_id: null },
        { id: 42, source: 'sportbet', sportbet_id: null, stored_row_id: 41 },
        { id: 43, source: 'ruled', sportbet_id: null, stored_row_id: null },
      ]);
    });
  });
});
