/**
 * Every post the ladder makes, one at a time and in order (decision 5): a
 * post starts only once the one before it has answered, so a row save
 * never meets the places of a reorder still in flight. `run` takes a
 * thunk, so a row's body is built when it is sent, from the places last
 * saved. A post that fails does not stop the next.
 */
export function saveQueue(): <T>(post: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(post: () => Promise<T>): Promise<T> {
    const next = tail.then(post, post);
    tail = next.catch(() => undefined);
    return next;
  };
}
