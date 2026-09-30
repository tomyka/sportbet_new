import { describe, expect, it } from 'vitest';
import { usernameInvariant } from './player';

describe('usernameInvariant', () => {
  it('accepts every username sportbet accepts, up to 255 characters', () => {
    expect(usernameInvariant.schema.safeParse('ada').success).toBe(true);
    expect(usernameInvariant.maxLength).toBe(255);
  });

  it('refuses a blank username, naming the invariant', () => {
    const result = usernameInvariant.schema.safeParse('  ');
    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'Not a valid username',
    ]);
  });
});
