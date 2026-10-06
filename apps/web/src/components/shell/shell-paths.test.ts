import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PREDICTION_SAVE_PATH,
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
