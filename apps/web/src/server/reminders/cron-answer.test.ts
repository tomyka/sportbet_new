import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerCron } from './cron-answer';
import type { RunResult } from './send-reminders';

const SECRET = 'cron-tests-only-not-a-secret-0123456789ab';

const SUMMARY: RunResult = { sent: 2, refused: 1, failed: 0, deferred: 0 };

const post = (authorization?: string): Request =>
  new Request('https://sportbet.lt/api/cron/reminders', {
    method: 'POST',
    headers:
      authorization === undefined ? {} : { Authorization: authorization },
  });

function world(result: RunResult | Error = SUMMARY) {
  const run = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { secret: SECRET, run };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// R-97: an unauthenticated-by-session write, guarded by its bearer secret only.
describe('answerCron', () => {
  it('runs for the bearer secret, answering 200 with the counts and no caching', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const given = world();
    const answer = await answerCron(post(`Bearer ${SECRET}`), given);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(SUMMARY);
    expect(answer.headers.get('Cache-Control')).toBe('no-store');
    expect(given.run).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(
      `${JSON.stringify({ event: 'reminders', sent: 2, refused: 1, failed: 0, deferred: 0 })}\n`,
    );
  });

  it("answers a held lease as 200 { skipped: 'running' }", async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const answer = await answerCron(
      post(`Bearer ${SECRET}`),
      world({ skipped: 'running' }),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ skipped: 'running' });
  });

  it('answers 401 with no body, and runs nothing, for no header or a wrong secret', async () => {
    for (const header of [
      undefined,
      '',
      'Bearer',
      'Bearer ',
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      `bearer ${SECRET}`,
      `Basic ${SECRET}`,
      SECRET,
      `Bearer  ${SECRET}`,
    ]) {
      const given = world();
      const answer = await answerCron(post(header), given);
      expect(answer.status).toBe(401);
      expect(await answer.text()).toBe('');
      expect(given.run).not.toHaveBeenCalled();
    }
  });

  it('answers 503 with no body, and runs nothing, while CRON_SECRET is not configured, even for an empty bearer', async () => {
    for (const header of [undefined, 'Bearer ', 'Bearer undefined']) {
      const given = { ...world(), secret: undefined };
      const answer = await answerCron(post(header), given);
      expect(answer.status).toBe(503);
      expect(await answer.text()).toBe('');
      expect(given.run).not.toHaveBeenCalled();
    }
  });

  it('answers 500 with no body when the run fails, logging its kind and never its message', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failing = world(new TypeError(`password for ${SECRET}`));
    const answer = await answerCron(post(`Bearer ${SECRET}`), failing);
    expect(answer.status).toBe(500);
    expect(await answer.text()).toBe('');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('reminders: the run failed (TypeError)');
  });

  it('never logs the secret or the header it was given', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await answerCron(post('Bearer wrong-secret-value'), world());
    await answerCron(post(`Bearer ${SECRET}`), world(new Error(SECRET)));
    const logged = JSON.stringify([stdout.mock.calls, error.mock.calls]);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('wrong-secret-value');
  });
});
