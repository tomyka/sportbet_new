import { describe, expect, it } from 'vitest';
import { checkAmount } from './amount';

const failedBy = (text: string) => {
  const checked = checkAmount(text);
  return checked.ok ? [] : checked.failed;
};

const centsOf = (text: string) => {
  const checked = checkAmount(text);
  if (!checked.ok) throw new Error(`${text} was refused`);
  return checked.cents;
};

describe('checkAmount, as Laravel numeric|decimal:0,2|min:0|max:999999.99', () => {
  it.each([
    ['10.5', 1050],
    ['20', 2000],
    ['0', 0],
    ['999999.99', 99_999_999],
    ['.5', 50],
    ['5.', 500],
    ['+5', 500],
    ['-0', 0],
    ['-0.00', 0],
    ['007', 700],
    ['0.05', 5],
  ])('accepts %s as %i cents', (text, expected) => {
    expect(centsOf(text)).toBe(expected);
  });

  it.each([
    ['dvidešimt', ['numeric', 'decimal']],
    ['', ['numeric', 'decimal']],
    ['.', ['numeric', 'decimal']],
    ['1.5.3', ['numeric', 'decimal']],
    ['0x1A', ['numeric', 'decimal']],
    ['1e2', ['decimal']],
    ['1e-5', ['decimal']],
    ['-5', ['min']],
    ['-0.001', ['decimal', 'min']],
    ['10.555', ['decimal']],
    ['1000000', ['max']],
    ['999999.991', ['decimal', 'max']],
    ['1e7', ['decimal', 'max']],
    ['1e2000', ['decimal', 'min', 'max']],
    ['-1e2000', ['decimal', 'min', 'max']],
  ] as const)('refuses %j by %j', (text, rules) => {
    expect(failedBy(text)).toEqual(rules);
  });

  it('measures a text that is no number by its length, so min holds', () => {
    expect(failedBy('x'.repeat(1_000_000))).toEqual([
      'numeric',
      'decimal',
      'max',
    ]);
    expect(failedBy('x'.repeat(999_999))).toEqual(['numeric', 'decimal']);
  });

  it('keeps a negative number that is not zero below min', () => {
    expect(failedBy('-1e-3')).toEqual(['decimal', 'min']);
    expect(failedBy('-0e5')).toEqual(['decimal']);
  });
});
