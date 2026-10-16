import { playerId, type PlayerId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { seal } from '../sealed';
import {
  signatureOpensFor,
  unsubscribeLinks,
  unsubscribeSignature,
} from './unsubscribe-link';

const SECRET = 'unsubscribe-tests-only-not-a-secret-0123';
const APP_URL = 'https://sportbet.lt';

const player = (id: number): PlayerId => unwrap(playerId(String(id)));

// R-98: a signature bound to its purpose and its player, with no expiry as
// sportbet's `signed` URL has none.
describe('an unsubscribe signature', () => {
  it('opens for its own player and for no other', () => {
    const signature = unsubscribeSignature(player(7), SECRET);
    expect(signatureOpensFor(player(7), signature, SECRET)).toBe(true);
    expect(signatureOpensFor(player(8), signature, SECRET)).toBe(false);
  });

  it('does not open under another key', () => {
    const signature = unsubscribeSignature(player(7), SECRET);
    expect(signatureOpensFor(player(7), signature, `${SECRET}-other`)).toBe(
      false,
    );
  });

  it('does not open when sealed for another purpose, whatever it holds', () => {
    for (const purpose of ['flash', 'sign-in', 'reminders-unsubscribe-2']) {
      const other = seal(purpose, { player: '7' }, SECRET);
      expect(signatureOpensFor(player(7), other, SECRET)).toBe(false);
    }
  });

  it('does not open when tampered with, missing, empty, or shaped as a Laravel signature', () => {
    const signature = unsubscribeSignature(player(7), SECRET);
    const [body = '', mac = ''] = signature.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ player: '8' })).toString(
      'base64url',
    );
    for (const bad of [
      `${forgedBody}.${mac}`,
      `${body}.${mac.slice(0, -1)}A`,
      `${body}.`,
      body,
      '',
      undefined,
      null,
      // Laravel's: a 64-character hex HMAC.
      'a'.repeat(64),
    ]) {
      expect(signatureOpensFor(player(8), bad, SECRET)).toBe(false);
      expect(signatureOpensFor(player(7), bad, SECRET)).toBe(false);
    }
  });

  it('refuses a payload that is not a player', () => {
    for (const payload of [{}, { player: 7 }, { player: '' }, 'text', null]) {
      const sealed = seal('reminders-unsubscribe', payload, SECRET);
      expect(signatureOpensFor(player(7), sealed, SECRET)).toBe(false);
    }
  });
});

describe('unsubscribeLinks', () => {
  const links = unsubscribeLinks(APP_URL, player(7), SECRET);
  const signature = unsubscribeSignature(player(7), SECRET);

  it("keeps sportbet's path and carries the signature; the one-click address adds /confirm", () => {
    expect(links.unsubscribeUrl).toBe(
      `https://sportbet.lt/profile/notifications/unsubscribe/7?signature=${signature}`,
    );
    expect(links.oneClickUrl).toBe(
      `https://sportbet.lt/profile/notifications/unsubscribe/7/confirm?signature=${signature}`,
    );
  });

  it('gives a signature the page then opens for that player', () => {
    const url = new URL(links.unsubscribeUrl);
    expect(
      signatureOpensFor(player(7), url.searchParams.get('signature'), SECRET),
    ).toBe(true);
  });
});
