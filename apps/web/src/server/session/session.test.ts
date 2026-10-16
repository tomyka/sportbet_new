import { describe, expect, it } from 'vitest';
import { hashSessionToken } from './session-token';
import { sessionTokenHash, sessionVisit } from './session';

// R-44 on a visit, before the database: what the session cookie asks for.

const TOKEN = 'a'.repeat(43);

const jar = (value?: string) => ({
  get: (name: string) =>
    name === '__Host-sb_session' && value !== undefined ? { value } : undefined,
});

describe('sessionVisit', () => {
  it('no session cookie: nothing to do', () => {
    expect(sessionVisit(jar(), '2026-10-08')).toEqual({ kind: 'nothing' });
  });

  it('a cookie issued today: nothing to write', () => {
    expect(sessionVisit(jar(`${TOKEN}.2026-10-08`), '2026-10-08')).toEqual({
      kind: 'nothing',
    });
  });

  it('a cookie from an earlier day: the session to extend', () => {
    expect(sessionVisit(jar(`${TOKEN}.2026-10-07`), '2026-10-08')).toEqual({
      kind: 'extend',
      token: TOKEN,
    });
  });

  it("a cookie that is not this app's: cleared", () => {
    expect(sessionVisit(jar('not.a.session'), '2026-10-08')).toEqual({
      kind: 'clear',
    });
  });
});

describe('sessionTokenHash', () => {
  it("is the hash of this browser's token, as the database keeps it", () => {
    expect(sessionTokenHash(jar(`${TOKEN}.2026-10-08`))).toBe(
      hashSessionToken(TOKEN),
    );
  });

  it('is null for a browser with no session, or a foreign cookie', () => {
    expect(sessionTokenHash(jar())).toBeNull();
    expect(sessionTokenHash(jar('not.a.session'))).toBeNull();
  });
});
