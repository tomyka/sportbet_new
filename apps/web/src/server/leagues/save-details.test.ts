import { ok, refuse, type DetailsEntry, type LeagueId } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
  type LeftMessages,
} from '../../../tests/support/league-requests';
import { asLeague } from './id-field';
import { answerDetailsSave, type DetailsWorld } from './save-details';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

interface Saved {
  readonly league: LeagueId;
  readonly entry: DetailsEntry;
}

function world(
  overrides: Partial<DetailsWorld> = {},
): DetailsWorld & LeftMessages & { readonly saved: Saved[] } {
  const saved: Saved[] = [];
  return {
    ...fakeLeagueWorld(JONAS),
    leagueExists: () => Promise.resolve(true),
    save: (save) => {
      saved.push({ league: save.league, entry: save.entry });
      return Promise.resolve(ok(undefined));
    },
    ...overrides,
    saved,
  };
}

const PATH = '/leagues/9/payment-details';
const GOOD = {
  payment_beneficiary: 'Jonas Jonaitis',
  payment_iban: 'lt12 1000 0111 0100 1000',
  payment_note: 'Ačiū',
};

describe('answerDetailsSave (LeaguePaymentController::updateDetails)', () => {
  it('saves the details, the IBAN compact, and says so on the payments page', async () => {
    const here = world();
    const answer = await answerDetailsSave(leaguePost(PATH, GOOD), here, '9');
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues/9/payments');
    expect(here.left).toEqual(['details-saved']);
    expect(here.saved).toEqual([
      {
        league: asLeague(9),
        entry: {
          beneficiary: 'Jonas Jonaitis',
          iban: 'LT121000011101001000',
          note: 'Ačiū',
        },
      },
    ]);
  });

  it('blank boxes clear the details', async () => {
    const here = world();
    await answerDetailsSave(leaguePost(PATH, {}), here, '9');
    expect(here.saved[0]?.entry).toEqual({
      beneficiary: null,
      iban: null,
      note: null,
    });
  });

  it('a failing checksum is a 303 with the error message and writes nothing', async () => {
    const here = world();
    const answer = await answerDetailsSave(
      leaguePost(PATH, { ...GOOD, payment_iban: 'LT121000011101001080' }),
      here,
      '9',
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues/9/payments');
    expect(here.left).toEqual(['details-iban-invalid']);
    expect(here.saved).toEqual([]);
  });

  it('half a pair is a 303 with the error message and writes nothing', async () => {
    const here = world();
    const answer = await answerDetailsSave(
      leaguePost(PATH, { payment_beneficiary: 'Jonas' }),
      here,
      '9',
    );
    expect(answer.headers.get('location')).toBe('/leagues/9/payments');
    expect(here.left).toEqual(['details-half-pair']);
    expect(here.saved).toEqual([]);
  });

  it("a beneficiary of 71 characters is Laravel's 422", async () => {
    const here = world();
    const answer = await answerDetailsSave(
      leaguePost(PATH, { ...GOOD, payment_beneficiary: 'x'.repeat(71) }),
      here,
      '9',
    );
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message:
        'The payment beneficiary field must not be greater than 70 characters.',
      errors: {
        payment_beneficiary: [
          'The payment beneficiary field must not be greater than 70 characters.',
        ],
      },
    });
    expect(here.saved).toEqual([]);
  });

  it('a plain member with good boxes is 403, with a bad IBAN still the refusal first', async () => {
    const plain = world({
      save: () => Promise.resolve(refuse('not-an-admin')),
    });
    const good = await answerDetailsSave(leaguePost(PATH, GOOD), plain, '9');
    expect(good.status).toBe(403);
    const bad = await answerDetailsSave(
      leaguePost(PATH, { ...GOOD, payment_iban: 'LT131000011101001000' }),
      plain,
      '9',
    );
    expect(bad.status).toBe(303);
  });

  it('the public league is 403', async () => {
    const answer = await answerDetailsSave(
      leaguePost(PATH, GOOD),
      world({ save: () => Promise.resolve(refuse('public-league')) }),
      '9',
    );
    expect(answer.status).toBe(403);
  });

  it('a league that is not there is a 404, whatever the form says', async () => {
    const gone = world({
      leagueExists: () => Promise.resolve(false),
      save: () => Promise.resolve(refuse('no-such-league')),
    });
    const statuses = [];
    for (const fields of [
      GOOD,
      { payment_beneficiary: 'x'.repeat(71) },
      { payment_beneficiary: 'Jonas' },
    ]) {
      const answer = await answerDetailsSave(
        leaguePost(PATH, fields),
        gone,
        '9',
      );
      statuses.push(answer.status);
    }
    expect(statuses).toEqual([404, 404, 404]);
  });

  it('a segment that is no id is a 404', async () => {
    const here = world();
    const answer = await answerDetailsSave(leaguePost(PATH, GOOD), here, 'abc');
    expect(answer.status).toBe(404);
    expect(here.saved).toEqual([]);
  });

  it('a post from another site is a 403, and a guest is sent to /login', async () => {
    const cross = await answerDetailsSave(
      leaguePost(PATH, GOOD, { origin: 'https://evil.example' }),
      world(),
      '9',
    );
    expect(cross.status).toBe(403);
    const guest = await answerDetailsSave(
      leaguePost(PATH, GOOD, { accept: 'application/json' }),
      { ...world(), ...fakeLeagueWorld(null) },
      '9',
    );
    expect(guest.headers.get('location')).toBe('/login');
  });

  it('at the superadmin door a save comes back to the admin payments page, and a refused caller goes home', async () => {
    const door = {
      page: (league: number) => `/admin/leagues/${String(league)}/payments`,
      refusedAt: '/',
    };
    const done = await answerDetailsSave(
      leaguePost('/admin/leagues/9/payment-details', GOOD),
      world(),
      '9',
      door,
    );
    expect(done.headers.get('location')).toBe('/admin/leagues/9/payments');
    const refused = await answerDetailsSave(
      leaguePost('/admin/leagues/9/payment-details', GOOD),
      { ...world(), ...fakeLeagueWorld(null) },
      '9',
      door,
    );
    expect(refused.headers.get('location')).toBe('/');
  });
});
