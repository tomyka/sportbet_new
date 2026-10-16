import type { AccountDeleted, SignedInPlayer } from '@sportbet/db';
import {
  emailAddress,
  instantFrom,
  leagueId,
  ok,
  playerId,
  refuse,
  type EmailAddress,
  type Result,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  deleteOwnAccount,
  requestDeletionCode,
  type DeletionWorld,
} from './delete-account';
import type { ProfileRequest } from './profile-action';

const ME = unwrap(playerId('7'));
const PLAYER: SignedInPlayer = {
  player: ME,
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'player',
  lastTournament: null,
};
const AT = unwrap(instantFrom('2026-10-16T12:00:00Z'));
const EMAIL = unwrap(emailAddress('jonas@example.lt'));
const DELETED: Result<AccountDeleted, never> = ok({ handedOver: [] });

const requestOf = (code?: string): ProfileRequest => {
  const form = new FormData();
  if (code !== undefined) form.set('code', code);
  return { player: PLAYER, form, ip: '203.0.113.9', at: AT };
};

interface Calls {
  readonly throttled: unknown[];
  readonly sent: { email: EmailAddress; at: unknown }[];
  readonly checked: unknown[];
  readonly deleted: unknown[];
  readonly after: number[];
  readonly logged: number[];
}

function fakeWorld(
  options: {
    throttle?: { allowed: true } | { allowed: false; minutes: number };
    send?: 'sent' | 'failed';
    /** The live code's id when the typed one is it; null when it is not. */
    code?: number | null;
    deleted?: Result<
      AccountDeleted,
      'no-such-account' | 'last-superadmin' | 'own-account' | 'code-spent'
    >;
    gone?: boolean;
  } = {},
): { world: DeletionWorld; calls: Calls } {
  const calls: Calls = {
    throttled: [],
    sent: [],
    checked: [],
    deleted: [],
    after: [],
    logged: [],
  };
  const world: DeletionWorld = {
    throttle: (limits) => {
      calls.throttled.push(limits);
      return Promise.resolve(options.throttle ?? { allowed: true });
    },
    load: () =>
      Promise.resolve(
        options.gone === true
          ? undefined
          : {
              username: 'jonas',
              name: 'Jonas',
              surname: 'Petraitis',
              email: EMAIL,
              pendingEmail: null,
              role: 'player',
              receiveReminders: false,
              createdAt: AT,
            },
      ),
    sendDeletionCode: (email, at) => {
      calls.sent.push({ email, at });
      return Promise.resolve(options.send ?? 'sent');
    },
    verifyDeletionCode: (input) => {
      calls.checked.push(input);
      return Promise.resolve(options.code === undefined ? 41 : options.code);
    },
    deleteAccount: (player, at, code) => {
      calls.deleted.push({ player, at, code });
      return Promise.resolve(options.deleted ?? DELETED);
    },
    afterDeletion: () => {
      calls.after.push(1);
      return Promise.resolve();
    },
    logDeleted: (count) => {
      calls.logged.push(count);
    },
  };
  return { world, calls };
}

const dangerRefused = (code: string) => ({
  kind: 'redirect',
  to: '/userProfile',
  flash: { kind: 'code-refused', bag: 'userDeletion', error: code },
});

