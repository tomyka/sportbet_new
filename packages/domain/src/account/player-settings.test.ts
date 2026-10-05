import { expect, it } from 'vitest';
import {
  adminLevelInvariant,
  isAdmin,
  localeInvariant,
} from './player-settings';

it("carries sportbet's two locales and its admin levels as they are", () => {
  expect(localeInvariant.schema.safeParse('lt').success).toBe(true);
  expect(localeInvariant.schema.safeParse('en').success).toBe(true);
  expect(localeInvariant.schema.safeParse('de').success).toBe(false);
  for (const level of [0, 1, 5, 8, 9]) {
    expect(adminLevelInvariant.schema.safeParse(level).success).toBe(true);
  }
  expect(adminLevelInvariant.schema.safeParse(-1).success).toBe(false);
});

it("is an admin from level 1, as sportbet's admin link and AdminMiddleware say", () => {
  expect(isAdmin(0)).toBe(false);
  expect(isAdmin(1)).toBe(true);
  expect(isAdmin(9)).toBe(true);
});
