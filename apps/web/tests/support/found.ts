// What a test asked for and expects to be there: a missing one is the
// test's failure, said in words, not a cast.

/** `value`, or a failure when it is null or undefined. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('expected something, found nothing');
  }
  return value;
}

/** The item at `index`, or a failure when there is none. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `expected an item at ${String(index)}, found ${String(items.length)}`,
    );
  }
  return item;
}
