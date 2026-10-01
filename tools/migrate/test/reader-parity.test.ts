// The parity stage, end to end, on the synthetic dump - never production
// data - with sportbet's own app from its image at SPORTBET_TEST_TAG, on
// the reader's own MySQL, Postgres and private network.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderReport } from '../src/report';
import { runReader, type ReaderResult } from '../src/run';
import {
  IDS,
  renderDump,
  SENTINELS,
  syntheticDump,
  type Dump,
} from './fixtures/sportbet-dump';
import {
  probeFromSportbetApp,
  SPORTBET_TEST_TAG,
} from './support/reader-containers';

const OBJECT = 'sportbet-web/sportbet-20260929T021708Z-daily.sql.gz';

/**
 * Tried from inside the old app: a TCP connect to a public address (no DNS
 * needed) and a lookup of a public name. Each prints `failed` or what
 * reached out; nothing else is printed.
 */
const NO_ROUTE_OUT = [
  "$socket = @fsockopen('1.1.1.1', 443, $errno, $errstr, 5);",
  "echo 'NO-ROUTE tcp ', $socket === false ? 'failed' : 'connected', \"\\n\";",
  "$address = gethostbyname('example.com');",
  "echo 'NO-ROUTE dns ', $address === 'example.com' ? 'failed' : 'resolved', \"\\n\";",
].join('\n');

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8', windowsHide: true });

/** Runs the reader with --parity on `dump`; its result and everything it printed. */
async function parityRun(
  dump: Dump,
): Promise<{ result: ReaderResult; output: string }> {
  let output = '';
  const capture = (chunk: unknown) => {
    output += String(chunk);
    return true;
  };
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  try {
    const result = await runReader({
      fetcher: {
        fetch: (directory) => {
          const path = join(directory, 'backup.sql.gz');
          writeFileSync(path, gzipSync(renderDump(dump)));
          return Promise.resolve({ objectName: OBJECT, path });
        },
      },
      keep: false,
      now: () => new Date('2026-09-29T12:00:00Z'),
      parity: { tag: SPORTBET_TEST_TAG },
    });
    process.stdout.write(renderReport(result.report));
    process.stdout.write(JSON.stringify(result.report));
    return { result, output };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

/** The dump with cai's serija on EL h2 lost from production: one stale row. */
function withStaleRow(): Dump {
  const dump = syntheticDump();
  return {
    ...dump,
    point_results: dump.point_results.map((row) =>
      row['user_id'] === IDS.player('cai') && row['game_id'] === IDS.game(2)
        ? { ...row, streak_bonus: '0.00' }
        : row,
    ),
  };
}

describe('the parity stage, end to end on the synthetic dump', () => {
  let golden: { result: ReaderResult; output: string };
  let stale: { result: ReaderResult; output: string };

  beforeAll(async () => {
    golden = await parityRun(syntheticDump());
    stale = await parityRun(withStaleRow());
  });

  it("holds: production's rows are what sportbet's own recalculation writes, and the new code writes the same", () => {
    const { parity, problem } = golden.result.report;
    expect(problem).toBeNull();
    expect(parity?.tag).toBe(SPORTBET_TEST_TAG);
    expect(
      parity?.tournaments.map(({ tournament, counts }) => ({
        tournament,
        counts,
      })),
    ).toEqual([
      {
        tournament: 'golden-el',
        counts: {
          point_results: {
            match: 9,
            stale: 0,
            'new-code-wrong': 0,
            refused: 1,
          },
          point_standings: {
            match: 8,
            stale: 0,
            'new-code-wrong': 0,
            refused: 0,
          },
          point_survivals: {
            match: 5,
            stale: 0,
            'new-code-wrong': 0,
            refused: 0,
          },
          game_odds: { match: 3, stale: 0, 'new-code-wrong': 0, refused: 0 },
        },
      },
    ]);
    expect(golden.output).toContain('PARITY HOLDS');
    expect(golden.result.report.exitStatus).toBe(1);
  });

  it('ranks the golden league as sportbet does', () => {
    expect(golden.result.report.parity?.tournaments[0]?.rankings).toEqual([
      { league: 2, players: 3, differences: [] },
    ]);
  });

  it('finds exactly one stale row where production lost a serija', () => {
    const tournament = stale.result.report.parity?.tournaments[0];
    expect(tournament?.counts.point_results).toEqual({
      match: 8,
      stale: 1,
      'new-code-wrong': 0,
      refused: 1,
    });
    expect(tournament?.stale.point_results).toEqual({ streak_bonus: 1 });
    expect(stale.output).toContain('PARITY HOLDS');
  });

  // The security review (#11, G1): the private network is internal, so from
  // the old app's container on the real engine nothing leaves this PC - an
  // outbound TCP connect to an address and an external DNS lookup both fail.
  // The control runs the same probe in the same image on an ordinary
  // network first, where both must succeed: on a PC with no route out at
  // all the control fails, rather than the test passing for that reason.
  it('gives the old app no route out: an outbound connect and a DNS lookup both fail, where an ordinary network allows both', async () => {
    const probe = async (network: 'internal' | 'ordinary') => {
      const { exitCode, stdout } = await probeFromSportbetApp(
        NO_ROUTE_OUT,
        network,
      );
      expect(exitCode).toBe(0);
      return stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('NO-ROUTE '));
    };
    expect(await probe('ordinary')).toEqual([
      'NO-ROUTE tcp connected',
      'NO-ROUTE dns resolved',
    ]);
    expect(await probe('internal')).toEqual([
      'NO-ROUTE tcp failed',
      'NO-ROUTE dns failed',
    ]);
  });

  it("leaves no container and no network behind, the old app's included", () => {
    expect(docker('ps', '-a', '-q', '--filter', 'label=sportbet-migrate')).toBe(
      '',
    );
    expect(
      docker('network', 'ls', '-q', '--filter', 'label=sportbet-migrate'),
    ).toBe('');
  });

  it("refuses to start without the old app's image on this PC, before anything is fetched", async () => {
    const fetch = vi.fn();
    const result = await runReader({
      fetcher: { fetch },
      keep: false,
      now: () => new Date('2026-09-29T12:00:00Z'),
      parity: { tag: 'fffffff' },
    });
    expect(result.report.problem).toBe(
      "preflight: the old app's image sportbet-app:fffffff is not on this PC; build it first (README, parity)",
    );
    expect(result.report.exitStatus).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prints no sentinel name, surname, email or IP address', () => {
    for (const { output } of [golden, stale]) {
      expect(SENTINELS.filter((sentinel) => output.includes(sentinel))).toEqual(
        [],
      );
      expect(output).not.toContain('@');
    }
  });
});
