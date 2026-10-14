import { leagueId, ok, refuse } from '@sportbet/domain';
import { player, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { answerSwitch, type SwitchWorld } from './switch-league';

// LeagueController::switchLeague's answers, with the session, the write and
// the message faked (the real ones are the feature tests').

vi.mock('../request-context', () => ({ signedInPlayer: vi.fn() }));

const JONAS = player('1');

const post = (
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return new Request('https://sportbet.example/leagues/switch', {
    method: 'POST',
    headers: {
      origin: 'https://sportbet.example',
      host: 'sportbet.example',
      ...headers,
    },
    body,
  });
};

function world(overrides: Partial<SwitchWorld> = {}): SwitchWorld & {
  readonly selected: unknown[];
  readonly left: number[];
} {
  const selected: unknown[] = [];
  const left: number[] = [];
  return {
    signedIn: () => Promise.resolve({ player: JONAS }),
    select: (select) => {
      selected.push(select);
      return Promise.resolve(ok({ tournament: 1 }));
    },
    leaveMessage: () => {
      left.push(1);
      return Promise.resolve();
    },
    ...overrides,
    selected,
    left,
  };
}

describe('answerSwitch', () => {
  it('moves the selection and goes back to the referring page with the message', async () => {
    const here = world();
    const answer = await answerSwitch(
      post(
        { leagueID: '7' },
        { referer: 'https://sportbet.example/summary/chart?x=1' },
      ),
      here,
    );
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/summary/chart?x=1');
    expect(here.selected).toEqual([
      { player: JONAS, league: unwrap(leagueId(7)) },
    ]);
    expect(here.left).toHaveLength(1);
  });

  it('goes to the game page with no usable Referer', async () => {
    const answer = await answerSwitch(post({ leagueID: '7' }), world());
    expect(answer.headers.get('location')).toBe('/main');
  });

  it('refuses a post from another site before anything else', async () => {
    const here = world();
    const answer = await answerSwitch(
      post({ leagueID: '7' }, { origin: 'https://evil.example' }),
      here,
    );
    expect(answer.status).toBe(403);
    expect(here.selected).toEqual([]);
  });

  it('sends a guest to sign in', async () => {
    const here = world({ signedIn: () => Promise.resolve(null) });
    const answer = await answerSwitch(post({ leagueID: '7' }), here);
    expect(answer.status).toBe(303);
    expect(answer.headers.get('location')).toBe('/login');
    expect(here.selected).toEqual([]);
  });

  it("answers a refused field with Laravel's 422 body, writing nothing", async () => {
    const here = world();
    const answer = await answerSwitch(post({ leagueID: 'abc' }), here);
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({
      message: 'The league i d field must be an integer.',
      errors: { leagueID: ['The league i d field must be an integer.'] },
    });
    expect(here.selected).toEqual([]);
    expect(here.left).toEqual([]);
  });

  it('answers a missing field as required', async () => {
    const answer = await answerSwitch(post({}), world());
    expect(answer.status).toBe(422);
  });

  it('finds no league for an integer that is no id, writing nothing', async () => {
    const here = world();
    const answer = await answerSwitch(post({ leagueID: '0' }), here);
    expect(answer.status).toBe(404);
    expect(here.selected).toEqual([]);
  });

  it('finds no league for one the player is not a member of, leaving no message', async () => {
    const here = world({
      select: () => Promise.resolve(refuse('not-a-member')),
    });
    const answer = await answerSwitch(post({ leagueID: '7' }), here);
    expect(answer.status).toBe(404);
    expect(here.left).toEqual([]);
  });

  it('reads a body that is no form as an empty one', async () => {
    const request = new Request('https://sportbet.example/leagues/switch', {
      method: 'POST',
      headers: { origin: 'https://sportbet.example', host: 'sportbet.example' },
      body: 'not a form',
    });
    expect((await answerSwitch(request, world())).status).toBe(422);
  });
});
