import { describe, expect, it } from 'vitest';
import { SURVIVAL_REPEAT_RULE } from './survival-rule-text';

describe('SURVIVAL_REPEAT_RULE (R-133, R-11)', () => {
  it('names both ways the used list ends: the run breaking, and every team being used', () => {
    expect(SURVIVAL_REPEAT_RULE).toBe(
      'Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta arba kol panaudotos visos komandos.',
    );
  });
});
