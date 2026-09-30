// The whole reader on a synthetic dump built from sportbet's golden scenario
// - never production data - on a real MySQL from the pinned image and a real
// Postgres. The fetch step is the one seam: it hands over the fixture file.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  createDb,
  findTournamentBySlug,
  loadTournamentInputs,
  loadTournamentPoints,
  type DbHandle,
  type PointsSource,
} from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import {
  GOLDEN_POINTS,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  snapshotOf,
  unwrap,
} from '@sportbet/domain/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderReport } from '../src/report';
import { runReader, WORKSPACE_PREFIX, type ReaderResult } from '../src/run';
import {
  DUMP_IDS,
  renderDump,
  SENTINELS,
  syntheticDump,
  UNSCORED_GAME,
} from './fixtures/sportbet-dump';

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true });
const volumes = () => docker('volume', 'ls', '-q').split('\n').filter(Boolean);
const workspaces = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(WORKSPACE_PREFIX));

let result: ReaderResult;
let output = '';
let volumesBefore: string[] = [];
let database: DbHandle;
let tournament: Tournament;

beforeAll(async () => {
  volumesBefore = volumes();
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  try {
    result = await runReader({
      fetcher: {
        fetch: (directory) => {
          const path = join(directory, 'backup.sql.gz');
          writeFileSync(path, gzipSync(renderDump(syntheticDump())));
          return Promise.resolve({ objectName: OBJECT, path });
        },
      },
      keep: true,
      now: () => new Date('2026-09-29T12:00:00Z'),
    });
    process.stdout.write(renderReport(result.report));
    process.stdout.write(JSON.stringify(result.report));
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
  if (result.kept === null) {
    throw new Error(
      `the reader kept no database: ${String(result.report.problem)}`,
    );
  }
  database = createDb(result.kept.url);
  const found = await findTournamentBySlug(database.db, 'golden-el');
  if (found === undefined) throw new Error('golden-el was not loaded');
  tournament = found;
});

afterAll(async () => {
  await database.close();
  await result.kept?.stop();
});

const points = async (source: PointsSource) => {
  const rows = await loadTournamentPoints(database.db, tournament, source);
  return snapshotOf(
    { ...rows, odds: rows.odds.filter(({ game }) => game !== UNSCORED_GAME) },
    DUMP_IDS,
  );
};

describe('the reader, end to end on a synthetic dump', () => {
  it('reports the dump it read, and exits 1: the fixture has refusals', () => {
    expect(result.report.dump).toMatchObject({
      object: OBJECT,
      ageHours: 9,
      stale: false,
      engine: 'mysql 26.7.0',
      image: 'mysql:26.7.0',
    });
    expect(result.report.problem).toBeNull();
    expect(result.report.exitStatus).toBe(1);
  });

  it("counts every table's rows: in the dump, read, loaded, skipped and refused", () => {
    const counts = Object.fromEntries(
      result.report.tables.map(
        ({ table, inDump, read, loaded, skipped, refused }) => [
          table,
          { inDump, read, loaded, skipped, refused },
        ],
      ),
    );
    const euroleagueOnly = (
      inDump: number,
      loaded: number,
      footballRows: number,
    ) => ({
      inDump,
      read: inDump,
      loaded,
      skipped: { 'not-euroleague': footballRows },
      refused: {},
    });
    expect(counts).toEqual({
      tournaments: euroleagueOnly(2, 1, 1),
      events: euroleagueOnly(3, 2, 1),
      teams: euroleagueOnly(6, 4, 2),
      games: euroleagueOnly(5, 4, 1),
      game_odds: {
        inDump: 7,
        read: 7,
        loaded: 4,
        skipped: { 'not-euroleague': 1, 'duplicate-equal': 1 },
        refused: { 'duplicate-key': 1 },
      },
      users: {
        inDump: 6,
        read: 6,
        loaded: 4,
        skipped: { 'in-no-loaded-tournament': 2 },
        refused: {},
      },
      user_settings: {
        inDump: 6,
        read: 6,
        loaded: 4,
        skipped: { 'user-not-loaded': 2 },
        refused: {},
      },
      leagues: euroleagueOnly(2, 1, 1),
      league_members: euroleagueOnly(6, 4, 2),
      prediction_results: {
        inDump: 14,
        read: 14,
        loaded: 10,
        skipped: { 'not-euroleague': 2 },
        refused: { orphan: 1, 'bad-generated': 1 },
      },
      prediction_standings: euroleagueOnly(9, 8, 1),
      prediction_survivals: {
        inDump: 14,
        read: 14,
        loaded: 5,
        skipped: { 'not-euroleague': 2, 'seeded-slot-without-event': 7 },
        refused: {},
      },
      point_results: euroleagueOnly(10, 9, 1),
      point_standings: euroleagueOnly(9, 8, 1),
      point_survivals: euroleagueOnly(6, 5, 1),
    });
  });

  it('loads the golden inputs, mapped through sportbetColumns and the stored factories', async () => {
    const loaded = unwrap(
      await loadTournamentInputs(database.db, tournament, {
        odds: 'from-votes',
        survival: 'picks',
      }),
    );
    const golden = goldenInputs({}, DUMP_IDS);
    expect(loaded.season.rounds).toEqual(golden.season.rounds);
    expect(
      loaded.season.games.filter(({ id }) => id !== UNSCORED_GAME),
    ).toEqual(golden.season.games);
    expect(loaded.players).toEqual(golden.players);
    expect(loaded.standings).toEqual(golden.standings);
    expect(loaded.outcomes.teams).toEqual(golden.outcomes.teams);
    expect(loaded.survival).toEqual(golden.survival);
  });

  it("loads production's points rows as golden-points.json's 25 Euroleague entries", async () => {
    expect(await points('production')).toEqual(GOLDEN_POINTS);
  });

  it('recalculates the sportbet rows to golden-points.json, from the stored odds and survival rows', async () => {
    expect(await points('sportbet')).toEqual(GOLDEN_POINTS);
  });

  it('recalculates the ruled rows as the catalogue lists, every place unscored while the table is not marked final (R-14)', async () => {
    // sportbet does not record whether its table is final, so the reader
    // loads it as not final; the ruled set then pays no place yet (ST-8,
    // R-14, unscoredPlaceStoresNull). Everything else is the catalogue's.
    const notFinal = {
      ...GOLDEN_POINTS_RULED,
      point_standings: Object.fromEntries(
        Object.entries(GOLDEN_POINTS_RULED.point_standings).map(
          ([key, row]) => [
            key,
            { ...row, group_position_points: null, group_position_odds: null },
          ],
        ),
      ),
    };
    expect(await points('ruled')).toEqual(notFinal);
    expect(result.report.recalculations).toEqual([
      { tournament: 2, rules: 'sportbet', refusal: null },
      { tournament: 2, rules: 'ruled', refusal: null },
    ]);
  });

  it('prints no sentinel name, surname, email or IP address, in the report or the JSON report', () => {
    expect(output).toContain('sportbet production-copy load report');
    expect(SENTINELS.filter((sentinel) => output.includes(sentinel))).toEqual(
      [],
    );
    expect(output).not.toContain('@');
  });

  it('loads no sentinel into Postgres: a pg_dump of it holds none', () => {
    const url = new URL(result.kept?.url ?? '');
    const dumped = execFileSync(
      'docker',
      [
        'exec',
        '-e',
        'PGPASSWORD',
        result.kept?.containerId ?? '',
        'pg_dump',
        '--username',
        decodeURIComponent(url.username),
        url.pathname.slice(1),
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
      },
    );
    expect(dumped).toContain('COPY public.players');
    expect(SENTINELS.filter((sentinel) => dumped.includes(sentinel))).toEqual(
      [],
    );
    expect(dumped).not.toContain('@');
  });

  it('stores exactly the id and the username of a player', async () => {
    const columns = await database.db.execute(
      "select column_name from information_schema.columns where table_name = 'players' order by ordinal_position",
    );
    expect(
      z
        .array(z.object({ column_name: z.string() }))
        .parse(columns.rows)
        .map(({ column_name }) => column_name),
    ).toEqual(['id', 'username']);
  });

  it('leaves nothing behind once the kept Postgres is stopped: no dump, no labelled container, no volume', async () => {
    await database.close();
    database = { db: database.db, close: () => Promise.resolve() };
    expect(workspaces()).toEqual([]);
    expect(await result.kept?.stop()).toEqual([]);
    expect(docker('ps', '-a', '-q', '--filter', 'label=sportbet-migrate')).toBe(
      '',
    );
    expect(
      volumes().filter((volume) => !volumesBefore.includes(volume)),
    ).toEqual([]);
    expect(existsSync(join(tmpdir(), 'backup.sql.gz'))).toBe(false);
  });
});
