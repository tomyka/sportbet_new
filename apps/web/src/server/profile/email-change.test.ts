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
import type { CodeCheck } from '../code-check';
import {
  cancelAddressChange,
  confirmAddressChange,
  type EmailChangeWorld,
} from './email-change';
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
const OLD = unwrap(emailAddress('jonas@example.lt'));
const NEW = unwrap(emailAddress('naujas@example.lt'));

const requestOf = (code?: string): ProfileRequest => {
  const form = new FormData();
  if (code !== undefined) form.set('code', code);
  return { player: PLAYER, form, ip: '203.0.113.9', at: AT };
};

interface Calls {
  readonly throttled: unknown[];
  readonly checked: unknown[];
  readonly confirmed: unknown[];
  readonly notices: { old: EmailAddress; now: EmailAddress }[];
  readonly cancelled: unknown[];
}

function fakeWorld(
  options: {
    pending?: EmailAddress | null;
    throttle?: { allowed: true } | { allowed: false; minutes: number };
    code?: CodeCheck;
    moved?: Result<{ old: EmailAddress }, 'none' | 'taken'>;
  } = {},
): { world: EmailChangeWorld; calls: Calls } {
  const calls: Calls = {
    throttled: [],
    checked: [],
    confirmed: [],
    notices: [],
    cancelled: [],
  };
  const pending = options.pending === undefined ? NEW : options.pending;
  const world: EmailChangeWorld = {
    throttle: (limits) => {
      calls.throttled.push(limits);
      return Promise.resolve(options.throttle ?? { allowed: true });
    },
    load: () =>
      Promise.resolve({
        username: 'jonas',
        name: 'Jonas',
        surname: 'Petraitis',
        email: OLD,
        pendingEmail: pending,
        role: 'player',
        receiveReminders: false,
        createdAt: AT,
      }),
    checkCode: (input) => {
      calls.checked.push(input);
      return Promise.resolve(options.code ?? 'claimed');
    },
    confirm: (player, wanted) => {
      calls.confirmed.push({ player, wanted });
      return Promise.resolve(options.moved ?? ok({ old: OLD }));
    },
    sendNotice: (old, now) => {
      calls.notices.push({ old, now });
      return Promise.resolve();
    },
    cancel: (player) => {
      calls.cancelled.push(player);
      return Promise.resolve();
    },
  };
  return { world, calls };
}

const refusedWith = (code: string) => ({
  kind: 'redirect',
  to: '/userProfile',
  flash: {
    kind: 'profile-refused',
    bag: 'emailChange',
    errors: { code },
  },
});

describe('confirmAddressChange (R-24)', () => {
  it('throttles 15 per IP then 5 per account, and answers a throttle as the 429', async () => {
    const { world, calls } = fakeWorld({
      throttle: { allowed: false, minutes: 3 },
    });
    expect(await confirmAddressChange(requestOf('01234567'), world)).toEqual({
      kind: 'throttled',
      minutes: 3,
    });
    expect(calls.throttled).toEqual([
      [
        {
          key: 'email-change-verify:ip:203.0.113.9',
          maxAttempts: 15,
          windowSeconds: 600,
        },
        {
          key: 'email-change-verify:user:7',
          maxAttempts: 5,
          windowSeconds: 600,
        },
      ],
    ]);
    expect(calls.checked).toEqual([]);
  });

  it('moves the address and tells the old one, checking the code on the pending address', async () => {
    const { world, calls } = fakeWorld();
    expect(await confirmAddressChange(requestOf(' 01234567 '), world)).toEqual({
      kind: 'redirect',
      to: '/userProfile',
      flash: { kind: 'email-changed' },
    });
    expect(calls.checked).toEqual([{ email: NEW, code: '01234567', now: AT }]);
    expect(calls.confirmed).toEqual([{ player: ME, wanted: NEW }]);
    expect(calls.notices).toEqual([{ old: OLD, now: NEW }]);
  });

  it('answers an empty or missing code as invalid, even with nothing pending, checking nothing', async () => {
    for (const request of [requestOf(), requestOf('   ')]) {
      for (const pending of [NEW, null]) {
        const { world, calls } = fakeWorld({ pending });
        expect(await confirmAddressChange(request, world)).toEqual(
          refusedWith('invalid'),
        );
        expect(calls.checked).toEqual([]);
      }
    }
  });

  it('answers nothing pending as `none`, checking no code', async () => {
    const { world, calls } = fakeWorld({ pending: null });
    expect(await confirmAddressChange(requestOf('01234567'), world)).toEqual(
      refusedWith('none'),
    );
    expect(calls.checked).toEqual([]);
  });

  it('answers a code the shared check refuses as invalid, moving nothing and telling nobody', async () => {
    const { world, calls } = fakeWorld({ code: 'refused' });
    expect(await confirmAddressChange(requestOf('01234567'), world)).toEqual(
      refusedWith('invalid'),
    );
    expect(calls.confirmed).toEqual([]);
    expect(calls.notices).toEqual([]);
  });

  it.each(['none', 'taken'] as const)(
    'answers the writer refusing with `%s`, telling nobody',
    async (refusal) => {
      const { world, calls } = fakeWorld({ moved: refuse(refusal) });
      expect(await confirmAddressChange(requestOf('01234567'), world)).toEqual(
        refusedWith(refusal),
      );
      expect(calls.notices).toEqual([]);
    },
  );
});

describe('cancelAddressChange', () => {
  it("drops the session's own pending change and says so", async () => {
    const { world, calls } = fakeWorld();
    expect(await cancelAddressChange(requestOf(), world)).toEqual({
      kind: 'redirect',
      to: '/userProfile',
      flash: { kind: 'email-change-cancelled' },
    });
    expect(calls.cancelled).toEqual([ME]);
  });
});
