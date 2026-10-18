import {
  emailAddress,
  googleId,
  instantFrom,
  ok,
  playerId,
  refuse,
  type EmailAddress,
  type GoogleIdentity,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import type { GoogleLinkRefusal } from '@sportbet/db/account';
import { describe, expect, it } from 'vitest';
import {
  completeGoogle,
  type GoogleCallback,
  type GoogleWorld,
} from './complete';
import type { PendingGoogle } from './pending';

const AT = unwrap(instantFrom('2026-10-18T10:00:00Z'));
const SUB = unwrap(googleId('104520385693274017345'));
const EMAIL = unwrap(emailAddress('jonas@example.lt'));
const ME = unwrap(playerId('7'));
const OTHER = unwrap(playerId('9'));

const TRIP: PendingGoogle = {
  state: 'the-state-of-this-browser',
  nonce: 'the-nonce',
  verifier: 'the-verifier',
  at: AT,
};

const IDENTITY: GoogleIdentity = {
  sub: SUB,
  email: EMAIL,
  emailVerified: true,
  name: 'Jonas Jonaitis',
};

const REQUEST: GoogleCallback = {
  error: null,
  code: 'a-code',
  state: TRIP.state,
  ip: '203.0.113.9',
  at: AT,
};

interface Setup {
  trip?: PendingGoogle | null;
  throttle?: { allowed: true } | { allowed: false; minutes: number };
  identity?: Result<GoogleIdentity, 'failed'>;
  bySub?: PlayerId | null;
  byEmail?: PlayerId | null;
  open?: boolean;
  link?: Result<'linked', GoogleLinkRefusal>;
  register?: Result<{ player: PlayerId }, 'taken'> | Error;
  returnTo?: string;
}

/** A world of fakes, and the record of what was done in it, in order. */
function fakeWorld(setup: Setup = {}) {
  const done: string[] = [];
  const logged: string[] = [];
  const errors: unknown[] = [];
  const world: GoogleWorld = {
    throttle: (limits) => {
      done.push(`throttle ${limits[0]?.key ?? ''}`);
      return Promise.resolve(setup.throttle ?? { allowed: true });
    },
    trip: () => {
      done.push('trip');
      return setup.trip === undefined ? TRIP : setup.trip;
    },
    forgetTrip: () => {
      done.push('forget');
    },
    exchange: (exchange) => {
      done.push(
        `exchange ${exchange.code} ${exchange.verifier} ${exchange.nonce}`,
      );
      return Promise.resolve(setup.identity ?? ok(IDENTITY));
    },
    findBySub: () => {
      done.push('bySub');
      return Promise.resolve(
        setup.bySub === undefined || setup.bySub === null
          ? undefined
          : { player: setup.bySub },
      );
    },
    findByEmail: (email: EmailAddress) => {
      done.push(`byEmail ${email}`);
      return Promise.resolve(
        setup.byEmail === undefined || setup.byEmail === null
          ? undefined
          : { player: setup.byEmail },
      );
    },
    registrationOpen: () => {
      done.push('open?');
      return Promise.resolve(setup.open ?? true);
    },
    link: (player) => {
      done.push(`link ${player}`);
      return Promise.resolve(setup.link ?? ok('linked'));
    },
    register: (_sub, email, name) => {
      done.push(`register ${email} ${name ?? '-'}`);
      const result = setup.register ?? ok({ player: OTHER });
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    },
    signIn: (player, method) => {
      done.push(`signIn ${player} ${method}`);
      return Promise.resolve(setup.returnTo ?? '/main');
    },
    registered: () => {
      done.push('registered');
    },
    log: (outcome) => {
      logged.push(outcome);
    },
    logError: (error) => {
      errors.push(error);
    },
  };
  return { world, done, logged, errors };
}

const FAILURE = { to: '/', flash: { kind: 'google-failed' } };

describe('completeGoogle: before anything is asked of Google', () => {
  it('is throttled first, by the client address, with nothing read or exchanged, and the trip forgotten', async () => {
    const run = fakeWorld({ throttle: { allowed: false, minutes: 3 } });
    expect(await completeGoogle(run.world, REQUEST)).toEqual(FAILURE);
    expect(run.done).toEqual([
      'throttle google-callback:ip:203.0.113.9',
      'forget',
    ]);
    expect(run.logged).toEqual(['refused-throttled']);
  });

  it.each([
    ['a denied consent', { error: 'access_denied' }],
    ['no code', { code: null }],
    ['an empty code', { code: '' }],
    ['a code over 2 KB', { code: 'a'.repeat(2049) }],
    ['a code with a space', { code: 'a b' }],
    ['a code with a quote', { code: "a'b" }],
    ['a code with a line break', { code: 'a\nb' }],
  ])(
    'is the failure for %s, forgetting the trip and exchanging nothing',
    async (_name, change) => {
      const run = fakeWorld();
      expect(
        await completeGoogle(run.world, { ...REQUEST, ...change }),
      ).toEqual(FAILURE);
      expect(run.done).not.toContainEqual(expect.stringMatching(/^exchange/));
      expect(run.done).toContain('forget');
      expect(run.logged).toEqual(['refused-request']);
    },
  );

  it('takes a code as Google writes one, slashes and dashes included', async () => {
    const run = fakeWorld({ bySub: ME });
    const answer = await completeGoogle(run.world, {
      ...REQUEST,
      code: '4/0AX4XfWh-q_Abc.123~x',
    });
    expect(answer).toEqual({ to: '/main', flash: null });
  });

  it.each([
    [
      "no cookie, or one that is forged, another purpose's, expired",
      { trip: null },
    ],
    ['no state in the query', { state: null }],
    ['a state that differs', { state: 'another-state' }],
    [
      "a state that is a prefix of the cookie's",
      { state: TRIP.state.slice(0, 10) },
    ],
    ["a state with the cookie's as a prefix", { state: `${TRIP.state}x` }],
    ['an empty state', { state: '' }],
  ])(
    'is the failure for %s: Google is asked nothing and the trip is forgotten',
    async (_name, change) => {
      const run = fakeWorld('trip' in change ? { trip: change.trip } : {});
      const request = 'trip' in change ? REQUEST : { ...REQUEST, ...change };
      expect(await completeGoogle(run.world, request)).toEqual(FAILURE);
      expect(run.done).not.toContainEqual(
        expect.stringMatching(/^(exchange|bySub|byEmail)/),
      );
      expect(run.done).toContain('forget');
      expect(run.logged).toEqual(['refused-state']);
    },
  );

  it("forgets the trip before it exchanges, and exchanges with this trip's verifier and nonce", async () => {
    const run = fakeWorld({ bySub: ME });
    await completeGoogle(run.world, REQUEST);
    expect(run.done.slice(0, 4)).toEqual([
      'throttle google-callback:ip:203.0.113.9',
      'trip',
      'forget',
      'exchange a-code the-verifier the-nonce',
    ]);
  });

  it('is the failure when the exchange fails, nobody signed in', async () => {
    const run = fakeWorld({ identity: refuse('failed') });
    expect(await completeGoogle(run.world, REQUEST)).toEqual(FAILURE);
    expect(run.done).not.toContain('bySub');
    expect(run.logged).toEqual(['refused-exchange']);
  });
});

describe("completeGoogle: the plan, in sportbet's order", () => {
  it('signs in by sub, asking nothing of the address (even unverified, even closed)', async () => {
    const run = fakeWorld({
      bySub: ME,
      open: false,
      identity: ok({ ...IDENTITY, emailVerified: false, email: null }),
    });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/main',
      flash: null,
    });
    expect(run.done.at(-1)).toBe('signIn 7 google');
    expect(run.done.some((step) => step.startsWith('byEmail'))).toBe(false);
    expect(run.logged).toEqual(['signed-in']);
  });

  it('goes where sign-in says: the guarded page kept', async () => {
    const run = fakeWorld({ bySub: ME, returnTo: '/prediction/results' });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/prediction/results',
      flash: null,
    });
  });

  it("refuses an unverified address with sportbet's message, linking and creating nothing", async () => {
    for (const identity of [
      { ...IDENTITY, emailVerified: false },
      { ...IDENTITY, email: null },
    ]) {
      const run = fakeWorld({ byEmail: ME, identity: ok(identity) });
      expect(await completeGoogle(run.world, REQUEST)).toEqual({
        to: '/',
        flash: { kind: 'google-unverified' },
      });
      expect(
        run.done.some((step) => /^(link|register|signIn)/.test(step)),
      ).toBe(false);
      expect(run.logged).toEqual(['refused-unverified']);
    }
  });

  it('links the exact-address account and signs it in, audited as google', async () => {
    const run = fakeWorld({ byEmail: ME });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/main',
      flash: null,
    });
    expect(run.done.slice(-2)).toEqual(['link 7', 'signIn 7 google']);
    expect(run.logged).toEqual(['linked']);
  });

  it.each(['already-linked', 'taken', 'unknown-player'] as const)(
    'ends the link refusing %s in the generic failure, signing nobody in (R-135 Q3)',
    async (refusal) => {
      const run = fakeWorld({ byEmail: ME, link: refuse(refusal) });
      expect(await completeGoogle(run.world, REQUEST)).toEqual(FAILURE);
      expect(run.done.some((step) => step.startsWith('signIn'))).toBe(false);
      expect(run.logged).toEqual([`refused-link-${refusal}`]);
    },
  );

  it('sends a visitor home with no message when registration is closed (R-128, R-135 Q4)', async () => {
    const run = fakeWorld({ open: false });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/',
      flash: null,
    });
    expect(run.done.some((step) => /^(register|signIn)/.test(step))).toBe(
      false,
    );
    expect(run.logged).toEqual(['refused-closed']);
  });

  it('creates the account while registration is open, then signs it in as register_google, home', async () => {
    const run = fakeWorld({ returnTo: '/main' });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/main',
      flash: null,
    });
    expect(run.done.slice(-3)).toEqual([
      'register jonas@example.lt Jonas Jonaitis',
      'registered',
      'signIn 9 register_google',
    ]);
    expect(run.logged).toEqual(['registered']);
  });

  it('is the failure when the address folds onto an account (taken), nobody signed in', async () => {
    const run = fakeWorld({ register: refuse('taken') });
    expect(await completeGoogle(run.world, REQUEST)).toEqual(FAILURE);
    expect(run.done).not.toContain('registered');
    expect(run.logged).toEqual(['refused-taken']);
  });

  it('is "Registracijos užbaigti nepavyko" when the creation throws, logged by its kind', async () => {
    const run = fakeWorld({ register: new Error('db down') });
    expect(await completeGoogle(run.world, REQUEST)).toEqual({
      to: '/',
      flash: { kind: 'google-registration-failed' },
    });
    expect(run.errors).toHaveLength(1);
    expect(run.logged).toEqual(['failed-registration']);
    expect(run.done.some((step) => step.startsWith('signIn'))).toBe(false);
  });

  it('never creates an account for a verified identity with no address', async () => {
    const run = fakeWorld({
      identity: ok({ ...IDENTITY, email: null, emailVerified: true }),
    });
    const answer = await completeGoogle(run.world, REQUEST);
    expect(answer.flash).toEqual({ kind: 'google-unverified' });
    expect(run.done.some((step) => step.startsWith('register'))).toBe(false);
  });
});

describe('completeGoogle: an error anywhere', () => {
  it('is the failure message, never a thrown error, with the trip forgotten and the kind logged', async () => {
    const run = fakeWorld();
    const broken: GoogleWorld = {
      ...run.world,
      findBySub: () => Promise.reject(new Error('db down')),
    };
    expect(await completeGoogle(broken, REQUEST)).toEqual(FAILURE);
    expect(run.errors).toHaveLength(1);
    expect(run.done).toContain('forget');
    expect(run.logged).toEqual(['error']);
  });

  it('logs no code, state, sub, address or name', async () => {
    const run = fakeWorld({ byEmail: ME });
    await completeGoogle(run.world, REQUEST);
    const text = JSON.stringify(run.logged);
    for (const secret of ['a-code', TRIP.state, SUB, 'jonas', 'Jonaitis']) {
      expect(text).not.toContain(secret);
    }
  });
});
