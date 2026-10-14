import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase, withDatabaseAt } from '../src/testing';

const connection = useTestDatabase();

/** Migrations 0000-0016: everything before the three that add leagues. */
const BEFORE_LEAGUES = 17;

const memberships = z.array(
  z.object({
    tournament: z.string(),
    player: z.int(),
    league: z.string(),
    selected: z.boolean(),
    isGuest: z.boolean(),
    isAdmin: z.boolean(),
  }),
);

describe('migrations 0017-0019 (leagues, #29)', () => {
  // Slow by nature, as role.test.ts's: it builds a database through 0016
  // and replays every later migration.
  it('put every player in their tournament public league, selected', async () => {
    await withDatabaseAt(connection, BEFORE_LEAGUES, async (before) => {
      await before.client.query(
        `insert into tournaments (id, slug, name, format, survival)
         overriding system value
         values (1, 'euroleague-2026', 'Euroleague 2026/27', 'euroleague', true),
                (2, 'worldcup-2026', 'World Cup', 'euroleague', false)`,
      );
      for (const id of [1, 2, 3]) {
        await before.client.query(
          `insert into players (id, username, email, name, surname)
           overriding system value values ($1, $2, $3, 'Vardas', '')`,
          [id, `p${String(id)}`, `p${String(id)}@example.test`],
        );
      }
      // player 1 plays both tournaments, 2 the first, 3 the second
      await before.client.query(
        `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins)
         values (1, 1, false, 0), (2, 1, false, 0), (1, 2, false, 0), (2, 3, false, 0)`,
      );
      await runMigrations(before.url, MIGRATIONS_FOLDER);
      const rows = memberships.parse(
        (
          await before.client.query(
            `select t.slug as tournament, tp.player_id as player, l.name as league,
                    tp.selected_league_id = l.id as selected,
                    m.is_guest as "isGuest", m.is_admin as "isAdmin"
             from tournament_players tp
             join tournaments t on t.id = tp.tournament_id
             join leagues l on l.tournament_id = tp.tournament_id and l.is_public
             join league_members m on m.league_id = l.id and m.player_id = tp.player_id
             order by tp.tournament_id, tp.player_id`,
          )
        ).rows,
      );
      expect(rows).toEqual([
        {
          tournament: 'euroleague-2026',
          player: 1,
          league: 'Euroleague 2026/27',
          selected: true,
          isGuest: false,
          isAdmin: false,
        },
        {
          tournament: 'euroleague-2026',
          player: 2,
          league: 'Euroleague 2026/27',
          selected: true,
          isGuest: false,
          isAdmin: false,
        },
        {
          tournament: 'worldcup-2026',
          player: 1,
          league: 'World Cup',
          selected: true,
          isGuest: false,
          isAdmin: false,
        },
        {
          tournament: 'worldcup-2026',
          player: 3,
          league: 'World Cup',
          selected: true,
          isGuest: false,
          isAdmin: false,
        },
      ]);
      const counted = await before.client.query(
        'select (select count(*) from leagues)::int as leagues, (select count(*) from league_members)::int as members',
      );
      expect(counted.rows).toEqual([{ leagues: 2, members: 4 }]);
    });
  }, 120_000);
});

describe('the leagues schema', () => {
  async function aTournamentWithAPlayerInTheirLeague() {
    const { client } = connection;
    await client.query(
      `insert into tournaments (slug, name, format, survival)
       values ('t', 'T', 'euroleague', false)`,
    );
    await client.query(
      `insert into players (username, email, name, surname)
       values ('p', 'p@example.test', 'Vardas', '')`,
    );
    const [tournament] = z
      .array(z.object({ id: z.int() }))
      .parse((await client.query('select id from tournaments')).rows);
    const [player] = z
      .array(z.object({ id: z.int() }))
      .parse((await client.query('select id from players')).rows);
    if (tournament === undefined || player === undefined)
      throw new Error('no rows');
    const created = z
      .array(z.object({ id: z.int() }))
      .parse(
        (
          await client.query(
            `insert into leagues (tournament_id, name, is_public) values ($1, 'T', true) returning id`,
            [tournament.id],
          )
        ).rows,
      );
    const [league] = created;
    if (league === undefined) throw new Error('no league');
    await client.query(
      'insert into league_members (league_id, player_id) values ($1, $2)',
      [league.id, player.id],
    );
    await client.query(
      `insert into tournament_players (tournament_id, player_id, switched_off, fill_ins, selected_league_id)
       values ($1, $2, false, 0, $3)`,
      [tournament.id, player.id, league.id],
    );
    return { tournament: tournament.id, player: player.id, league: league.id };
  }

  it('refuse a second public league for a tournament', async () => {
    const { tournament } = await aTournamentWithAPlayerInTheirLeague();
    await expect(
      connection.client.query(
        `insert into leagues (tournament_id, name, is_public) values ($1, 'Another', true)`,
        [tournament],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allow any number of private leagues', async () => {
    const { tournament } = await aTournamentWithAPlayerInTheirLeague();
    const inserted = await connection.client.query(
      `insert into leagues (tournament_id, name, is_public) values ($1, 'A', false), ($1, 'B', false)`,
      [tournament],
    );
    expect(inserted.rowCount).toBe(2);
  });

  it('refuse a public league with an owner', async () => {
    const { client } = connection;
    await client.query(
      `insert into tournaments (slug, name, format, survival) values ('t', 'T', 'euroleague', false)`,
    );
    await client.query(
      `insert into players (username, email, name, surname) values ('p', 'p@example.test', 'V', '')`,
    );
    await expect(
      client.query(
        `insert into leagues (tournament_id, name, is_public, owner_id)
         select t.id, 'T', true, p.id from tournaments t, players p`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuse deleting a membership the player still selects', async () => {
    const { league, player } = await aTournamentWithAPlayerInTheirLeague();
    await expect(
      connection.client.query(
        'delete from league_members where league_id = $1 and player_id = $2',
        [league, player],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('refuse selecting a league of another tournament', async () => {
    const { client } = connection;
    const { tournament, player } = await aTournamentWithAPlayerInTheirLeague();
    await client.query(
      `insert into tournaments (slug, name, format, survival) values ('u', 'U', 'euroleague', false)`,
    );
    const other = z.array(z.object({ id: z.int() })).parse(
      (
        await client.query(
          `insert into leagues (tournament_id, name, is_public)
             select id, 'U', true from tournaments where slug = 'u' returning id`,
        )
      ).rows,
    );
    const [league] = other;
    if (league === undefined) throw new Error('no league');
    await client.query(
      'insert into league_members (league_id, player_id) values ($1, $2)',
      [league.id, player],
    );
    await expect(
      client.query(
        'update tournament_players set selected_league_id = $1 where tournament_id = $2 and player_id = $3',
        [league.id, tournament, player],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('let one statement delete a membership with the tournament row that selects it', async () => {
    const { client } = connection;
    const { player } = await aTournamentWithAPlayerInTheirLeague();
    await client.query(
      `with gone as (delete from tournament_players where player_id = $1)
       delete from league_members where player_id = $1`,
      [player],
    );
    const left = await client.query(
      'select (select count(*) from league_members)::int as members, (select count(*) from tournament_players)::int as players',
    );
    expect(left.rows).toEqual([{ members: 0, players: 0 }]);
  });
});
