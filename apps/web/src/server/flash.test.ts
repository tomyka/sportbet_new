import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { seal } from './sealed';
import {
  flashSchema,
  LEAGUE_MESSAGES,
  openFlash,
  sealFlash,
  type Flash,
} from './flash';

const SECRET = 'test-secret-test-secret-test-secret';
const SENT = at('2026-10-06T12:00:00Z');

// sportbet's ->with('info' | 'error', ...): a message for the next page,
// sealed so no one else can write one, and stale after its 60 seconds.

describe('the one-time message', () => {
  it('flash: opens to the message sealed, within its minute', () => {
    const sealed = sealFlash(
      { kind: 'registered', tournament: 'Euroleague 2027/28' },
      SENT,
      SECRET,
    );
    expect(openFlash(sealed, SECRET, at('2026-10-06T12:01:00Z'))).toEqual({
      kind: 'registered',
      tournament: 'Euroleague 2027/28',
    });
  });

  it('flash: is nothing after its minute, without a value, under another key, or sealed for another purpose', () => {
    const sealed = sealFlash({ kind: 'registration-closed' }, SENT, SECRET);
    expect(openFlash(sealed, SECRET, at('2026-10-06T12:01:01Z'))).toBeNull();
    expect(openFlash(null, SECRET, SENT)).toBeNull();
    expect(openFlash(sealed, `${SECRET}-other`, SENT)).toBeNull();
    const asRegistration = seal(
      'registration',
      { flash: { kind: 'registration-closed' }, at: '2026-10-06T12:00:00Z' },
      SECRET,
    );
    expect(openFlash(asRegistration, SECRET, SENT)).toBeNull();
  });

  it('flash: a sealed value of a kind the app does not have is nothing', () => {
    const odd = seal(
      'flash',
      { flash: { kind: 'anything', text: 'x' }, at: '2026-10-06T12:00:00Z' },
      SECRET,
    );
    expect(openFlash(odd, SECRET, SENT)).toBeNull();
  });
});

describe('the message kinds (one definition: flashSchema)', () => {
  it.each([
    { kind: 'registered', tournament: 'Euroleague 2027/28' },
    { kind: 'registration-closed' },
    { kind: 'confirm-required' },
    { kind: 'recalculated' },
    { kind: 'league-switched' },
    { kind: 'throttled', minutes: 1 },
  ] satisfies Flash[])('flash: %o opens as sealed', (flash) => {
    expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
      flash,
    );
    expect(flashSchema.parse(flash)).toEqual(flash);
  });
});

describe('the league messages (LEAGUE_MESSAGES)', () => {
  it.each(Object.keys(LEAGUE_MESSAGES))(
    'flash: the league message %s is sealed and opened',
    (message) => {
      const flash = flashSchema.parse({ kind: 'league', message });
      expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
        flash,
      );
    },
  );

  it('flash: a league message the app does not have opens as nothing', () => {
    const forged = seal(
      'flash',
      {
        flash: { kind: 'league', message: 'anything' },
        at: '2026-10-06T12:00:00Z',
      },
      SECRET,
    );
    expect(openFlash(forged, SECRET, SENT)).toBeNull();
  });

  it('flash: a league message names a key only, never a text or a tone to be drawn', () => {
    const forged = seal(
      'flash',
      {
        flash: { kind: 'league', message: 'toString' },
        at: '2026-10-06T12:00:00Z',
      },
      SECRET,
    );
    expect(openFlash(forged, SECRET, SENT)).toBeNull();
  });
});
