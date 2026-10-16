import { AccountBusyError, type SignedInPlayer } from '@sportbet/db';
import { instantFrom, playerId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import type { Flash } from '../flash';
import {
  answerProfilePost,
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
  type ProfileWorld,
} from './profile-action';

const PLAYER: SignedInPlayer = {
  player: unwrap(playerId('7')),
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'player',
  lastTournament: null,
};
const AT = unwrap(instantFrom('2026-10-16T12:00:00Z'));

function fakeWorld(player: SignedInPlayer | null = PLAYER) {
  const left: Flash[] = [];
  const world: ProfileWorld = {
    signedIn: () => Promise.resolve(player),
    leaveMessage: (flash) => {
      left.push(flash);
      return Promise.resolve();
    },
    now: () => AT,
  };
  return { world, left };
}

const post = (
  headers: Record<string, string> = {
    Origin: 'https://sportbet.lt',
    Host: 'sportbet.lt',
  },
  body = 'a=1',
) =>
  new Request('https://sportbet.lt/profile/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  });

const seen: ProfileRequest[] = [];
const recording =
  (answer: ProfileAnswer) =>
  (input: ProfileRequest): Promise<ProfileAnswer> => {
    seen.push(input);
    return Promise.resolve(answer);
  };

describe('answerProfilePost', () => {
  it('refuses a request from another site with 403, running nothing', async () => {
    seen.length = 0;
    const { world } = fakeWorld();
    const answer = await answerProfilePost(
      post({ Origin: 'https://evil.example', Host: 'sportbet.lt' }),
      recording(profileSaid({ kind: 'profile-updated' })),
      world,
    );
    expect(answer.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it('sends a guest home with a 303, running nothing', async () => {
    seen.length = 0;
    const { world, left } = fakeWorld(null);
    const answer = await answerProfilePost(
      post(),
      recording(profileSaid({ kind: 'profile-updated' })),
      world,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('Location')).toBe('/');
    expect(seen).toEqual([]);
    expect(left).toEqual([]);
  });

  it("runs for the session's player with the form, the client's address and the clock, and answers 303 to the profile with the message", async () => {
    seen.length = 0;
    const { world, left } = fakeWorld();
    const answer = await answerProfilePost(
      post(
        {
          Origin: 'https://sportbet.lt',
          Host: 'sportbet.lt',
          'X-Forwarded-For': '203.0.113.9, 10.0.0.1',
        },
        'name=Jonas',
      ),
      recording(profileSaid({ kind: 'profile-updated' })),
      world,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('Location')).toBe('/userProfile');
    expect(left).toEqual([{ kind: 'profile-updated' }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.player).toBe(PLAYER);
    expect(seen[0]?.form.get('name')).toBe('Jonas');
    expect(seen[0]?.ip).toBe('203.0.113.9');
    expect(seen[0]?.at).toBe(AT);
  });

  it('answers a redirect with no message without leaving one, and reads a body that is no form as an empty form', async () => {
    seen.length = 0;
    const { world, left } = fakeWorld();
    const answer = await answerProfilePost(
      new Request('https://sportbet.lt/profile', {
        method: 'POST',
        headers: {
          Origin: 'https://sportbet.lt',
          Host: 'sportbet.lt',
          'Content-Type': 'application/json',
        },
        body: '{"a":1}',
      }),
      recording({ kind: 'redirect', to: '/', flash: null }),
      world,
    );
    expect(answer.headers.get('Location')).toBe('/');
    expect(left).toEqual([]);
    expect([...(seen[0]?.form.keys() ?? [])]).toEqual([]);
  });

  it("answers Laravel's 429 for a throttle, with Retry-After in seconds and no message", async () => {
    const { world, left } = fakeWorld();
    const answer = await answerProfilePost(
      post(),
      recording({ kind: 'throttled', minutes: 4 }),
      world,
    );
    expect(answer.status).toBe(429);
    expect(answer.headers.get('Retry-After')).toBe('240');
    expect(await answer.json()).toEqual({
      success: false,
      message: 'Per daug bandymų. Pabandykite dar kartą po 4 min.',
    });
    expect(left).toEqual([]);
  });

  it('answers 503 in words for a write that waited past its lock timeout or lost every race for its locks, leaving no message', async () => {
    const { world, left } = fakeWorld();
    const timeout = Object.assign(new Error('canceling statement'), {
      code: '55P03',
    });
    for (const failure of [
      new Error('query failed', { cause: timeout }),
      new AccountBusyError(PLAYER.player),
    ]) {
      const answer = await answerProfilePost(
        post(),
        () => Promise.reject(failure),
        world,
      );
      expect(answer.status).toBe(503);
      expect(await answer.text()).toBe(
        'Veiksmas neišsaugotas: duomenys užimti. Bandykite dar kartą.',
      );
    }
    expect(left).toEqual([]);
  });

  it('lets any other failure through', async () => {
    const { world } = fakeWorld();
    await expect(
      answerProfilePost(post(), () => Promise.reject(new Error('boom')), world),
    ).rejects.toThrow('boom');
  });
});
