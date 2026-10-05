import { describe, expect, it } from 'vitest';
import type { CookieOptions } from '../cookies';
import { forgetIntended, readIntended, rememberIntended } from './intended';

function jar() {
  const values = new Map<string, string>();
  return {
    get: (name: string) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string, options: CookieOptions) => {
      if (options.maxAge === 0) values.delete(name);
      else values.set(name, value);
    },
  };
}

// AuthenticatedSessionController::create and RegisteredUserController::create:
// a ?tournament= is remembered for registration (intended_tournament).
describe('the tournament a guest arrived to join', () => {
  it('remembers a slug, and forgets it', () => {
    const cookies = jar();
    rememberIntended(cookies, 'euroleague-2026-27');
    expect(readIntended(cookies)).toBe('euroleague-2026-27');
    forgetIntended(cookies);
    expect(readIntended(cookies)).toBeNull();
  });

  it('keeps nothing that is not a slug, and keeps the one it had', () => {
    const cookies = jar();
    rememberIntended(cookies, 'Euroleague 2026');
    rememberIntended(cookies, null);
    expect(readIntended(cookies)).toBeNull();
    rememberIntended(cookies, 'euroleague-2026-27');
    rememberIntended(cookies, '');
    expect(readIntended(cookies)).toBe('euroleague-2026-27');
  });
});
