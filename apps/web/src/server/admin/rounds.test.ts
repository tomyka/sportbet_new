import { roundNo } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { readRoundForm } from './rounds';

/** A round form as the page posts it. */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe('the round form (InsertEventRequest, UpdateEventRequest)', () => {
  it("reads sportbet's fields, trimmed, the switches on only when posted as on", () => {
    const read = readRoundForm(
      form({
        event: '  39 turas ',
        eventDay: ' 39',
        stage: 'regular',
        rate: '1',
        eventSurvival: 'on',
      }),
    );
    expect(read).toMatchObject({
      ok: true,
      value: {
        name: '39 turas',
        number: roundNo(39),
        stage: 'regular',
        survival: true,
        knockout: false,
      },
    });
  });

  it('lists every refused field, as Laravel does', () => {
    const read = readRoundForm(form({ event: '', eventDay: 'x', rate: '' }));
    expect(read).toEqual({
      ok: false,
      errors: [
        { field: 'event', problem: 'required' },
        { field: 'eventDay', problem: 'not-an-integer' },
        { field: 'stage', problem: 'required' },
        { field: 'rate', problem: 'required' },
      ],
    });
  });
});
