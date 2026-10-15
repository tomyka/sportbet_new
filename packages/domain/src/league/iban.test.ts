import { describe, expect, it } from 'vitest';
import { ibanCompact, ibanForDisplay, isValidIban } from './iban';

// sportbet's tests/Unit/Support/IbanTest.php, vector for vector.
describe('isValidIban', () => {
  it.each([
    'LT121000011101001000',
    'LT12 1000 0111 0100 1000',
    ' lt12 1000 0111 0100 1000 ',
    'DE89370400440532013000',
    'IE29AIBK93115212345678',
    'GB82WEST12345698765432',
  ])('accepts %j', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each([
    ['a transposed pair of digits', 'LT121000011101001080'],
    ['a wrong last digit', 'LT121000011101001001'],
    ['wrong check digits', 'LT131000011101001000'],
    ['too short', 'LT1210000'],
    ['35 characters', 'LT12100001110100100000000000000000000'.slice(0, 35)],
    ['hyphens', 'LT12-1000-0111-0100-1000'],
    ['empty', ''],
    ['digits first', '12LT1000011101001000'],
  ])('refuses %s', (_label, iban) => {
    expect(isValidIban(iban)).toBe(false);
  });
});

describe('ibanCompact', () => {
  it('strips every whitespace run and upper-cases', () => {
    expect(ibanCompact(' lt12 1000 0111 0100 1000 ')).toBe(
      'LT121000011101001000',
    );
    expect(ibanCompact('lt12 1000　0111\t0100\n1000')).toBe(
      'LT121000011101001000',
    );
  });

  it('upper-cases ASCII only, as PHP 8 strtoupper', () => {
    expect(ibanCompact('ß')).toBe('ß');
    expect(ibanCompact('é')).toBe('é');
  });
});

describe('ibanForDisplay', () => {
  it('groups in fours', () => {
    expect(ibanForDisplay('gb82west12345698765432')).toBe(
      'GB82 WEST 1234 5698 7654 32',
    );
    expect(ibanForDisplay('LT121000011101001000')).toBe(
      'LT12 1000 0111 0100 1000',
    );
  });

  it('is empty for nothing', () => {
    expect(ibanForDisplay('')).toBe('');
    expect(ibanForDisplay('  ')).toBe('');
  });
});
