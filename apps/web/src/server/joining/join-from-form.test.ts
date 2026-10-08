import { describe, expect, it } from 'vitest';
import { refusedStep } from './join-from-form';

// TournamentController::register's answers before anything is written.

describe('refusedStep', () => {
  it("unconfirmed: back to the form with sportbet's message", () => {
    expect(refusedStep('confirm-required', 'euroleague-2026-27')).toEqual({
      kind: 'answered',
      flash: { kind: 'confirm-required' },
      location: '/tournament/euroleague-2026-27/register',
      joined: false,
    });
  });

  it('closed: to the hub with "registration closed"', () => {
    expect(refusedStep('closed', 'euroleague-2026-27')).toEqual({
      kind: 'answered',
      flash: { kind: 'registration-closed' },
      location: '/',
      joined: false,
    });
  });

  it('a join or a member taken in: nothing refused', () => {
    expect(refusedStep('join', 'euroleague-2026-27')).toBeNull();
    expect(refusedStep('take-in', 'euroleague-2026-27')).toBeNull();
  });
});
