import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_RESULTS_ALL_PATH,
  ADMIN_RESULTS_PATH,
  LEADERBOARD_PATH,
  MAIN_PATH,
  PLAYER_HOME,
  PREDICTION_SAVE_PATH,
  RECALCULATE_PATH,
  UPDATE_RESULT_PATH,
  predictionGamePath,
  PREDICTIONS_PATH,
  predictionsPathFor,
  SHELL_LINKS,
} from './shell-paths';

const APP = join(import.meta.dirname, '..', '..', 'app');

// #16: each player link is listed only once its page (or route) exists.
it('lists a player link only once its page exists', () => {
  const served = (href: string) =>
    ['page.tsx', 'route.ts'].some((file) =>
      existsSync(join(APP, ...href.split('/'), file)),
    );
  const missing = Object.values(SHELL_LINKS)
    .flatMap((href) => (href === null ? [] : [href]))
    .filter((href) => !served(href));
  expect(missing).toEqual([]);
});

it('sends a player home to /main, the game page, since slice 8 serves it', () => {
  expect(MAIN_PATH).toBe('/main');
  expect(PLAYER_HOME).toBe(MAIN_PATH);
  expect(existsSync(join(APP, 'main', 'page.tsx'))).toBe(true);
});

it("serves the leaderboard at sportbet's /leaderboard (slice 8)", () => {
  expect(LEADERBOARD_PATH).toBe('/leaderboard');
  expect(existsSync(join(APP, 'leaderboard', 'page.tsx'))).toBe(true);
});

it('links "Keisti turnyrą" since slice 5 serves it', () => {
  expect(SHELL_LINKS.tournamentExit).toBe('/tournaments/exit');
});

it("serves sign-in and sign-out at sportbet's URLs", () => {
  expect(existsSync(join(APP, 'login', 'route.ts'))).toBe(true);
  expect(existsSync(join(APP, 'logout', 'route.ts'))).toBe(true);
});

describe('the prediction paths (routes/web.php)', () => {
  it('the list, its round, the save, and a game', () => {
    expect(PREDICTIONS_PATH).toBe('/prediction/results');
    expect(predictionsPathFor(21)).toBe('/prediction/results?event=21');
    expect(predictionsPathFor('all')).toBe('/prediction/results?event=all');
    expect(PREDICTION_SAVE_PATH).toBe('/prediction/results/save');
    expect(predictionGamePath(9001)).toBe('/prediction/game/9001');
  });
});

describe('the admin paths (routes/web.php, slice 7)', () => {
  it("the results pages, the save and the recalculation, at sportbet's URLs; the shell links administration", () => {
    expect(ADMIN_RESULTS_PATH).toBe('/admin/results');
    expect(ADMIN_RESULTS_ALL_PATH).toBe('/admin/resultsAll');
    expect(UPDATE_RESULT_PATH).toBe('/admin/updateResult');
    expect(RECALCULATE_PATH).toBe('/admin/recalculateAllGamePoints');
    expect(SHELL_LINKS.admin).toBe('/admin/index');
  });
});
