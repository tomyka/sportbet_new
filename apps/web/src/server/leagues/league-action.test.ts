import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeLeagueWorld,
  leaguePost,
} from '../../../tests/support/league-requests';
import {
  answerLeagueAction,
  backWith,
  idAnswer,
  toLeagues,
} from './league-action';

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

describe('answerLeagueAction', () => {
  it('refuses a post from another site with a 403 before anything is read', async () => {
    const world = fakeLeagueWorld(JONAS);
    const run = vi.fn();
    const answer = await answerLeagueAction(
      leaguePost('/leagues/create', {}, { origin: 'https://evil.example' }),
      world,
      run,
    );
    expect(answer.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('sends a guest to sign in', async () => {
    const run = vi.fn();
    const answer = await answerLeagueAction(
      leaguePost('/leagues/create', {}),
      fakeLeagueWorld(null),
      run,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/login');
    expect(run).not.toHaveBeenCalled();
  });

  it('answers 503 for a write that waited past its lock timeout, and rethrows any other failure', async () => {
    const answer = await answerLeagueAction(
      leaguePost('/leagues/create', {}),
      fakeLeagueWorld(JONAS),
      () => Promise.reject(new Error('lock', { cause: { code: '55P03' } })),
    );
    expect(answer.status).toBe(503);
    expect(await answer.json()).toMatchObject({ success: false });
    await expect(
      answerLeagueAction(
        leaguePost('/leagues/create', {}),
        fakeLeagueWorld(JONAS),
        () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');
  });

  it('hands the player and the posted form to the action', async () => {
    const seen: unknown[] = [];
    await answerLeagueAction(
      leaguePost('/leagues/create', { name: 'A' }),
      fakeLeagueWorld(JONAS),
      (input) => {
        seen.push(input.player, input.form.get('name'));
        return Promise.resolve(toLeagues('league-created'));
      },
    );
    expect(seen).toEqual([JONAS, 'A']);
  });

  it('reads a body that is no form as an empty one', async () => {
    const request = new Request('https://sportbet.example/leagues/create', {
      method: 'POST',
      headers: {
        origin: 'https://sportbet.example',
        host: 'sportbet.example',
        'content-type': 'multipart/form-data; boundary=x',
      },
      body: 'not a form',
    });
    let size = -1;
    await answerLeagueAction(request, fakeLeagueWorld(JONAS), (input) => {
      size = [...input.form.keys()].length;
      return Promise.resolve({ kind: 'not-found' });
    });
    expect(size).toBe(0);
  });

  it('answers a redirect with a 303 to its path and leaves the message', async () => {
    const world = fakeLeagueWorld(JONAS);
    const answer = await answerLeagueAction(
      leaguePost('/leagues/create', {}),
      world,
      () => Promise.resolve(toLeagues('league-created')),
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/leagues');
    expect(world.left).toEqual(['league-created']);
  });

  it('answers "back" with a 303 to the referring path, else the league page', async () => {
    const world = fakeLeagueWorld(JONAS);
    const withReferer = await answerLeagueAction(
      leaguePost(
        '/leagues/leave',
        {},
        { referer: 'https://sportbet.example/main?x=1' },
      ),
      world,
      () => Promise.resolve(backWith('leave-owner')),
    );
    expect(withReferer.headers.get('location')).toBe('/main?x=1');
    const without = await answerLeagueAction(
      leaguePost('/leagues/leave', {}),
      world,
      () => Promise.resolve(backWith('leave-owner')),
    );
    expect(without.headers.get('location')).toBe('/leagues');
    expect(world.left).toEqual(['leave-owner', 'leave-owner']);
  });

  it("answers an invalid form with Laravel's 422 body and leaves no message", async () => {
    const world = fakeLeagueWorld(JONAS);
    const answer = await answerLeagueAction(
      leaguePost('/leagues/create', {}),
      world,
      () =>
        Promise.resolve({
          kind: 'invalid',
          body: { message: 'm', errors: { name: ['m'] } },
        }),
    );
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message: 'm',
      errors: { name: ['m'] },
    });
    expect(world.left).toEqual([]);
  });

  it('answers not-found with a bare 404 and forbidden with a bare 403', async () => {
    const world = fakeLeagueWorld(JONAS);
    const missing = await answerLeagueAction(
      leaguePost('/leagues/x', {}),
      world,
      () => Promise.resolve({ kind: 'not-found' }),
    );
    const refused = await answerLeagueAction(
      leaguePost('/leagues/x', {}),
      world,
      () => Promise.resolve({ kind: 'forbidden' }),
    );
    expect([missing.status, refused.status]).toEqual([404, 403]);
    expect(world.left).toEqual([]);
  });
});

describe('idAnswer', () => {
  it("is Laravel's 422 for a refused id and a 404 for an id no row has", () => {
    expect(
      idAnswer({
        kind: 'refused',
        field: 'inviteID',
        message: 'The invite i d field is required.',
      }),
    ).toEqual({
      kind: 'invalid',
      body: {
        message: 'The invite i d field is required.',
        errors: { inviteID: ['The invite i d field is required.'] },
      },
    });
    expect(idAnswer({ kind: 'no-such-row' })).toEqual({ kind: 'not-found' });
  });
});

describe('answerLeagueAction: a JSON request (an autosave)', () => {
  const json = { accept: 'application/json' };

  it('answers a guest 401 as Laravel does when the action asks for it, a page request still /login', async () => {
    const run = vi.fn();
    const asked = await answerLeagueAction(
      leaguePost('/x', {}, json),
      fakeLeagueWorld(null),
      run,
      { unauthenticatedJson: true },
    );
    expect(asked.status).toBe(401);
    expect(await asked.json()).toEqual({ message: 'Unauthenticated.' });
    const page = await answerLeagueAction(
      leaguePost('/x', {}),
      fakeLeagueWorld(null),
      run,
      { unauthenticatedJson: true },
    );
    expect(page.headers.get('location')).toBe('/login');
    expect(run).not.toHaveBeenCalled();
  });

  it('sends a guest to /login when the action does not ask for 401, even for JSON', async () => {
    const answer = await answerLeagueAction(
      leaguePost('/x', {}, json),
      fakeLeagueWorld(null),
      vi.fn(),
    );
    expect(answer.headers.get('location')).toBe('/login');
  });

  it('sends a guest, JSON or not, where the action says a refused caller goes (the superadmin doors: home)', async () => {
    const run = vi.fn();
    for (const headers of [{}, json]) {
      const answer = await answerLeagueAction(
        leaguePost('/x', {}, headers),
        fakeLeagueWorld(null),
        run,
        { unauthenticatedJson: true, refusedAt: '/' },
      );
      expect([answer.status, answer.headers.get('location')]).toEqual([
        303,
        '/',
      ]);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('answers a json result with its body and a 200', async () => {
    const answer = await answerLeagueAction(
      leaguePost('/x', {}, json),
      fakeLeagueWorld(JONAS),
      () => Promise.resolve({ kind: 'json', body: { saved: true } }),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ saved: true });
  });
});
