import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_FIELDS,
  SURVIVAL_NOT_SAVED,
  survivalPickBody,
  survivalSavedSchema,
} from './survival-protocol';

// The survival save's wire format, written once: the posted fields and
// what an accepted save answers.

describe('the survival protocol', () => {
  it('a pick posts the team and the round the page shows', () => {
    expect(SURVIVAL_FIELDS).toEqual({ team: 'teamID', round: 'round' });
    expect(survivalPickBody({ team: '7', round: 3 }).toString()).toBe(
      'teamID=7&round=3',
    );
  });

  it('accepted: {success: true}, nothing else', () => {
    expect(survivalSavedSchema.safeParse({ success: true }).success).toBe(true);
    expect(survivalSavedSchema.safeParse({ success: false }).success).toBe(
      false,
    );
  });

  it("the fallback is sportbet's survival line, not the predictions'", () => {
    expect(SURVIVAL_NOT_SAVED).toBe(
      'Pasirinkimas neišsaugotas. Bandykite dar kartą.',
    );
  });
});
