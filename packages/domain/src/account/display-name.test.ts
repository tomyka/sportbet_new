import { describe, expect, it } from 'vitest';
import { displayInitials, displayName } from './display-name';

// sportbet's partials/rail-account: "{name} {surname's first letter}." and
// the two initials.
describe('displayName', () => {
  it('shows the name and the first letter of the surname, and never the surname itself', () => {
    expect(displayName({ name: 'Jonas', surname: 'Petraitis' })).toBe(
      'Jonas P.',
    );
  });

  it('takes a Lithuanian first letter whole, where sportbet took its first byte', () => {
    expect(displayName({ name: 'žilvinas', surname: 'Šimkus' })).toBe(
      'žilvinas Š.',
    );
  });

  it('shows the name alone when there is no surname, as a Google sign-up leaves it', () => {
    expect(displayName({ name: 'Jonas', surname: '' })).toBe('Jonas');
  });
});

describe('displayInitials', () => {
  it('takes the first letter of the name and of the surname, upper case', () => {
    expect(displayInitials({ name: 'Jonas', surname: 'Petraitis' })).toBe('JP');
    expect(displayInitials({ name: 'žilvinas', surname: 'Šimkus' })).toBe('ŽŠ');
  });

  it('takes a letter outside the BMP whole', () => {
    expect(displayInitials({ name: '𝒜da', surname: '' })).toBe('𝒜');
  });

  it('is the name initial alone with no surname, and empty with neither', () => {
    expect(displayInitials({ name: 'Jonas', surname: '' })).toBe('J');
    expect(displayInitials({ name: '', surname: '' })).toBe('');
  });
});
