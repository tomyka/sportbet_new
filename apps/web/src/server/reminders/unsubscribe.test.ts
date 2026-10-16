import { playerId, type PlayerId } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  answerUnsubscribe,
  unsubscribeViewOf,
  type UnsubscribeWorld,
} from './unsubscribe';
import { unsubscribePaths, unsubscribeSignature } from './unsubscribe-link';

const SECRET = 'unsubscribe-tests-only-not-a-secret-0123';
const player = (id: number): PlayerId => unwrap(playerId(String(id)));
const SIGNATURE = unsubscribeSignature(player(7), SECRET);

describe('unsubscribeViewOf (the page)', () => {
  it("is the confirmation, posting to the player's confirm address, for a signature that opens", () => {
    expect(unsubscribeViewOf('7', SIGNATURE, SECRET)).toEqual({
      kind: 'confirm',
      confirmPath: unsubscribePaths(player(7), SIGNATURE).confirmPath,
    });
  });

  it('is the invalid view for another player, a missing or forged signature, and an id that is none', () => {
    for (const [user, signature] of [
      ['8', SIGNATURE],
      ['7', undefined],
      ['7', ''],
      ['7', `${SIGNATURE}x`],
      ['7', unsubscribeSignature(player(7), `${SECRET}-other`)],
      ['abc', SIGNATURE],
      ['07', SIGNATURE],
      ['-7', SIGNATURE],
      ['0', SIGNATURE],
      ['99999999999', SIGNATURE],
    ] as const) {
      expect(unsubscribeViewOf(user, signature, SECRET)).toEqual({
        kind: 'invalid',
      });
    }
  });
});

interface Spies {
  readonly world: UnsubscribeWorld;
  readonly turnedOff: PlayerId[];
  readonly messages: number[];
}

function fakeWorld(unknownPlayer = false): Spies {
  const turnedOff: PlayerId[] = [];
  const messages: number[] = [];
  return {
    turnedOff,
    messages,
    world: {
      secret: SECRET,
      turnOff: (who) => {
        turnedOff.push(who);
        return Promise.resolve(unknownPlayer ? 'unknown-player' : 'turned-off');
      },
      leaveMessage: () => {
        messages.push(1);
        return Promise.resolve();
      },
    },
  };
}

const post = (
  signature: string | null,
  body: string | undefined,
  headers: Record<string, string> = {},
): Request =>
  new Request(
    `https://sportbet.lt/profile/notifications/unsubscribe/7/confirm${
      signature === null ? '' : `?signature=${signature}`
    }`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: body ?? null,
    },
  );

// R-98: the button's POST and RFC 8058's one-click POST; the signature is the
// only authority (no session, and mail providers post with no Origin).
describe('answerUnsubscribe', () => {
  it("turns the player's reminders off and answers a 303 home with the flash for the button's POST", async () => {
    const run = fakeWorld();
    const answer = await answerUnsubscribe(post(SIGNATURE, ''), '7', run.world);
    expect(answer.status).toBe(303);
    expect(answer.headers.get('Location')).toBe('/');
    expect(run.turnedOff).toEqual([player(7)]);
    expect(run.messages).toHaveLength(1);
  });

  it('answers 200 with no redirect and no message for the one-click body', async () => {
    const run = fakeWorld();
    const answer = await answerUnsubscribe(
      post(SIGNATURE, 'List-Unsubscribe=One-Click'),
      '7',
      run.world,
    );
    expect(answer.status).toBe(200);
    expect(answer.headers.get('Location')).toBeNull();
    expect(run.turnedOff).toEqual([player(7)]);
    expect(run.messages).toEqual([]);
  });

  it('takes the one-click POST with no Origin, as a mail provider sends it', async () => {
    const run = fakeWorld();
    const request = post(SIGNATURE, 'List-Unsubscribe=One-Click');
    expect(request.headers.get('origin')).toBeNull();
    expect((await answerUnsubscribe(request, '7', run.world)).status).toBe(200);
  });

  it('reads any other body, or none, as the button', async () => {
    for (const body of ['', undefined, 'List-Unsubscribe=Other', 'x=1']) {
      const run = fakeWorld();
      const answer = await answerUnsubscribe(
        post(SIGNATURE, body),
        '7',
        run.world,
      );
      expect(answer.status).toBe(303);
      expect(run.turnedOff).toEqual([player(7)]);
    }
  });

  it('answers 403, changes nothing and leaves no message for a signature that does not open', async () => {
    for (const [user, signature] of [
      ['7', null],
      ['7', ''],
      ['7', 'a'.repeat(64)],
      ['7', `${SIGNATURE}x`],
      ['8', SIGNATURE],
      ['abc', SIGNATURE],
      ['7', unsubscribeSignature(player(7), `${SECRET}-other`)],
    ] as const) {
      for (const body of ['', 'List-Unsubscribe=One-Click']) {
        const run = fakeWorld();
        const answer = await answerUnsubscribe(
          post(signature, body),
          user,
          run.world,
        );
        expect(answer.status).toBe(403);
        expect(await answer.text()).toBe('');
        expect(run.turnedOff).toEqual([]);
        expect(run.messages).toEqual([]);
      }
    }
  });

  it('answers a deleted account the same way as a live one: no enumeration', async () => {
    const live = await answerUnsubscribe(
      post(SIGNATURE, ''),
      '7',
      fakeWorld().world,
    );
    const gone = await answerUnsubscribe(
      post(SIGNATURE, ''),
      '7',
      fakeWorld(true).world,
    );
    expect(gone.status).toBe(live.status);
    expect(gone.headers.get('Location')).toBe(live.headers.get('Location'));
  });
});
