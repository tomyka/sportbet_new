import { describe, expect, it } from 'vitest';
import { phpTrim } from './php-trim';

describe('phpTrim', () => {
  it('strips space, tab, newline, return, NUL and vertical tab from both ends', () => {
    expect(phpTrim(' \t\n\r\0\x0Bab c\x0B\0\r\n\t ')).toBe('ab c');
  });

  it('leaves other white space alone', () => {
    expect(phpTrim(' x　')).toBe(' x　');
  });

  it('is empty for only trimmed characters and for nothing', () => {
    expect(phpTrim(' \t ')).toBe('');
    expect(phpTrim('')).toBe('');
  });
});
