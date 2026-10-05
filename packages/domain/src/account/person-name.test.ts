import { expect, it } from 'vitest';
import { personNameInvariant } from './person-name';

it('takes an empty name, as a Google sign-up stores a missing surname, and refuses one past 255 characters', () => {
  expect(personNameInvariant.schema.safeParse('').success).toBe(true);
  expect(personNameInvariant.schema.safeParse('Žilvinas').success).toBe(true);
  expect(personNameInvariant.schema.safeParse('a'.repeat(256)).success).toBe(
    false,
  );
});
