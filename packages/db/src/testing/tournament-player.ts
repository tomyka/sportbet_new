import type pg from 'pg';

/** One `tournament_players` row, by database ids. */
export interface TournamentPlayerRow {
  readonly tournament: number;
  readonly player: number;
  readonly switchedOff?: boolean;
  readonly adminHidden?: boolean;
  readonly fillIns?: number;
}

/**
 * A raw-SQL stand-in for what joining writes (`registerForTournament`): the
 * tournament's public league (made when there is none), the player's
 * membership of it, and their `tournament_players` row selecting it - the
 * row cannot exist without a selected league (#29). For a test that sets
 * rows up by SQL; it does nothing where the row is there already.
 */
export async function insertTournamentPlayer(
  client: Pick<pg.Pool, 'query'>,
  row: TournamentPlayerRow,
): Promise<void> {
  await client.query(
    `insert into leagues (tournament_id, name, is_public, created_at)
     select id, left(name, 255), true, date_trunc('second', now()) from tournaments where id = $1
     on conflict (tournament_id) where is_public do nothing`,
    [row.tournament],
  );
  await client.query(
    `insert into league_members (league_id, player_id, joined_at)
     select id, $2, date_trunc('second', now()) from leagues where tournament_id = $1 and is_public
     on conflict (league_id, player_id) do nothing`,
    [row.tournament, row.player],
  );
  await client.query(
    `insert into tournament_players
       (tournament_id, player_id, switched_off, admin_hidden, fill_ins, selected_league_id)
     select $1, $2, $3, $4, $5, id from leagues where tournament_id = $1 and is_public
     on conflict (tournament_id, player_id) do nothing`,
    [
      row.tournament,
      row.player,
      row.switchedOff ?? false,
      row.adminHidden ?? false,
      row.fillIns ?? 0,
    ],
  );
}