describe('requestDeletionCode', () => {
  it("mails the code to the account's own address, throttled 10 per IP then 3 per account", async () => {
    const { world, calls } = fakeWorld();
    expect(await requestDeletionCode(requestOf(), world)).toEqual({
      kind: 'redirect',
      to: '/userProfile',
      flash: { kind: 'deletion-code-sent' },
    });
    expect(calls.sent).toEqual([{ email: EMAIL, at: AT }]);
    expect(calls.throttled).toEqual([
      [
        {
          key: 'account-deletion-code-request:ip:203.0.113.9',
          maxAttempts: 10,
          windowSeconds: 600,
        },
        {
          key: 'account-deletion-code-request:user:7',
          maxAttempts: 3,
          windowSeconds: 600,
        },
      ],
    ]);
  });

  it('answers a throttle as the 429, mailing nothing', async () => {
    const { world, calls } = fakeWorld({
      throttle: { allowed: false, minutes: 9 },
    });
    expect(await requestDeletionCode(requestOf(), world)).toEqual({
      kind: 'throttled',
      minutes: 9,
    });
    expect(calls.sent).toEqual([]);
  });

  it('says in the danger zone that the send failed', async () => {
    const { world } = fakeWorld({ send: 'failed' });
    expect(await requestDeletionCode(requestOf(), world)).toEqual(
      dangerRefused('send-failed'),
    );
  });

  it('goes home when the account is gone', async () => {
    const { world, calls } = fakeWorld({ gone: true });
    expect(await requestDeletionCode(requestOf(), world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
    expect(calls.sent).toEqual([]);
  });
});

describe('deleteOwnAccount (R-25, R-130, R-131)', () => {
  it('throttles 15 per IP then 5 per account, answering the 429 and checking nothing', async () => {
    const { world, calls } = fakeWorld({
      throttle: { allowed: false, minutes: 2 },
    });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual({
      kind: 'throttled',
      minutes: 2,
    });
    expect(calls.throttled).toEqual([
      [
        {
          key: 'account-deletion-verify:ip:203.0.113.9',
          maxAttempts: 15,
          windowSeconds: 600,
        },
        {
          key: 'account-deletion-verify:user:7',
          maxAttempts: 5,
          windowSeconds: 600,
        },
      ],
    ]);
    expect(calls.checked).toEqual([]);
    expect(calls.deleted).toEqual([]);
  });

  it('deletes with the right code, ends the session, and goes home with no message', async () => {
    const { world, calls } = fakeWorld();
    expect(await deleteOwnAccount(requestOf(' 01234567 '), world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
    expect(calls.checked).toEqual([
      { email: EMAIL, code: '01234567', now: AT },
    ]);
    expect(calls.deleted).toEqual([{ player: ME, at: AT, code: 41 }]);
    expect(calls.after).toEqual([1]);
    expect(calls.logged).toEqual([0]);
  });

  it('logs the count of leagues handed over, nothing else', async () => {
    const heir = unwrap(playerId('9'));
    const { world, calls } = fakeWorld({
      deleted: ok({
        handedOver: [
          { league: unwrap(leagueId(3)), newOwner: heir },
          { league: unwrap(leagueId(4)), deleteEmpty: true },
        ],
      }),
    });
    await deleteOwnAccount(requestOf('01234567'), world);
    expect(calls.logged).toEqual([2]);
  });

  it('answers an empty or missing code as invalid in the danger zone, checking and deleting nothing', async () => {
    for (const request of [requestOf(), requestOf('  ')]) {
      const { world, calls } = fakeWorld();
      expect(await deleteOwnAccount(request, world)).toEqual(
        dangerRefused('invalid'),
      );
      expect(calls.checked).toEqual([]);
      expect(calls.deleted).toEqual([]);
      expect(calls.after).toEqual([]);
    }
  });

  it('answers a code the shared check refuses as invalid, deleting nothing and keeping the session', async () => {
    const { world, calls } = fakeWorld({ code: null });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual(
      dangerRefused('invalid'),
    );
    expect(calls.deleted).toEqual([]);
    expect(calls.after).toEqual([]);
  });

  it('refuses the last superadmin in the danger zone (R-131), keeping the session', async () => {
    const { world, calls } = fakeWorld({ deleted: refuse('last-superadmin') });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual(
      dangerRefused('last-superadmin'),
    );
    expect(calls.after).toEqual([]);
    expect(calls.logged).toEqual([]);
  });

  it('answers a code claimed between the check and the deletion as invalid, keeping the session', async () => {
    const { world, calls } = fakeWorld({ deleted: refuse('code-spent') });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual(
      dangerRefused('invalid'),
    );
    expect(calls.after).toEqual([]);
    expect(calls.logged).toEqual([]);
  });

  it('ends the session of an account already gone, logging nothing', async () => {
    const { world, calls } = fakeWorld({ deleted: refuse('no-such-account') });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
    expect(calls.after).toEqual([1]);
    expect(calls.logged).toEqual([]);
  });

  it('throws on a refusal a self-deletion cannot have', async () => {
    const { world } = fakeWorld({ deleted: refuse('own-account') });
    await expect(
      deleteOwnAccount(requestOf('01234567'), world),
    ).rejects.toThrow(/own-account/);
  });

  it('goes home when the account is gone before the check', async () => {
    const { world, calls } = fakeWorld({ gone: true });
    expect(await deleteOwnAccount(requestOf('01234567'), world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
    expect(calls.checked).toEqual([]);
  });
});
