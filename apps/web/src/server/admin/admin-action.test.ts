import type { SignedInPlayer } from '@sportbet/db';
import { isSuperadmin, type Role } from '@sportbet/domain';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Flash } from '../flash';
import { answerAdminPost, type AdminWorld } from './admin-action';
import {
  goTo,
  HOME,
  invalid,
  NOT_FOUND,
  said,
  throttledTo,
  type AdminAnswer,
} from './admin-answer';

const ADMIN: SignedInPlayer = {
  player: player('1'),
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'superadmin',
  lastTournament: null,
};

/** A world with a signed-in admin (or none), recording what it was asked and told. */
function world(admin: SignedInPlayer | null) {
  const asked: ((role: Role) => boolean)[] = [];
  const left: Flash[] = [];
  const fake: AdminWorld = {
    gate: (permission) => {
      asked.push(permission);
      return Promise.resolve(admin);
    },
    leaveMessage: (flash) => {
      left.push(flash);
      return Promise.resolve();
    },
  };
  return { fake, asked, left };
}

const post = (body: BodyInit | null = new URLSearchParams({ a: '1' })) =>
  new Request('http://sportbet.test/admin/x', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin' },
    body,
  });

describe('the admin POST skeleton (#16, decision 2, R-26 amended)', () => {
  it('a request from another site is a 403, and nothing is asked or run', async () => {
    const { fake, asked } = world(ADMIN);
    const run = vi.fn();
    const crossSite = new Request('http://sportbet.test/admin/x', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    const response = await answerAdminPost(crossSite, isSuperadmin, run, fake);
    expect(response.status).toBe(403);
    expect(asked).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('a role the permission refuses goes home with a 303, and nothing is run', async () => {
    const { fake, asked } = world(null);
    const run = vi.fn();
    const response = await answerAdminPost(post(), isSuperadmin, run, fake);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(asked).toEqual([isSuperadmin]);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs with the admin and the posted form, and answers a real 303 with the message left for the next page', async () => {
    const { fake, left } = world(ADMIN);
    const seen: { admin: SignedInPlayer; a: FormDataEntryValue | null }[] = [];
    const response = await answerAdminPost(
      post(),
      isSuperadmin,
      ({ admin, form }) => {
        seen.push({ admin, a: form.get('a') });
        return Promise.resolve(
          said('/admin/games', 'game-added', { number: 7 }),
        );
      },
      fake,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/admin/games');
    expect(seen).toEqual([{ admin: ADMIN, a: '1' }]);
    expect(left).toEqual([{ kind: 'admin', message: 'game-added', number: 7 }]);
  });

  it('a body that is no form is read as an empty one', async () => {
    const { fake } = world(ADMIN);
    const entries: number[] = [];
    const response = await answerAdminPost(
      post('not a form'),
      isSuperadmin,
      ({ form }) => {
        entries.push([...form.keys()].length);
        return Promise.resolve(goTo('/admin/index'));
      },
      fake,
    );
    expect(response.status).toBe(303);
    expect(entries).toEqual([0]);
  });

  it.each<[string, AdminAnswer, number, string | null]>([
    ['nothing to say', goTo('/admin/confirm'), 303, '/admin/confirm'],
    ['an id no row has', NOT_FOUND, 404, null],
    ['a role the action refuses', HOME, 303, '/'],
  ])(
    'answers %s without leaving a message',
    async (_name, answer, status, to) => {
      const { fake, left } = world(ADMIN);
      const response = await answerAdminPost(
        post(),
        isSuperadmin,
        () => Promise.resolve(answer),
        fake,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('location')).toBe(to);
      expect(left).toEqual([]);
    },
  );

  it('a write that waited past its 5 s lock timeout is a 503, in words', async () => {
    const { fake, left } = world(ADMIN);
    const response = await answerAdminPost(
      post(),
      isSuperadmin,
      () => Promise.reject(new Error('timeout', { cause: { code: '55P03' } })),
      fake,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(
      'Veiksmas neišsaugotas: duomenys užimti. Bandykite dar kartą.',
    );
    expect(left).toEqual([]);
  });

  it('any other failure is thrown on', async () => {
    const { fake } = world(ADMIN);
    await expect(
      answerAdminPost(
        post(),
        isSuperadmin,
        () => Promise.reject(new Error('boom')),
        fake,
      ),
    ).rejects.toThrow('boom');
  });
});

describe('the admin answers', () => {
  it('said: a message of its own name, with what it names', () => {
    expect(said('/admin/games', 'has-result')).toEqual({
      kind: 'redirect',
      to: '/admin/games',
      flash: { kind: 'admin', message: 'has-result' },
    });
    expect(
      said('/admin/index', 'context-chosen', { name: 'Euroleague' }),
    ).toEqual({
      kind: 'redirect',
      to: '/admin/index',
      flash: { kind: 'admin', message: 'context-chosen', name: 'Euroleague' },
    });
  });

  it('invalid: the refused fields listed, at most twelve (a cookie holds 4 KB)', () => {
    const problems = Array.from({ length: 15 }, (_, row) => ({
      field: 'place',
      problem: 'bad-place',
      row,
    }));
    const answer = invalid('/admin/teams', problems);
    expect(answer).toMatchObject({ kind: 'redirect', to: '/admin/teams' });
    if (answer.kind !== 'redirect' || answer.flash?.kind !== 'admin-invalid') {
      throw new Error('not an invalid answer');
    }
    expect(answer.flash.problems).toEqual(problems.slice(0, 12));
  });

  it('throttledTo: the page says for how long', () => {
    expect(throttledTo('/admin/games', 2)).toEqual({
      kind: 'redirect',
      to: '/admin/games',
      flash: { kind: 'throttled', minutes: 2 },
    });
  });
});
