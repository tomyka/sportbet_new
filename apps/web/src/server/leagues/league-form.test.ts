import { describe, expect, it } from 'vitest';
import { readLeagueForm } from './league-form';

// LeagueController create (78) and update (126): the posted fields, trimmed
// as Laravel's TrimStrings does, then leagueFormEntry; a refusal is the 422
// body validationBody builds, every field's error in Laravel's English.

const formOf = (fields: Record<string, string>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

describe('readLeagueForm', () => {
  it('reads the fields of a valid post, trimmed, a blank one as nothing', () => {
    expect(
      readLeagueForm(
        formOf({
          name: '  Draugai  ',
          description: '',
          base_fee: ' 10 ',
          penalty_step: '',
          reward_description: ' Alus ',
        }),
        'create',
      ),
    ).toEqual({
      ok: true,
      entry: {
        name: 'Draugai',
        description: null,
        baseFee: 10,
        penaltyStep: null,
        reward: 'Alus',
      },
    });
  });

  it('ignores the reward on update', () => {
    const read = readLeagueForm(
      formOf({ name: 'A', reward_description: 'x' }),
      'update',
    );
    expect(read).toMatchObject({ ok: true, entry: { reward: null } });
  });

  it("says every refused field, in the form order, with Laravel's count of the rest", () => {
    const read = readLeagueForm(
      formOf({
        name: '',
        description: 'x'.repeat(501),
        base_fee: 'abc',
        penalty_step: '-1',
      }),
      'create',
    );
    expect(read).toEqual({
      ok: false,
      body: {
        message: 'The name field is required. (and 3 more errors)',
        errors: {
          name: ['The name field is required.'],
          description: [
            'The description field must not be greater than 500 characters.',
          ],
          base_fee: ['The base fee field must be an integer.'],
          penalty_step: ['The penalty step field must be at least 0.'],
        },
      },
    });
  });

  it.each([
    [
      'name',
      'x'.repeat(101),
      'The name field must not be greater than 100 characters.',
    ],
    [
      'base_fee',
      '2147483648',
      'The base fee field must not be greater than 2147483647.',
    ],
    [
      'reward_description',
      'y'.repeat(501),
      'The reward description field must not be greater than 500 characters.',
    ],
  ])('refuses %s past its limit', (field, value, message) => {
    const read = readLeagueForm(
      formOf({ name: 'A', [field]: value }),
      'create',
    );
    expect(read).toMatchObject({
      ok: false,
      body: { message, errors: { [field]: [message] } },
    });
  });

  it('counts a 100-character name of Š as 100', () => {
    expect(readLeagueForm(formOf({ name: 'Š'.repeat(100) }), 'create').ok).toBe(
      true,
    );
    expect(readLeagueForm(formOf({ name: 'Š'.repeat(101) }), 'create').ok).toBe(
      false,
    );
  });

  it('reads a missing field and an uploaded file as blank', () => {
    const form = formOf({ name: 'A' });
    form.set('description', new File(['x'], 'x.txt'));
    expect(readLeagueForm(form, 'create')).toMatchObject({
      ok: true,
      entry: { description: null },
    });
  });
});
