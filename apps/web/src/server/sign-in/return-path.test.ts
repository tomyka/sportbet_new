import { describe, expect, it } from 'vitest';
import {
  guardedReturnPath,
  readReturn,
  registerPath,
  rememberReturn,
  safeReturnPath,
} from './return-path';

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

// Security review M1: only the shape of a page that sends a guest to
// sign in is kept - today the tournament registration form - and
// safeReturnPath still checks it behind that.
describe('guardedReturnPath', () => {
  it('return path: keeps a tournament registration form', () => {
    expect(guardedReturnPath('/tournament/euroleague-2026-27/register')).toBe(
      '/tournament/euroleague-2026-27/register',
    );
  });

  it.each([
    '/tournaments/exit',
    '/tournament/x/enter',
    '/tournament/x/register?y=1',
    '/tournament/x/register#y',
    '/tournament/x/register/',
    '/tournament/Not_A_Slug/register',
    '/tournament/a/b/register',
    '/tournament/./register',
    '/tournament/%2e%2e/register',
    '/',
    '//evil.example/tournament/x/register',
    '',
    null,
  ])('return path: refuses %s', (typed) => {
    expect(guardedReturnPath(typed)).toBeNull();
  });
});

// Security review L2: a path is kept only from the /login that names it.
describe('remembering and reading it', () => {
  function jar(initial?: string) {
    const values = new Map<string, string>();
    if (initial !== undefined) values.set('__Host-sb_return', initial);
    const written: { value: string; maxAge: number }[] = [];
    return {
      written,
      get: (name: string) => {
        const value = values.get(name);
        return value === undefined ? undefined : { value };
      },
      set: (name: string, value: string, options: { maxAge: number }) => {
        values.set(name, value);
        written.push({ value, maxAge: options.maxAge });
      },
    };
  }

  it('return path: a /login with a guarded page keeps it, for 15 minutes', () => {
    const cookies = jar();
    rememberReturn(cookies, '/tournament/x/register');
    expect(cookies.written).toEqual([
      { value: '/tournament/x/register', maxAge: 900 },
    ]);
    expect(readReturn(cookies)).toBe('/tournament/x/register');
  });

  it.each([null, '/tournaments/exit'])(
    'return path: a /login with %s forgets one kept before',
    (typed) => {
      const cookies = jar('/tournament/x/register');
      rememberReturn(cookies, typed);
      expect(cookies.written).toEqual([{ value: '', maxAge: 0 }]);
      expect(readReturn(cookies)).toBeNull();
    },
  );

  it('return path: a planted value of another shape is read as none', () => {
    expect(readReturn(jar('/tournaments/exit'))).toBeNull();
  });
});

describe('registerPath', () => {
  it("return path: a tournament's registration form, the one shape guardedReturnPath keeps", () => {
    expect(registerPath('euroleague-2026-27')).toBe(
      '/tournament/euroleague-2026-27/register',
    );
    expect(guardedReturnPath(registerPath('euroleague-2026-27'))).toBe(
      registerPath('euroleague-2026-27'),
    );
  });
});
