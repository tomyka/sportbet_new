import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

// #16's hardened check for sportbet's redirect()->intended: only a path on
// this site, judged as the browser will resolve it.

describe('safeReturnPath', () => {
  it.each([
    [
      '/tournament/euroleague-2026-27/register',
      '/tournament/euroleague-2026-27/register',
    ],
    ['/', '/'],
    ['/a/./b/../c?x=1', '/a/c?x=1'],
  ] as const)('return path: %s is kept as %s', (typed, kept) => {
    expect(safeReturnPath(typed)).toBe(kept);
  });

  it.each([
    ['another origin, protocol-relative', '//evil.example'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a dot segment hiding a second slash', '/.//evil.example'],
    ['a parent segment hiding a second slash', '/a/..//evil.example'],
    ['encoded dots hiding a second slash', '/%2e%2e//evil.example'],
    ['an absolute URL', 'https://evil.example/'],
    ['a script URL', 'javascript:alert(1)'],
    ['a relative path', 'tournament/x'],
    ['nothing', ''],
    ['no value', null],
  ] as const)('return path: refuses %s', (_label, typed) => {
    expect(safeReturnPath(typed)).toBeNull();
  });

  it('return path: refuses a control character or a backslash anywhere', () => {
    expect(safeReturnPath(`/a${String.fromCharCode(10)}b`)).toBeNull();
    expect(safeReturnPath(`/a${String.fromCharCode(0)}b`)).toBeNull();
    expect(
      safeReturnPath(`/${String.fromCharCode(9)}/evil.example`),
    ).toBeNull();
    expect(safeReturnPath('/a\\b')).toBeNull();
  });

  it('return path: refuses one longer than 2,000 characters', () => {
    expect(safeReturnPath(`/${'a'.repeat(2000)}`)).toBeNull();
  });
});
