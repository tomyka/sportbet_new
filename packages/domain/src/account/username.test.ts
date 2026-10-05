import { describe, expect, it } from 'vitest';
import { foldUsername, isUsernameTaken } from './username';

// RegisteredUserController::createAccount asks
// User::where('username', ...) under utf8mb4_unicode_ci: case and accents
// ignored, trailing spaces ignored (a PAD SPACE collation).
describe('foldUsername', () => {
  it.each([
    ['Naujoke', 'naujoke'],
    ['NAUJOKĖ', 'naujoke'],
    ['Žilvinas', 'zilvinas'],
    ['ĄČĘĖĮŠŲŪŽ', 'aceeisuuz'],
    ['STRASSE', 'straße'],
    ['jonas ', 'jonas'],
  ])('username: %s and %s are one username', (a, b) => {
    expect(foldUsername(a)).toBe(foldUsername(b));
  });

  it.each([
    ['jonas', 'jonas2'],
    ['jonas', ' jonas'],
    ['jonas', 'jonas\t'],
    ['jonas', 'jonas.k'],
  ])('username: %s and %s are two', (a, b) => {
    expect(foldUsername(a)).not.toBe(foldUsername(b));
  });
});

// utf8mb4_unicode_ci gives Default_Ignorable_Code_Point characters no
// weight: a joiner, a soft hyphen, a word joiner or a direction override
// never tells two usernames apart.
describe('foldUsername and the ignorable characters', () => {
  it.each([
    ['a zero width joiner', 'To\u200Dmas'],
    ['a soft hyphen', 'To\u00ADmas'],
    ['a word joiner', 'Tomas\u2060'],
    ['a right-to-left override', '\u202ETomas'],
  ])('username: Tomas with %s is Tomas', (_label, typed) => {
    expect(foldUsername(typed)).toBe(foldUsername('Tomas'));
  });
});

// RegisteredUserController::createAccount: User::where('username', ...)
// ->exists(), under the collation.
describe('isUsernameTaken', () => {
  const EXISTING = ['ada', 'Tomas'];

  it.each(['ada', 'ADA', 'Ad\u00E0', 'ada ', 'To\u200Dmas'])(
    'username: %s is taken beside ada and Tomas',
    (wanted) => {
      expect(isUsernameTaken(EXISTING, wanted)).toBe(true);
    },
  );

  it('username: another is free, and nothing is taken where nobody is', () => {
    expect(isUsernameTaken(EXISTING, 'adas')).toBe(false);
    expect(isUsernameTaken([], 'ada')).toBe(false);
  });
});
