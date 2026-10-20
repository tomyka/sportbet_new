// The `production` and `sportbet` rows that stay in the live database as
// retired history: nothing reads or writes them (LIVE_SOURCE). Seeded by raw
// SQL, because no repository function names a retired source any more.

import type { Pool } from 'pg';

/** The retired sources, as `points_source` names them. */
const RETIRED_SOURCES = ['production', 'sportbet'] as const;

/**
 * Gives every game, player and team of the tournament a retired row of each
 * retired source in all four points tables, with values the live rows never
 * hold (odds 9.00, a match worth 999 with a bingo of 50, standings 9,999, survival 99), so a
 * loader that read the wrong source shows it.
 */
export async function seedRetiredRows(
  client: Pool,
  tournament: number,
): Promise<void> {
  await client.query(
    `insert into game_odds (source, game_id, home, away, draw)
       select s::points_source, g.id, 9, 9, 9
         from unnest($2::text[]) s, games g where g.tournament_id = $1`,
    [tournament, RETIRED_SOURCES],
  );
  await client.query(
    `insert into match_points (source, player_id, game_id, winner, margin, bingo, "full", odds, serija)
       select s::points_source, tp.player_id, g.id, 999, 0, 50, 999, 9, 0
         from unnest($2::text[]) s, games g
         join tournament_players tp on tp.tournament_id = g.tournament_id
        where g.tournament_id = $1`,
    [tournament, RETIRED_SOURCES],
  );
  await client.query(
    `insert into standings_points (source, player_id, team_id, place_points, place_odds)
       select s::points_source, tp.player_id, t.id, 9999, 9
         from unnest($2::text[]) s, teams t
         join tournament_players tp on tp.tournament_id = t.tournament_id
        where t.tournament_id = $1`,
    [tournament, RETIRED_SOURCES],
  );
  await client.query(
    `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional, sportbet_id)
       select 'production', tp.player_id, $1, r.id, (select min(id) from teams where tournament_id = $1), 99, false,
              900000 + tp.player_id * 100 + r.number
         from tournament_players tp, rounds r
        where tp.tournament_id = $1 and r.tournament_id = $1`,
    [tournament],
  );
  await client.query(
    `insert into survival_points (source, player_id, tournament_id, round_id, team_id, points, provisional)
       select 'sportbet', tp.player_id, $1, r.id, (select min(id) from teams where tournament_id = $1), 99, false
         from tournament_players tp, rounds r
        where tp.tournament_id = $1 and r.tournament_id = $1`,
    [tournament],
  );
}

/** How many retired rows the four points tables hold, per table. */
export async function countRetiredRows(
  client: Pool,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [
    'game_odds',
    'match_points',
    'standings_points',
    'survival_points',
  ]) {
    const result = await client.query<{ rows: number }>(
      `select count(*)::int as rows from ${table} where source <> 'ruled'`,
    );
    counts[table] = result.rows[0]?.rows ?? 0;
  }
  return counts;
}
