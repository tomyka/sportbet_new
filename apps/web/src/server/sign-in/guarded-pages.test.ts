import { describe, expect, it } from 'vitest';
import {
  GUARDED_PAGES,
  guardedReturnPath,
  signInAndReturn,
} from './guarded-pages';

// One way to guard a page: the /login address that brings a guest back,
// built from the page's own entry in GUARDED_PAGES.

describe('signInAndReturn', () => {
  it("sends a guest to sign in with the page's own path to return to", () => {
    expect(signInAndReturn('registerForm', 'euroleague-2026-27')).toBe(
      `/login?intended=${encodeURIComponent('/tournament/euroleague-2026-27/register')}`,
    );
    expect(signInAndReturn('predictions')).toBe(
      `/login?intended=${encodeURIComponent('/prediction/results')}`,
    );
    expect(signInAndReturn('predictions', 21)).toBe(
      `/login?intended=${encodeURIComponent('/prediction/results?event=21')}`,
    );
    expect(signInAndReturn('predictions', 'all')).toBe(
      `/login?intended=${encodeURIComponent('/prediction/results?event=all')}`,
    );
    expect(signInAndReturn('predictionGame', 9001)).toBe(
      `/login?intended=${encodeURIComponent('/prediction/game/9001')}`,
    );
  });

  it("drops the return when the arguments are not the page's shape: sign-in then ends at home", () => {
    expect(signInAndReturn('registerForm', 'Not_A_Slug')).toBe('/login');
    expect(signInAndReturn('predictionGame', 0)).toBe('/login');
    expect(signInAndReturn('predictions', 0)).toBe('/login');
  });
});

// The domain's one reading of an id (idFromText): the matchers take what
// the pages and the save take, Postgres' integer cap included.
describe('GUARDED_PAGES matchers read ids as the domain does', () => {
  it('an id past 2147483647 is no page to return to', () => {
    expect(guardedReturnPath('/prediction/game/2147483647')).toBe(
      '/prediction/game/2147483647',
    );
    expect(guardedReturnPath('/prediction/game/2147483648')).toBeNull();
    expect(
      guardedReturnPath('/prediction/results?event=2147483648'),
    ).toBeNull();
  });

  it('builds every page to a path its own matcher keeps, the bare list included', () => {
    for (const path of [
      GUARDED_PAGES.registerForm.path('euroleague-2026-27'),
      GUARDED_PAGES.predictions.path(),
      GUARDED_PAGES.predictions.path(21),
      GUARDED_PAGES.predictions.path('all'),
      GUARDED_PAGES.predictionGame.path(9001),
    ]) {
      expect(guardedReturnPath(path)).toBe(path);
    }
  });
});

describe('the standings page (slice 9)', () => {
  it('a guest signs in and comes back to the bare page; no other shape is kept', () => {
    expect(signInAndReturn('standings')).toBe(
      `/login?intended=${encodeURIComponent('/prediction/standings')}`,
    );
    expect(guardedReturnPath(GUARDED_PAGES.standings.path())).toBe(
      '/prediction/standings',
    );
    expect(guardedReturnPath('/prediction/standings?x=1')).toBeNull();
    expect(guardedReturnPath('/prediction/standings/save')).toBeNull();
    expect(guardedReturnPath('/prediction/standings/reorder')).toBeNull();
  });
});
