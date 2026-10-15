import { at, gameNo, player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { seal } from '../../sealed';
import {
  clearConfirmation,
  openConfirmation,
  readConfirmation,
  sealConfirmation,
  writeConfirmation,
} from './pending';

const SECRET = 'test-secret-test-secret-test-secret';
const PENDING = {
  account: player('7'),
  action: { kind: 'delete-game', game: gameNo(412) },
  issuedAt: at('2026-10-14T12:00:00Z'),
} as const;

/** A minute after the code went out. */
const NOW = at('2026-10-14T12:01:00Z');

describe('the pending confirmation cookie (R-26 amended)', () => {
  it('opens to what was sealed', () => {
    expect(
      openConfirmation(sealConfirmation(PENDING, SECRET), SECRET, NOW),
    ).toEqual(PENDING);
  });

  it('holds the account, the action and when the code went out, and nothing else', () => {
    const [body = ''] = sealConfirmation(PENDING, SECRET).split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(
      {
        account: '7',
        action: { kind: 'delete-game', game: 412 },
        issuedAt: '2026-10-14T12:00:00Z',
      },
    );
  });

  it('opens to nothing when changed, sealed with another key, or not one at all', () => {
    const sealed = sealConfirmation(PENDING, SECRET);
    const [, signature = ''] = sealed.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({
        account: '7',
        action: { kind: 'delete-game', game: 999 },
        issuedAt: '2026-10-14T12:00:00Z',
      }),
    ).toString('base64url')}.${signature}`;
    expect(openConfirmation(forged, SECRET, NOW)).toBeNull();
    expect(openConfirmation(sealed, `${SECRET}-other`, NOW)).toBeNull();
    expect(openConfirmation('nonsense', SECRET, NOW)).toBeNull();
    expect(openConfirmation(undefined, SECRET, NOW)).toBeNull();
  });

  it("opens to nothing when sealed for another cookie's purpose", () => {
    const value = seal(
      'sign-in',
      {
        account: '7',
        action: { kind: 'delete-game', game: 412 },
        issuedAt: '2026-10-14T12:00:00Z',
      },
      SECRET,
    );
    expect(openConfirmation(value, SECRET, NOW)).toBeNull();
  });

  it('opens to nothing for an action this app does not have or a game that is no id', () => {
    for (const action of [
      { kind: 'delete-everything' },
      { kind: 'delete-game', game: 0 },
      { kind: 'delete-game', game: 'x' },
    ]) {
      const value = seal(
        'admin-confirm',
        { account: '7', action, issuedAt: '2026-10-14T12:00:00Z' },
        SECRET,
      );
      expect(openConfirmation(value, SECRET, NOW)).toBeNull();
    }
  });

  it("opens to nothing once older than the cookie's five minutes, whatever the browser kept", () => {
    const sealed = sealConfirmation(PENDING, SECRET);
    expect(
      openConfirmation(sealed, SECRET, at('2026-10-14T12:05:00Z')),
    ).toEqual(PENDING);
    expect(
      openConfirmation(sealed, SECRET, at('2026-10-14T12:05:01Z')),
    ).toBeNull();
  });

  it('is written and cleared with its own flags, and read back from the jar', () => {
    const written: { name: string; value: string; maxAge: number }[] = [];
    const jar = {
      get: (name: string) => {
        const last = written.findLast((entry) => entry.name === name);
        return last === undefined || last.maxAge === 0
          ? undefined
          : { value: last.value };
      },
      set: (name: string, value: string, options: { maxAge: number }) => {
        written.push({ name, value, maxAge: options.maxAge });
      },
    };
    writeConfirmation(jar, PENDING, SECRET);
    expect(written[0]?.name).toBe('__Host-sb_confirm');
    expect(written[0]?.maxAge).toBe(300);
    expect(readConfirmation(jar, SECRET, NOW)).toEqual(PENDING);
    clearConfirmation(jar);
    expect(written[1]).toEqual({
      name: '__Host-sb_confirm',
      value: '',
      maxAge: 0,
    });
    expect(readConfirmation(jar, SECRET, NOW)).toBeNull();
  });
});
