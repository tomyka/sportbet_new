import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { unwrap } from '../testing';
import {
  emailAddress,
  foldEmail,
  normalizeEmail,
  storedEmailAddress,
} from './email';

// sportbet's EmailIdentityTest and #41: an address is trimmed (PHP's
// trim) and lowered on every write and lookup, and never folded there.
describe('normalizeEmail', () => {
  it.each([
    ['already canonical', 'ada@example.com', 'ada@example.com'],
    ['upper case is lowered', 'Ada@Example.COM', 'ada@example.com'],
    [
      'surrounding spaces are trimmed',
      '  ada@example.com  ',
      'ada@example.com',
    ],
    ['tabs and newlines are trimmed', '\tada@example.com\n', 'ada@example.com'],
    [
      'Lithuanian letters are lowered without losing their accents',
      'Žukauskas@Example.LT',
      'žukauskas@example.lt',
    ],
  ])('%s', (_, typed, stored) => {
    expect(normalizeEmail(typed)).toBe(stored);
  });

  it('trims only what PHP trim() trims: a no-break space stays', () => {
    expect(normalizeEmail('\u00a0ada@example.com')).toBe(
      '\u00a0ada@example.com',
    );
  });
});

describe('emailAddress', () => {
  it('stores a typed address in its normalized form', () => {
    expect(unwrap(emailAddress('  Jonas@Example.LT '))).toBe(
      'jonas@example.lt',
    );
  });

  it('refuses what is no address once normalized', () => {
    expect(emailAddress('   ')).toEqual(refuse('not-an-email'));
    expect(emailAddress('jonas')).toEqual(refuse('not-an-email'));
  });
});

describe('storedEmailAddress', () => {
  it('reads a stored address as it is', () => {
    expect(unwrap(storedEmailAddress('žukauskas@example.lt'))).toBe(
      'žukauskas@example.lt',
    );
  });

  it('refuses a stored address that is not in the stored form, and never fixes it', () => {
    expect(storedEmailAddress('Jonas@example.lt')).toEqual(
      refuse('not-an-email'),
    );
    expect(storedEmailAddress(' jonas@example.lt')).toEqual(
      refuse('not-an-email'),
    );
  });
});

describe('foldEmail', () => {
  it("drops the accents of Lithuanian letters, as sportbet's utf8mb4_unicode_ci ignores them", () => {
    expect(foldEmail('ąčęėįšųūž@example.lt')).toBe('aceeisuuz@example.lt');
    expect(foldEmail('žukauskas@example.lt')).toBe(
      foldEmail('zukauskas@example.lt'),
    );
  });

  it('folds a decomposed letter as it folds the precomposed one', () => {
    expect(foldEmail('z\u030cukauskas@example.lt')).toBe(
      'zukauskas@example.lt',
    );
  });

  it('folds a full-width letter as the letter (NFKD)', () => {
    expect(foldEmail('ｊｏｎａｓ@example.lt')).toBe('jonas@example.lt');
  });

  // utf8mb4_unicode_ci's expansions and base letters for letters that do
  // not decompose: each pair is one address to sportbet's unique index.
  it.each([
    ['ß', 'ss', 'straße', 'strasse'],
    ['æ', 'ae', 'ærø', 'aero'],
    ['œ', 'oe', 'cœur', 'coeur'],
    ['ø', 'o', 'søren', 'soren'],
    ['ł', 'l', 'łukasz', 'lukasz'],
    ['đ', 'd', 'đorđe', 'dorde'],
    ['ı', 'i', 'yıldız', 'yildiz'],
    ['þ', 'th', 'þór', 'thor'],
  ])('folds %s as %s', (_, __, accented, plain) => {
    expect(foldEmail(`${accented}@example.test`)).toBe(`${plain}@example.test`);
  });
});
