import { AccountBusyError } from '@sportbet/db/account';
import { player } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { throughDoor, type DoorKind } from './door';
import { SAVE_NOT_SAVED } from '../../components/save/laravel-save';

const post = (
  body: BodyInit | null = new URLSearchParams({ a: '1' }),
  site = 'same-origin',
) =>
  new Request('http://sportbet.test/x', {
    method: 'POST',
    headers: { 'sec-fetch-site': site },
    body,
  });

const lockTimeout = () => new Error('timeout', { cause: { code: '55P03' } });

const BUSY_WORDS =
  'Veiksmas neišsaugotas: duomenys užimti. Bandykite dar kartą.';

describe.each<DoorKind>(['form', 'fetch'])('the POST door, %s kind', (kind) => {
  it('refuses another site with a 403 before anyone is asked', async () => {
    const enter = vi.fn();
    const answer = vi.fn();
    const response = await throughDoor(post(null, 'cross-site'), {
      kind,
      enter,
      answer,
    });
    expect(response.status).toBe(403);
    expect(enter).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it('answers the response `enter` turns a request away with, reading nothing', async () => {
    const answer = vi.fn();
    const response = await throughDoor(post(), {
      kind,
      enter: () => Promise.resolve(new Response(null, { status: 401 })),
      answer,
    });
    expect(response.status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });

  it('hands the entrant and the posted form to the area', async () => {
    const seen: unknown[] = [];
    const response = await throughDoor(post(), {
      kind,
      enter: () => Promise.resolve({ who: 'jonas' }),
      answer: (entrant, form) => {
        seen.push(entrant, form.get('a'));
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    expect(response.status).toBe(204);
    expect(seen).toEqual([{ who: 'jonas' }, '1']);
  });

  it('reads a body that is no form as an empty one', async () => {
    const sizes: number[] = [];
    await throughDoor(
      new Request('http://sportbet.test/x', {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'same-origin',
          'content-type': 'multipart/form-data; boundary=x',
        },
        body: 'not a form',
      }),
      {
        kind,
        enter: () => Promise.resolve({}),
        answer: (_entrant, form) => {
          sizes.push([...form.keys()].length);
          return Promise.resolve(new Response(null));
        },
      },
    );
    expect(sizes).toEqual([0]);
  });

  it('throws any other failure on', async () => {
    await expect(
      throughDoor(post(), {
        kind,
        enter: () => Promise.resolve({}),
        answer: () => Promise.reject(new Error('boom')),
      }),
    ).rejects.toThrow('boom');
  });
});

describe('the POST door answers a lock timeout in its kind own shape', () => {
  it('form: a 503 in words, for a lock timeout and for a lost race of a deletion', async () => {
    for (const failure of [lockTimeout(), new AccountBusyError(player('7'))]) {
      const response = await throughDoor(post(), {
        kind: 'form',
        enter: () => Promise.resolve({}),
        answer: () => Promise.reject(failure),
      });
      expect(response.status).toBe(503);
      expect(response.headers.get('Content-Type')).toBe(
        'text/plain; charset=utf-8',
      );
      expect(await response.text()).toBe(BUSY_WORDS);
    }
  });

  it('fetch: a 503 in JSON for a lock timeout', async () => {
    const response = await throughDoor(post(), {
      kind: 'fetch',
      enter: () => Promise.resolve({}),
      answer: () => Promise.reject(lockTimeout()),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      message: SAVE_NOT_SAVED,
    });
  });

  it('fetch: no league action deletes an account, so a lost race is thrown on, as before', async () => {
    await expect(
      throughDoor(post(), {
        kind: 'fetch',
        enter: () => Promise.resolve({}),
        answer: () => Promise.reject(new AccountBusyError(player('7'))),
      }),
    ).rejects.toBeInstanceOf(AccountBusyError);
  });
});
