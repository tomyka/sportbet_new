import {
  ok,
  refuse,
  type LeagueId,
  type PaymentsEntry,
  type PaymentTotals,
} from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerPaymentsSave, type PaymentsWorld } from './save-payments';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');
const TOTALS: PaymentTotals = {
  collected: 123450,
  expected: 400000,
  paidCount: 2,
  memberCount: 5,
};

interface Saved {
  readonly league: LeagueId;
  readonly entry: PaymentsEntry;
}

function world(
  overrides: Partial<PaymentsWorld> = {},
): PaymentsWorld & LeftMessages & { readonly saved: Saved[] } {
  const saved: Saved[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    leagueExists: () => Promise.resolve(true),
    save: (save) => {
      saved.push({ league: save.league, entry: save.entry });
      return Promise.resolve(ok(TOTALS));
    },
    ...overrides,
    saved,
  };
}

const JSON_ACCEPT = { accept: 'application/json' };

describe('answerPaymentsSave (LeaguePaymentController::update)', () => {
  it('answers an autosave with the totals as strings and cents', async () => {
    const here = world();
    const answer = await answerPaymentsSave(
      leaguePost(
        '/leagues/9/payments/save',
        { 'paid[12]': '10,5' },
        JSON_ACCEPT,
      ),
      here,
      '9',
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      saved: true,
      collectedCents: 123450,
      expectedCents: 400000,
      paidCount: 2,
      memberCount: 5,
    });
    expect(here.saved).toEqual([
      { league: asLeague(9), entry: new Map([[12, 1050]]) },
    ]);
  });

  it('a form post is a 303 back to the payments page with the message', async () => {
    const here = world();
    const answer = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }),
      here,
      '9',
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues/9/payments');
    expect(here.left).toEqual(['payments-saved']);
  });

  it('a blank box is saved as unpaid', async () => {
    const here = world();
    await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '' }, JSON_ACCEPT),
      here,
      '9',
    );
    expect(here.saved[0]?.entry).toEqual(new Map([[12, null]]));
  });

  it("a bad amount is Laravel's 422 naming paid.<id>, and nothing is saved", async () => {
    const here = world();
    const answer = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '-5' }, JSON_ACCEPT),
      here,
      '9',
    );
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message: 'The paid.12 field must be at least 0.',
      errors: { 'paid.12': ['The paid.12 field must be at least 0.'] },
    });
    expect(here.saved).toEqual([]);
  });

  it('validates before the admin check: a bad amount from a plain member is 422, a good one 403', async () => {
    const plain = world({
      save: () => Promise.resolve(refuse('not-an-admin')),
    });
    const bad = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': 'x' }, JSON_ACCEPT),
      plain,
      '9',
    );
    expect(bad.status).toBe(422);
    const good = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }, JSON_ACCEPT),
      plain,
      '9',
    );
    expect(good.status).toBe(403);
  });

  it('the public league is 403 as well', async () => {
    const answer = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }),
      world({ save: () => Promise.resolve(refuse('public-league')) }),
      '9',
    );
    expect(answer.status).toBe(403);
  });

  it("another league's member id is a 404", async () => {
    const answer = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }),
      world({ save: () => Promise.resolve(refuse('unknown-member')) }),
      '9',
    );
    expect(answer.status).toBe(404);
  });

  it('a league that is not there is a 404, even before a bad form is reported', async () => {
    const gone = world({
      leagueExists: () => Promise.resolve(false),
      save: () => Promise.resolve(refuse('no-such-league')),
    });
    const good = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }),
      gone,
      '9',
    );
    const bad = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': 'x' }),
      gone,
      '9',
    );
    expect([good.status, bad.status]).toEqual([404, 404]);
  });

  it.each(['abc', '0', '-3', '1.5', ''])(
    'the segment %j is no league: a 404',
    async (segment) => {
      const here = world();
      const answer = await answerPaymentsSave(
        leaguePost('/leagues/x/payments/save', { 'paid[12]': '5' }),
        here,
        segment,
      );
      expect(answer.status).toBe(404);
      expect(here.saved).toEqual([]);
    },
  );

  it('a post from another site is a 403 before anything is read', async () => {
    const here = world();
    const answer = await answerPaymentsSave(
      leaguePost(
        '/leagues/9/payments/save',
        { 'paid[12]': '5' },
        { origin: 'https://evil.example' },
      ),
      here,
      '9',
    );
    expect(answer.status).toBe(403);
    expect(here.saved).toEqual([]);
  });

  it('a guest is sent to /login, and answered 401 when the request wants JSON', async () => {
    const guest = { ...world(), ...fakeLeagueWorld(null) };
    const page = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }),
      guest,
      '9',
    );
    expect(page.headers.get('location')).toBe('/login');
    const autosave = await answerPaymentsSave(
      leaguePost('/leagues/9/payments/save', { 'paid[12]': '5' }, JSON_ACCEPT),
      guest,
      '9',
    );
    expect(autosave.status).toBe(401);
  });
});
