import { expect, it } from 'vitest';
import { localeInvariant } from './player-settings';
import { adminLevelInvariant } from './role';

it("carries sportbet's two locales and its admin levels as they are", () => {
  expect(localeInvariant.schema.safeParse('lt').success).toBe(true);
  expect(localeInvariant.schema.safeParse('en').success).toBe(true);
  expect(localeInvariant.schema.safeParse('de').success).toBe(false);
  for (const level of [0, 1, 5, 8, 9]) {
    expect(adminLevelInvariant.schema.safeParse(level).success).toBe(true);
  }
  expect(adminLevelInvariant.schema.safeParse(-1).success).toBe(false);
});
