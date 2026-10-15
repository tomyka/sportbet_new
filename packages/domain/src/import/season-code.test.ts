import { describe, expect, it } from 'vitest';
import { seasonCodeSchema } from './season-code';

describe('seasonCodeSchema', () => {
  it.each(['E2026', 'U2026', 'EB2025'])('takes %s', (code) => {
    expect(seasonCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(['e2026', 'E26', 'EUR2026', 'E20266', '', ' E2026', 'E2026\n'])(
    'refuses %j',
    (code) => {
      expect(seasonCodeSchema.safeParse(code).success).toBe(false);
    },
  );
});
