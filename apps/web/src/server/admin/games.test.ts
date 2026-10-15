import { at } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { readGameForm } from './games';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const POSTED = {
  gameDateTime: '2026-12-01T20:00',
  homeTeamID: '12',
  awayTeamID: '15',
  eventID: '4',
};

describe('the game form (insertGame, updateGame; R-91)', () => {
  it('reads the typed time as Vilnius time and the ids as ids', () => {
    expect(readGameForm(form(POSTED))).toMatchObject({
      ok: true,
      value: { tipOff: at('2026-12-01T18:00:00Z'), roundId: 4 },
    });
  });

  it('refuses the spring hour and the autumn hour, and says which', () => {
    expect(
      readGameForm(form({ ...POSTED, gameDateTime: '2027-03-28T03:30' })),
    ).toEqual({
      ok: false,
      errors: [{ field: 'gameDateTime', problem: 'nonexistent-time' }],
    });
    expect(
      readGameForm(form({ ...POSTED, gameDateTime: '2026-10-25T03:30' })),
    ).toEqual({
      ok: false,
      errors: [{ field: 'gameDateTime', problem: 'ambiguous-time' }],
    });
  });

  it('lists every refused field, the ids first', () => {
    expect(readGameForm(form({}))).toEqual({
      ok: false,
      errors: [
        { field: 'homeTeamID', problem: 'required' },
        { field: 'awayTeamID', problem: 'required' },
        { field: 'eventID', problem: 'required' },
        { field: 'gameDateTime', problem: 'required' },
      ],
    });
  });
});
