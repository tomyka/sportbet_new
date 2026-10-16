import type { SignedInPlayer } from '@sportbet/db';
import {
  emailAddress,
  instantFrom,
  ok,
  playerId,
  refuse,
  type EmailAddress,
  type Result,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { ProfileRequest } from './profile-action';
import { updateProfile, type UpdateProfileWorld } from './update-profile';

const ME = unwrap(playerId('7'));
const PLAYER: SignedInPlayer = {
  player: ME,
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'player',
  lastTournament: null,
};
const AT = unwrap(instantFrom('2026-10-16T12:00:00Z'));
const CURRENT = unwrap(emailAddress('jonas@example.lt'));
const NEW = unwrap(emailAddress('naujas@example.lt'));

const formOf = (fields: Record<string, string>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

const GOOD = {
  username: 'jonas',
  name: 'Jonas',
  surname: 'Petraitis',
  email: 'jonas@example.lt',
};

const requestOf = (fields: Record<string, string>): ProfileRequest => ({
  player: PLAYER,
  form: formOf(fields),
  ip: '203.0.113.9',
  at: AT,
});

interface Calls {
  readonly names: unknown[];
  readonly cancelled: unknown[];
  readonly throttled: unknown[];
  readonly requested: { player: unknown; address: EmailAddress }[];
}

function fakeWorld(
  options: {
    pending?: EmailAddress | null;
    taken?: boolean;
    names?: Result<void, 'username-taken' | 'unknown-player'>;
    throttle?: { allowed: true } | { allowed: false; minutes: number };
    send?: 'sent' | 'failed';
    gone?: boolean;
  } = {},
): { world: UpdateProfileWorld; calls: Calls } {
  const calls: Calls = {
    names: [],
    cancelled: [],
    throttled: [],
    requested: [],
  };
  const world: UpdateProfileWorld = {
    load: () =>
      Promise.resolve(
        options.gone === true
          ? undefined
          : {
              username: 'jonas',
              name: 'Jonas',
              surname: 'Petraitis',
              email: CURRENT,
              pendingEmail: options.pending ?? null,
              role: 'player',
              receiveReminders: false,
              createdAt: AT,
            },
      ),
    emailTaken: () => Promise.resolve(options.taken ?? false),
    saveNames: (write) => {
      calls.names.push(write);
      return Promise.resolve(options.names ?? ok(undefined));
    },
    cancelPending: (player) => {
      calls.cancelled.push(player);
      return Promise.resolve();
    },
    throttle: (limits) => {
      calls.throttled.push(limits);
      return Promise.resolve(options.throttle ?? { allowed: true });
    },
    requestChange: (player, address) => {
      calls.requested.push({ player, address });
      return Promise.resolve(options.send ?? 'sent');
    },
  };
  return { world, calls };
}

const flashOf = (answer: Awaited<ReturnType<typeof updateProfile>>) =>
  answer.kind === 'redirect' ? answer.flash : null;

describe('updateProfile: the form is checked first, and a refusal writes nothing', () => {
  it('lists every refused field with the typed values, and saves no name', async () => {
    const { world, calls } = fakeWorld();
    const answer = await updateProfile(
      requestOf({
        username: '',
        name: 'x'.repeat(256),
        surname: '',
        email: 'no',
      }),
      world,
    );
    expect(flashOf(answer)).toEqual({
      kind: 'profile-refused',
      bag: 'account',
      errors: {
        username: 'required',
        name: 'too-long',
        surname: 'required',
        email: 'not-an-email',
      },
      values: { username: '', name: 'x'.repeat(256), surname: '', email: 'no' },
    });
    expect(calls.names).toEqual([]);
    expect(calls.requested).toEqual([]);
  });

  it('cuts a typed value to what a cookie keeps, by characters', async () => {
    const { world } = fakeWorld();
    const answer = await updateProfile(
      requestOf({ ...GOOD, name: '\u{1F600}'.repeat(400) }),
      world,
    );
    const flash = flashOf(answer);
    expect(flash?.kind === 'profile-refused' && flash.values?.name).toBe(
      '\u{1F600}'.repeat(300),
    );
  });

  it('refuses an address another account holds, as the form said it, saving no name', async () => {
    const { world, calls } = fakeWorld({ taken: true });
    const answer = await updateProfile(
      requestOf({ ...GOOD, email: 'Naujas@Example.lt ' }),
      world,
    );
    expect(flashOf(answer)).toMatchObject({
      kind: 'profile-refused',
      bag: 'account',
      errors: { email: 'taken' },
      values: { email: 'Naujas@Example.lt' },
    });
    expect(calls.names).toEqual([]);
  });

  it('does not ask whether the account taken its own address when it is unchanged', async () => {
    const { world, calls } = fakeWorld({ taken: true });
    const answer = await updateProfile(requestOf(GOOD), world);
    expect(flashOf(answer)).toEqual({ kind: 'profile-updated' });
    expect(calls.names).toHaveLength(1);
  });

  it('refuses a username another holds, and says so on that field', async () => {
    const { world } = fakeWorld({ names: refuse('username-taken') });
    const answer = await updateProfile(requestOf(GOOD), world);
    expect(flashOf(answer)).toMatchObject({
      bag: 'account',
      errors: { username: 'taken' },
    });
  });

  it('goes home when the account is gone, saving nothing', async () => {
    const gone = fakeWorld({ gone: true });
    expect(await updateProfile(requestOf(GOOD), gone.world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
    const raced = fakeWorld({ names: refuse('unknown-player') });
    expect(await updateProfile(requestOf(GOOD), raced.world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
  });
});

describe('updateProfile: the names and an unchanged address', () => {
  it('saves the trimmed names, changes no address and says the profile is updated', async () => {
    const { world, calls } = fakeWorld();
    const answer = await updateProfile(
      requestOf({ ...GOOD, name: ' Jonas ', surname: 'Petraitis ' }),
      world,
    );
    expect(answer).toEqual({
      kind: 'redirect',
      to: '/userProfile',
      flash: { kind: 'profile-updated' },
    });
    expect(calls.names).toEqual([
      {
        player: ME,
        username: 'jonas',
        name: 'Jonas',
        surname: 'Petraitis',
        email: CURRENT,
      },
    ]);
    expect(calls.requested).toEqual([]);
    expect(calls.cancelled).toEqual([]);
    expect(calls.throttled).toEqual([]);
  });

  it('reads the current address typed in another spelling as unchanged', async () => {
    const { world, calls } = fakeWorld();
    const answer = await updateProfile(
      requestOf({ ...GOOD, email: ' Jonas@Example.LT ' }),
      world,
    );
    expect(flashOf(answer)).toEqual({ kind: 'profile-updated' });
    expect(calls.requested).toEqual([]);
  });

  it('drops a pending change when the current address is what is posted', async () => {
    const { world, calls } = fakeWorld({ pending: NEW });
    const answer = await updateProfile(requestOf(GOOD), world);
    expect(flashOf(answer)).toEqual({ kind: 'profile-updated' });
    expect(calls.cancelled).toEqual([ME]);
  });
});

describe('updateProfile: a changed address asks for a code (R-24)', () => {
  it('saves the names, throttles per account, mails the new address and says so', async () => {
    const { world, calls } = fakeWorld();
    const answer = await updateProfile(
      requestOf({ ...GOOD, email: 'Naujas@Example.lt' }),
      world,
    );
    expect(flashOf(answer)).toEqual({
      kind: 'email-change-requested',
      email: 'naujas@example.lt',
    });
    expect(calls.names).toHaveLength(1);
    expect(calls.throttled).toEqual([
      [
        {
          key: 'email-change-request:7',
          maxAttempts: 3,
          windowSeconds: 600,
        },
      ],
    ]);
    expect(calls.requested).toEqual([{ player: ME, address: NEW }]);
  });

  it('asks again for the address already pending: a fresh code', async () => {
    const { world, calls } = fakeWorld({ pending: NEW });
    await updateProfile(
      requestOf({ ...GOOD, email: 'naujas@example.lt' }),
      world,
    );
    expect(calls.requested).toEqual([{ player: ME, address: NEW }]);
  });

  it('answers a throttled request in the address field with the minutes, sending nothing, the names already saved', async () => {
    const { world, calls } = fakeWorld({
      throttle: { allowed: false, minutes: 6 },
    });
    const answer = await updateProfile(
      requestOf({ ...GOOD, email: 'naujas@example.lt' }),
      world,
    );
    expect(flashOf(answer)).toMatchObject({
      kind: 'profile-refused',
      bag: 'account',
      errors: { email: 'throttled' },
      minutes: 6,
    });
    expect(calls.names).toHaveLength(1);
    expect(calls.requested).toEqual([]);
  });

  it('says the send failed in the address field when the code was not mailed', async () => {
    const { world } = fakeWorld({ send: 'failed' });
    const answer = await updateProfile(
      requestOf({ ...GOOD, email: 'naujas@example.lt' }),
      world,
    );
    expect(flashOf(answer)).toMatchObject({
      bag: 'account',
      errors: { email: 'send-failed' },
    });
  });
});
