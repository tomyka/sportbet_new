// Slice 14 (R-45, R-69, R-117): the audit page's loader - four tabs, 25 rows
// a page, newest first, the user filter on every tab, a forgotten party read
// as null, every row parsed with the domain's schema.

import { auditPageQuery, type AuditPageQuery } from '@sportbet/domain';
import { player, testPlayer } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { savePlayers, savePlayerSettings } from '../src';
import { loadAuditPage } from '../src/admin/audit';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { G7, G8, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();
const DAN = player('4');

/**
 * Sign-ins: BEN 30, CAI 2, ADA 1. Predictions: BEN 2, CAI 1. Results: ADA
 * entered two on game 7 (a score, then a postponement), CAI one on game 8,
 * one has no actor left. Admin trail: ADA changed BEN's role, ADA deleted an
 * account (forgotten), a forgotten admin changed CAI's.
 */
beforeEach(async () => {
  await saveWorld(db);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlayerSettings(
    db,
    ['1', '2', '3', '4'].map((id) => ({
      player: player(id),
      locale: 'lt',
      role: id === '1' ? ('superadmin' as const) : ('player' as const),
      lastTournament: null,
    })),
  );
  await saveGames(db, TOURNAMENT, [G7, G8]);
  await client.query(
    `insert into audit_logins (player_id, method, at)
       select 2, case when n % 2 = 0 then 'email_code' else 'register' end::audit_login_method,
              timestamptz '2026-10-01 10:00:00+00' + n * interval '1 minute'
         from generate_series(1, 30) n`,
  );
  await client.query(
    `insert into audit_logins (player_id, method, at) values
       (3, 'email_code', '2026-10-02 08:00:00+00'),
       (3, 'register', '2026-10-02 09:00:00+00'),
       (1, 'email_code', '2026-10-03 08:00:00+00')`,
  );
  await client.query(
    `insert into audit_prediction_games (player_id, game_id, home, away, old_home, old_away, at) values
       (2, 7, 80, 70, null, null, '2026-10-02 10:00:00+00'),
       (2, 7, 82, 70, 80, 70, '2026-10-02 11:00:00+00'),
       (3, 8, 60, 61, null, null, '2026-10-02 12:00:00+00')`,
  );
  await client.query(
    `insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at) values
       (1, 7, null, null, false, 88, 79, false, '2026-10-04 10:00:00+00'),
       (1, 7, 88, 79, false, null, null, true, '2026-10-04 11:00:00+00'),
       (3, 8, null, null, false, 80, 80, false, '2026-10-04 12:00:00+00'),
       (null, 8, 80, 80, false, 81, 80, false, '2026-10-04 13:00:00+00')`,
  );
  await client.query(
    `insert into audit_admin_actions (actor_id, target_id, kind, old_role, new_role, at) values
       (1, 2, 'role_change', 'player', 'results-manager', '2026-10-05 10:00:00+00'),
       (1, null, 'account_deletion', 'player', null, '2026-10-05 11:00:00+00'),
       (null, 3, 'role_change', 'player', 'superadmin', '2026-10-05 12:00:00+00')`,
  );
});

const page = (params: Record<string, string> = {}) =>
  loadAuditPage(db, auditPageQuery(params));

describe('loadAuditPage', () => {
  it('counts every tab, 25 rows to a page, newest first, the sign-ins by default', async () => {
    const data = await page();
    expect(data.counts).toEqual({
      prisijungimai: 33,
      prognozes: 3,
      rezultatai: 4,
      roles: 3,
    });
    expect(data.lastPage).toBe(2);
    expect(data.active.tab).toBe('prisijungimai');
    expect(data.active.rows).toHaveLength(25);
    const times = data.active.rows.map((row) => row.at);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(data.active.rows[0]).toEqual({
      username: 'ada',
      method: 'email_code',
      at: Date.parse('2026-10-03T08:00:00Z'),
    });
  });

  it('serves the next page, keeps the remainder only, and an empty one past the end', async () => {
    const second = await page({ logins_page: '2' });
    expect(second.active.rows).toHaveLength(8);
    expect(second.lastPage).toBe(2);
    const beyond = await page({ logins_page: '9' });
    expect(beyond.active.rows).toEqual([]);
    expect(beyond.counts.prisijungimai).toBe(33);
  });

  it('keeps no IP and names the method as the app stores it', async () => {
    const data = await page({ user: '3' });
    expect(data.active.rows).toEqual([
      {
        username: 'cai',
        method: 'register',
        at: Date.parse('2026-10-02T09:00:00Z'),
      },
      {
        username: 'cai',
        method: 'email_code',
        at: Date.parse('2026-10-02T08:00:00Z'),
      },
    ]);
  });

  it('filters every tab and every count by the user', async () => {
    const data = await page({ user: '3' });
    expect(data.counts).toEqual({
      prisijungimai: 2,
      prognozes: 1,
      rezultatai: 1,
      roles: 1,
    });
    expect(data.query.user).toBe(3);
  });

  it('shows empty tabs for a filter naming no account', async () => {
    const data = await page({ user: '99', tab: 'prognozes' });
    expect(data.counts).toEqual({
      prisijungimai: 0,
      prognozes: 0,
      rezultatai: 0,
      roles: 0,
    });
    expect(data.active.rows).toEqual([]);
    expect(data.lastPage).toBe(1);
  });

  it('lists every account by username for the filter', async () => {
    expect((await page()).users).toEqual([
      { id: 1, username: 'ada' },
      { id: 2, username: 'ben' },
      { id: 3, username: 'cai' },
      { id: 4, username: 'dan' },
    ]);
  });

  it('prognozes: the game as home and away names, the pair it replaced and the pair now', async () => {
    const data = await page({ tab: 'prognozes', user: '2' });
    expect(data.active).toEqual({
      tab: 'prognozes',
      rows: [
        {
          username: 'ben',
          home: 'Zalgiris',
          away: 'Olympiacos',
          old: { home: 80, away: 70 },
          new: { home: 82, away: 70 },
          at: Date.parse('2026-10-02T11:00:00Z'),
        },
        {
          username: 'ben',
          home: 'Zalgiris',
          away: 'Olympiacos',
          old: null,
          new: { home: 80, away: 70 },
          at: Date.parse('2026-10-02T10:00:00Z'),
        },
      ],
    });
  });

  it('rezultatai: a score, a postponement, a clear and a forgotten actor (R-69)', async () => {
    const data = await page({ tab: 'rezultatai' });
    expect(data.active).toEqual({
      tab: 'rezultatai',
      rows: [
        {
          username: null,
          home: 'Real',
          away: 'Fenerbahce',
          old: { kind: 'score', home: 80, away: 80 },
          new: { kind: 'score', home: 81, away: 80 },
          at: Date.parse('2026-10-04T13:00:00Z'),
        },
        {
          username: 'cai',
          home: 'Real',
          away: 'Fenerbahce',
          old: { kind: 'none' },
          new: { kind: 'score', home: 80, away: 80 },
          at: Date.parse('2026-10-04T12:00:00Z'),
        },
        {
          username: 'ada',
          home: 'Zalgiris',
          away: 'Olympiacos',
          old: { kind: 'score', home: 88, away: 79 },
          new: { kind: 'postponed' },
          at: Date.parse('2026-10-04T11:00:00Z'),
        },
        {
          username: 'ada',
          home: 'Zalgiris',
          away: 'Olympiacos',
          old: { kind: 'none' },
          new: { kind: 'score', home: 88, away: 79 },
          at: Date.parse('2026-10-04T10:00:00Z'),
        },
      ],
    });
  });

  it('roles: who did what to whom, a forgotten party null (R-117)', async () => {
    const data = await page({ tab: 'roles' });
    expect(data.active).toEqual({
      tab: 'roles',
      rows: [
        {
          actor: null,
          target: 'cai',
          kind: 'role_change',
          oldRole: 'player',
          newRole: 'superadmin',
          at: Date.parse('2026-10-05T12:00:00Z'),
        },
        {
          actor: 'ada',
          target: null,
          kind: 'account_deletion',
          oldRole: 'player',
          newRole: null,
          at: Date.parse('2026-10-05T11:00:00Z'),
        },
        {
          actor: 'ada',
          target: 'ben',
          kind: 'role_change',
          oldRole: 'player',
          newRole: 'results-manager',
          at: Date.parse('2026-10-05T10:00:00Z'),
        },
      ],
    });
  });

  it('roles: the user filter matches the actor or the target', async () => {
    expect((await page({ tab: 'roles', user: '1' })).counts.roles).toBe(2);
    expect((await page({ tab: 'roles', user: '3' })).counts.roles).toBe(1);
    expect((await page({ tab: 'roles', user: '2' })).counts.roles).toBe(1);
  });

  it('reads each tab on its own page', async () => {
    const query: AuditPageQuery = auditPageQuery({
      tab: 'prognozes',
      logins_page: '2',
      predictions_page: '1',
    });
    const data = await loadAuditPage(db, query);
    expect(data.active.tab).toBe('prognozes');
    expect(data.active.rows).toHaveLength(3);
  });

  it('parses every row with the domain schema: a row the schema refuses fails the page', async () => {
    await client.query(
      `insert into audit_results (player_id, game_id, old_home, old_away, old_postponed, new_home, new_away, new_postponed, at)
         values (1, 7, 1, null, false, 1, 2, false, '2026-10-06 10:00:00+00')`,
    );
    await expect(page({ tab: 'rezultatai' })).rejects.toThrow();
  });
});
