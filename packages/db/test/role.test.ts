import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/migrations';
import { useTestDatabase, withDatabaseAt } from '../src/testing';

const connection = useTestDatabase();

describe('migrations 0012-0014 (R-26 amended)', () => {
  it('give each stored admin level its role, and drop the level', async () => {
    // Through 0011_audit-prediction-games: the settings hold sportbet's levels.
    await withDatabaseAt(connection, 12, async (before) => {
      const levels = [0, 1, 5, 8, 9];
      for (const [index, level] of levels.entries()) {
        const id = index + 1;
        await before.client.query(
          `insert into players (id, username, email, name, surname)
           overriding system value values ($1, $2, $3, 'Vardas', '')`,
          [id, `p${String(id)}`, `p${String(id)}@example.test`],
        );
        await before.client.query(
          'insert into player_settings (player_id, admin_level) values ($1, $2)',
          [id, level],
        );
      }
      await runMigrations(before.url, MIGRATIONS_FOLDER);
      const roles = z
        .array(z.object({ player_id: z.int(), role: z.string() }))
        .parse(
          (
            await before.client.query(
              'select player_id, role::text as role from player_settings order by player_id',
            )
          ).rows,
        );
      expect(roles).toEqual([
        { player_id: 1, role: 'player' },
        { player_id: 2, role: 'results-manager' },
        { player_id: 3, role: 'results-manager' },
        { player_id: 4, role: 'superadmin' },
        { player_id: 5, role: 'superadmin' },
      ]);
      const columns = await before.client.query(
        `select column_name from information_schema.columns
         where table_name = 'player_settings' and column_name = 'admin_level'`,
      );
      expect(columns.rows).toEqual([]);
    });
  });

  it('a new settings row is a player unless told otherwise', async () => {
    const { client } = connection;
    await client.query(
      `insert into players (id, username, email, name, surname)
       overriding system value values (1, 'p1', 'p1@example.test', 'Vardas', '')`,
    );
    await client.query('insert into player_settings (player_id) values (1)');
    const row = await client.query(
      'select role::text as role from player_settings where player_id = 1',
    );
    expect(row.rows).toEqual([{ role: 'player' }]);
  });
});
