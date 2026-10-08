import { describe, expect, it } from 'vitest';
import { laravelInteger } from './laravel-integer';

describe("laravelInteger (Laravel's `integer`, FILTER_VALIDATE_INT)", () => {
  it.each([
    ['0', 0],
    ['1', 1],
    ['+1', 1],
    ['-3', -3],
    ['20', 20],
  ])('%s is %d', (text, value) => {
    expect(laravelInteger(text)).toBe(value);
  });

  it.each(['', '01', '1.0', '1e1', ' 1', 'x', '99999999999999999999'])(
    '%j is not one',
    (text) => {
      expect(laravelInteger(text)).toBeNull();
    },
  );
});
