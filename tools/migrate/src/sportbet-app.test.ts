import { describe, expect, it } from 'vitest';
import {
  OLD_APP_SCRIPT,
  parityOptionOf,
  parseOldAppOutput,
} from './sportbet-app';

const STEPS = ['PARITY-STEP recalculated', 'PARITY-STEP standings'];
const RANKINGS =
  'PARITY-RANKINGS [{"league":2,"user":1,"rank":1,"total":"1934.00"},{"league":2,"user":3,"rank":2,"total":"-0.50"}]';

const LEADERBOARD =
  'PARITY-LEADERBOARD [{"user":3,"rank":1,"total":"427.50"},{"user":1,"rank":2,"total":"260.00"}]';

const printed = (...lines: string[]) => [...STEPS, ...lines].join('\n');

describe("the old app's output", () => {
  it('reads the rankings and the leaderboard as ids, ranks and totals to the cent, whatever else tinker prints', () => {
    expect(
      parseOldAppOutput(
        0,
        ['a notice', ...STEPS, RANKINGS, LEADERBOARD, ''].join('\r\n'),
      ),
    ).toEqual({
      ok: true,
      value: {
        ranks: [
          { league: 2, player: '1', rank: 1, totalCents: 193_400 },
          { league: 2, player: '3', rank: 2, totalCents: -50 },
        ],
        leaderboard: [
          { player: '3', rank: 1, totalCents: 42_750 },
          { player: '1', rank: 2, totalCents: 26_000 },
        ],
      },
    });
  });

  it('refuses output without the leaderboard, or with one that is not JSON or does not parse', () => {
    expect(parseOldAppOutput(0, printed(RANKINGS))).toEqual({
      ok: false,
      refusal: 'printed no leaderboard',
    });
    expect(
      parseOldAppOutput(0, printed(RANKINGS, 'PARITY-LEADERBOARD [')),
    ).toEqual({ ok: false, refusal: 'printed a leaderboard that is not JSON' });
    expect(
      parseOldAppOutput(
        0,
        printed(RANKINGS, 'PARITY-LEADERBOARD [{"user":"ada"}]'),
      ),
    ).toEqual({
      ok: false,
      refusal:
        'printed a leaderboard that does not parse (ZodError: 3 issues; first: user invalid_type (expected number))',
    });
    expect(
      parseOldAppOutput(
        0,
        printed(
          RANKINGS,
          'PARITY-LEADERBOARD [{"user":1,"rank":1,"total":"1.005"}]',
        ),
      ),
    ).toEqual({
      ok: false,
      refusal: 'printed a total that is not a decimal (too-many-places)',
    });
  });

  it('says only the exit code and the steps done when the old app fails, never what it printed', () => {
    const failed = `PARITY-STEP recalculated\nSQLSTATE[23000]: 'sentinel.ada@example.invalid'`;
    expect(parseOldAppOutput(1, failed)).toEqual({
      ok: false,
      refusal: 'exited with 1 after 1 of 3 steps',
    });
  });

  it('refuses output that stops before the rankings', () => {
    expect(parseOldAppOutput(0, printed())).toEqual({
      ok: false,
      refusal: 'finished 2 of 3 steps',
    });
  });

  it('refuses rankings that are not JSON, do not parse, or hold a total with more than two places', () => {
    expect(parseOldAppOutput(0, printed('PARITY-RANKINGS {'))).toEqual({
      ok: false,
      refusal: 'printed rankings that are not JSON',
    });
    expect(
      parseOldAppOutput(0, printed('PARITY-RANKINGS [{"league":2}]')),
    ).toEqual({
      ok: false,
      refusal:
        'printed rankings that do not parse (ZodError: 3 issues; first: user invalid_type (expected number))',
    });
    expect(
      parseOldAppOutput(
        0,
        printed(
          'PARITY-RANKINGS [{"league":2,"user":1,"rank":1,"total":"1.005"}]',
        ),
      ),
    ).toEqual({
      ok: false,
      refusal: 'printed a total that is not a decimal (too-many-places)',
    });
  });
});

describe('--parity and --sportbet-tag', () => {
  it('takes neither, or both with a commit', () => {
    expect(parityOptionOf(false, undefined)).toEqual({ ok: true, value: null });
    expect(parityOptionOf(true, '3eb95e7')).toEqual({
      ok: true,
      value: { tag: '3eb95e7' },
    });
  });

  it('refuses one without the other, and a tag that is not a commit', () => {
    expect(parityOptionOf(true, undefined)).toEqual({
      ok: false,
      refusal: '--parity needs --sportbet-tag <commit>',
    });
    expect(parityOptionOf(false, '3eb95e7')).toEqual({
      ok: false,
      refusal: '--sportbet-tag needs --parity',
    });
    expect(parityOptionOf(true, 'latest')).toEqual({
      ok: false,
      refusal: '--sportbet-tag is a commit of sportbet: 7 to 40 hex digits',
    });
  });
});

describe("the old app's script", () => {
  it("calls sportbet 3eb95e7's own recalculations and ranking, every member visible", () => {
    expect(OLD_APP_SCRIPT).toContain(
      'app(App\\Services\\Recalculation::class)->all();',
    );
    expect(OLD_APP_SCRIPT).toContain(
      'app(App\\Http\\Controllers\\PointStandingController::class)->updateStandingPoints();',
    );
    expect(OLD_APP_SCRIPT).toContain(
      '->getAllUserPoints((int) $league, PHP_INT_MAX)',
    );
    expect(OLD_APP_SCRIPT).toContain(
      'App\\Support\\Ranking::leaderboardTotal($row)',
    );
  });

  it("ranks /leaderboard by sportbet's own PlayerTotals over the Euroleague tournaments the reader loads, and prints it last", () => {
    expect(OLD_APP_SCRIPT).toContain(
      'App\\Support\\PlayerTotals::ranked(App\\Support\\PlayerTotals::allTime()',
    );
    expect(OLD_APP_SCRIPT).toContain(
      "->where('standings_format', 'euroleague')",
    );
    expect(OLD_APP_SCRIPT.split('\n').at(-1)).toBe(
      'echo \'PARITY-LEADERBOARD \', json_encode($board), "\\n";',
    );
  });

  it('prints ids, ranks and totals only: never a username, a name or an email', () => {
    const printedKeys = [...OLD_APP_SCRIPT.matchAll(/'(\w+)' =>/g)].map(
      ([, key]) => key,
    );
    expect(printedKeys).toEqual([
      'league',
      'user',
      'rank',
      'total',
      'user',
      'rank',
      'total',
    ]);
    expect(OLD_APP_SCRIPT).not.toMatch(/username|surname|email|'name'/);
  });
});
