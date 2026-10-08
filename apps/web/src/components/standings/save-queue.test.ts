import { describe, expect, it } from 'vitest';
import { saveQueue } from './save-queue';

/** A promise and the function that settles it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('saveQueue (decision 5: one post at a time, in order)', () => {
  it('the second post starts only once the first has answered', async () => {
    const run = saveQueue();
    const first = deferred<string>();
    const calls: string[] = [];
    const one = run(() => {
      calls.push('first');
      return first.promise;
    });
    const two = run(() => {
      calls.push('second');
      return Promise.resolve('second answer');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['first']);
    first.resolve('first answer');
    expect(await one).toBe('first answer');
    expect(await two).toBe('second answer');
    expect(calls).toEqual(['first', 'second']);
  });

  it('a post that fails does not stop the next; its own caller sees the failure', async () => {
    const run = saveQueue();
    const first = deferred<string>();
    const one = run(() => first.promise);
    const two = run(() => Promise.resolve('sent'));
    first.reject(new Error('lost'));
    await expect(one).rejects.toThrow('lost');
    expect(await two).toBe('sent');
  });

  it('the thunk is called when the post is sent, not when it is queued', async () => {
    const run = saveQueue();
    const first = deferred<undefined>();
    let place = 1;
    void run(() => first.promise);
    const two = run(() => Promise.resolve(place));
    place = 2;
    first.resolve(undefined);
    expect(await two).toBe(2);
  });
});
