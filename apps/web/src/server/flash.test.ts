import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { ADMIN_MESSAGES, MAX_FORM_PROBLEMS } from './admin/admin-messages';
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
    { kind: 'reminders-off' },
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

describe('the admin structure messages (ADMIN_MESSAGES, slice 13)', () => {
  it.each(Object.keys(ADMIN_MESSAGES))(
    'flash: the admin message %s is sealed and opened',
    (message) => {
      const flash = flashSchema.parse({ kind: 'admin', message });
      expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
        flash,
      );
    },
  );

  it('flash: an admin message carries a number or a name, and a form its refused fields', () => {
    for (const flash of [
      { kind: 'admin', message: 'game-added', number: 412 },
      { kind: 'admin', message: 'context-chosen', name: 'Euroleague 2026/27' },
      {
        kind: 'admin-invalid',
        problems: [
          { field: 'event', problem: 'required' },
          { field: 'place', problem: 'bad-place', row: 3 },
        ],
      },
    ] satisfies Flash[]) {
      expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
        flash,
      );
    }
  });

  it.each([
    { kind: 'admin', message: 'anything' },
    { kind: 'admin', message: 'toString' },
    { kind: 'admin', message: 'game-added', number: 0 },
    { kind: 'admin', message: 'context-chosen', name: '' },
    { kind: 'admin-invalid', problems: [] },
    {
      kind: 'admin-invalid',
      problems: Array.from({ length: MAX_FORM_PROBLEMS + 1 }, () => ({
        field: 'event',
        problem: 'required',
      })),
    },
  ])('flash: %o is nothing, whoever sealed it', (flash) => {
    const forged = seal('flash', { flash, at: '2026-10-06T12:00:00Z' }, SECRET);
    expect(openFlash(forged, SECRET, SENT)).toBeNull();
  });
});

describe('the import messages (slice 15)', () => {
  it('flash: an apply and a refusal open as sealed', () => {
    for (const flash of [
      {
        kind: 'imported',
        result: {
          teams: 20,
          rounds: 2,
          games: 20,
          moved: 1,
          skipped: 0,
          players: 3,
          withoutCrest: ['Nauja'],
        },
      },
      { kind: 'import-refused', problem: { kind: 'plan-changed' } },
      {
        kind: 'import-refused',
        problem: { kind: 'unmatched-teams', teams: ['Zalgiris Kaunas'] },
      },
    ] satisfies Flash[]) {
      expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
        flash,
      );
    }
  });

  it('flash: a refusal the import does not have opens as nothing', () => {
    const forged = seal(
      'flash',
      {
        flash: { kind: 'import-refused', problem: { kind: 'anything' } },
        at: '2026-10-06T12:00:00Z',
      },
      SECRET,
    );
    expect(openFlash(forged, SECRET, SENT)).toBeNull();
  });
});

it('flash: the largest import message still fits a cookie (4 KB)', () => {
  const names = Array.from({ length: 20 }, () => 'ž'.repeat(40));
  for (const flash of [
    {
      kind: 'imported',
      result: {
        teams: 1_000_000,
        rounds: 1_000_000,
        games: 1_000_000,
        moved: 1_000_000,
        skipped: 1_000_000,
        players: 1_000_000,
        withoutCrest: names,
      },
    },
    {
      kind: 'import-refused',
      problem: { kind: 'unmatched-teams', teams: names },
    },
  ] satisfies Flash[]) {
    expect(sealFlash(flash, SENT, SECRET).length).toBeLessThan(4000);
  }
});

describe('the profile messages (slice 17)', () => {
  const sealed = (flash: unknown) =>
    seal('flash', { flash, at: '2026-10-06T12:00:00Z' }, SECRET);

  it.each([
    { kind: 'profile-updated' },
    { kind: 'email-change-requested', email: 'new@example.lt' },
    { kind: 'email-changed' },
    { kind: 'email-change-cancelled' },
    { kind: 'deletion-code-sent' },
    { kind: 'notifications-saved' },
    {
      kind: 'profile-refused',
      bag: 'account',
      errors: { username: 'taken', surname: 'required', email: 'throttled' },
      values: {
        username: 'jonas',
        name: 'Jonas',
        surname: '',
        email: 'a@b.lt',
      },
      minutes: 3,
    },
    { kind: 'profile-refused', bag: 'emailChange', errors: { code: 'none' } },
    {
      kind: 'profile-refused',
      bag: 'userDeletion',
      errors: { code: 'invalid' },
    },
  ] satisfies Flash[])('flash: %o opens as sealed', (flash) => {
    expect(openFlash(sealFlash(flash, SENT, SECRET), SECRET, SENT)).toEqual(
      flash,
    );
  });

  it.each([
    // a code no field has
    {
      kind: 'profile-refused',
      bag: 'account',
      errors: { username: 'anything' },
    },
    // a field its bag does not have
    { kind: 'profile-refused', bag: 'account', errors: { code: 'invalid' } },
    { kind: 'profile-refused', bag: 'emailChange', errors: { email: 'taken' } },
    {
      kind: 'profile-refused',
      bag: 'userDeletion',
      errors: { username: 'required' },
    },
    // values belong to the account form only
    {
      kind: 'profile-refused',
      bag: 'emailChange',
      errors: { code: 'none' },
      values: { username: 'x', name: 'x', surname: 'x', email: 'x' },
    },
    // an unknown bag, an empty refusal, a value too long for a cookie
    { kind: 'profile-refused', bag: 'other', errors: { code: 'none' } },
    { kind: 'profile-refused', bag: 'account', errors: {} },
    {
      kind: 'profile-refused',
      bag: 'account',
      errors: { name: 'too-long' },
      values: {
        username: 'x',
        name: 'x'.repeat(301),
        surname: 'x',
        email: 'x',
      },
    },
    { kind: 'email-change-requested' },
  ])('flash: %o opens as nothing', (flash) => {
    expect(openFlash(sealed(flash), SECRET, SENT)).toBeNull();
  });
});
