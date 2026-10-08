import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { signedInPlayer } from '../request-context';
import {
  autosaveRoute,
  forbidden,
  notFound,
  refuseCrossSite,
  seeOther,
} from './route-responses';

// The route handlers' answers: a real 303 after every write (proxy.ts
// then reads the next page's message), and the same-origin POST guard
// (#16).

// Who is signed in is the session's (request-context.ts): each test says.
vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

describe('route responses', () => {
  it('seeOther: a 303 to the location, with no body', async () => {
    const response = seeOther('/tournament/x');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/tournament/x');
    expect(await response.text()).toBe('');
  });

  it('notFound and forbidden: a bare 404 and 403', () => {
    expect(notFound().status).toBe(404);
    expect(forbidden().status).toBe(403);
  });

  it('refuseCrossSite: a 403 for a request from another site, nothing for this one', () => {
    const from = (headers: Record<string, string>) =>
      new Request('https://sportbet.example/x', { method: 'POST', headers });
    expect(
      refuseCrossSite(
        from({ origin: 'https://evil.example', host: 'sportbet.example' }),
      )?.status,
    ).toBe(403);
    expect(refuseCrossSite(from({ host: 'sportbet.example' }))?.status).toBe(
      403,
    );
    expect(
      refuseCrossSite(
        from({ origin: 'https://sportbet.example', host: 'sportbet.example' }),
      ),
    ).toBeNull();
  });
});

describe("autosaveRoute (every autosave's POST)", () => {
  const post = (body: BodyInit | null, origin = 'https://sportbet.example') =>
    new Request('https://sportbet.example/x/save', {
      method: 'POST',
      headers: {
        origin,
        host: 'sportbet.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  const signedIn = () => {
    vi.mocked(signedInPlayer).mockResolvedValue({
      player: player('7'),
      name: 'Jonas',
      surname: 'Jonaitis',
      role: 'player',
      lastTournament: null,
    });
  };

  it('another site: 403, and the save never runs', async () => {
    signedIn();
    const save = vi.fn();
    const response = await autosaveRoute(
      post('a=1', 'https://evil.example'),
      save,
    );
    expect(response.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("a guest: sportbet's auth answer to a JSON request, 401 Unauthenticated.", async () => {
    vi.mocked(signedInPlayer).mockResolvedValue(null);
    const save = vi.fn();
    const response = await autosaveRoute(post('a=1'), save);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'Unauthenticated.' });
    expect(save).not.toHaveBeenCalled();
  });

  it("a player: the save gets them and the form, and its answer is the response's JSON", async () => {
    signedIn();
    const response = await autosaveRoute(post('a=1'), (who, form) =>
      Promise.resolve({
        status: 422,
        body: { player: who, a: form.get('a') },
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ player: '7', a: '1' });
  });

  it('a body that is no form is read as an empty one', async () => {
    signedIn();
    const response = await autosaveRoute(
      new Request('https://sportbet.example/x/save', {
        method: 'POST',
        headers: {
          origin: 'https://sportbet.example',
          host: 'sportbet.example',
          'content-type': 'multipart/form-data; boundary=x',
        },
        body: 'not a form',
      }),
      (_who, form) =>
        Promise.resolve({ status: 200, body: { fields: [...form.keys()] } }),
    );
    expect(await response.json()).toEqual({ fields: [] });
  });
});
