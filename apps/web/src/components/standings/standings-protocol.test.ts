import { describe, expect, it } from 'vitest';
import {
  reorderBody,
  STANDINGS_FIELDS,
  standingsFieldErrorsSchema,
  standingsRowBody,
  standingsSavedSchema,
} from './standings-protocol';

// The standings saves' wire format, written once: the posted fields as
// sportbet's ladder names them, and each answer the routes can give.

describe('the standings protocol', () => {
  it("a row posts sportbet's field names, in its order; a blank field is sent empty", () => {
    expect(Object.values(STANDINGS_FIELDS)).toEqual([
      'teamID',
      'groupPosition',
      'quarterfinal',
      'semifinal',
      'final',
    ]);
    expect(
      standingsRowBody({
        team: '7',
        place: null,
        playOffs: null,
        finalFour: null,
        finalPlace: null,
      }).toString(),
    ).toBe('teamID=7&groupPosition=&quarterfinal=&semifinal=&final=');
    expect(
      standingsRowBody({
        team: '7',
        place: 3,
        playOffs: false,
        finalFour: true,
        finalPlace: 2,
      }).toString(),
    ).toBe('teamID=7&groupPosition=3&quarterfinal=0&semifinal=1&final=2');
  });

  it('an order repeats order[] per team, top first', () => {
    expect(reorderBody(['3', '1', '2']).getAll('order[]')).toEqual([
      '3',
      '1',
      '2',
    ]);
  });

  it("each answer's own shape: saved, field errors under its names only", () => {
    expect(standingsSavedSchema.safeParse({ success: true }).success).toBe(
      true,
    );
    expect(standingsSavedSchema.safeParse({ success: false }).success).toBe(
      false,
    );
    expect(
      standingsFieldErrorsSchema.safeParse({
        message: 'Eilė neteisinga.',
        errors: { order: ['Eilė neteisinga.'] },
      }).success,
    ).toBe(true);
    expect(
      standingsFieldErrorsSchema.safeParse({
        message: 'x',
        errors: { gameID: ['x'] },
      }).success,
    ).toBe(false);
  });
});
