import { describe, expect, it } from 'vitest';
import { leagueFormEntry, type LeagueFieldError } from './form';

const posted = (over: Record<string, string | null> = {}) => ({
  name: 'Draugų lyga',
  description: null,
  base_fee: null,
  penalty_step: null,
  reward_description: null,
  ...over,
});

const errorsOf = (
  over: Record<string, string | null>,
  mode: 'create' | 'update' = 'create',
): readonly LeagueFieldError[] => {
  const checked = leagueFormEntry(posted(over), mode);
  if (checked.ok) throw new Error('expected a refusal');
  return checked.errors;
};

describe('leagueFormEntry', () => {
  it('accepts a name alone and leaves every other field null', () => {
    expect(leagueFormEntry(posted(), 'create')).toEqual({
      ok: true,
      value: {
        name: 'Draugų lyga',
        description: null,
        baseFee: null,
        penaltyStep: null,
        reward: null,
      },
    });
  });

  it('accepts every field', () => {
    expect(
      leagueFormEntry(
        posted({
          description: 'Kas pirmas',
          base_fee: '10',
          penalty_step: '2',
          reward_description: 'Pyragas',
        }),
        'create',
      ),
    ).toEqual({
      ok: true,
      value: {
        name: 'Draugų lyga',
        description: 'Kas pirmas',
        baseFee: 10,
        penaltyStep: 2,
        reward: 'Pyragas',
      },
    });
  });

  it('refuses a missing name as required', () => {
    expect(errorsOf({ name: null })).toEqual([
      { field: 'name', problem: 'required' },
    ]);
  });

  it('reads a blank name as missing', () => {
    expect(errorsOf({ name: '' })).toEqual([
      { field: 'name', problem: 'required' },
    ]);
  });

  it('accepts a 100-character name of Š and refuses 101', () => {
    expect(
      leagueFormEntry(posted({ name: 'Š'.repeat(100) }), 'create').ok,
    ).toBe(true);
    expect(errorsOf({ name: 'Š'.repeat(101) })).toEqual([
      { field: 'name', problem: 'too-long', limit: 100 },
    ]);
  });

  it('counts a character outside the BMP once', () => {
    expect(
      leagueFormEntry(posted({ name: '\u{1F600}'.repeat(100) }), 'create').ok,
    ).toBe(true);
  });

  it('accepts a 500-character description and refuses 501 (R-121)', () => {
    expect(
      leagueFormEntry(posted({ description: 'ž'.repeat(500) }), 'create').ok,
    ).toBe(true);
    expect(errorsOf({ description: 'ž'.repeat(501) })).toEqual([
      { field: 'description', problem: 'too-long', limit: 500 },
    ]);
  });

  it('refuses a reward of 501 characters on create', () => {
    expect(errorsOf({ reward_description: 'x'.repeat(501) })).toEqual([
      { field: 'reward_description', problem: 'too-long', limit: 500 },
    ]);
  });

  it('reads a blank fee as null', () => {
    const checked = leagueFormEntry(
      posted({ base_fee: '', penalty_step: null }),
      'create',
    );
    expect(checked).toMatchObject({
      ok: true,
      value: { baseFee: null, penaltyStep: null },
    });
  });

  it('refuses a fee that is not an integer, as PHP reads one', () => {
    for (const text of ['1.5', '1,5', 'abc', '01', '1e3', ' 1', '--1']) {
      expect(errorsOf({ base_fee: text })).toEqual([
        { field: 'base_fee', problem: 'not-an-integer' },
      ]);
    }
  });

  it('accepts a signed zero and a plus sign as PHP does', () => {
    expect(
      leagueFormEntry(posted({ base_fee: '+5', penalty_step: '-0' }), 'create'),
    ).toMatchObject({ ok: true, value: { baseFee: 5, penaltyStep: 0 } });
  });

  it('refuses -1 with at least 0', () => {
    expect(errorsOf({ penalty_step: '-1' })).toEqual([
      { field: 'penalty_step', problem: 'below-minimum', limit: 0 },
    ]);
  });

  it('accepts a fee of 2147483647 and refuses one above it (R-121)', () => {
    expect(
      leagueFormEntry(posted({ base_fee: '2147483647' }), 'create'),
    ).toMatchObject({ ok: true, value: { baseFee: 2_147_483_647 } });
    expect(errorsOf({ base_fee: '2147483648' })).toEqual([
      { field: 'base_fee', problem: 'above-maximum', limit: 2_147_483_647 },
    ]);
  });

  it('refuses a fee past a safe integer but within PHP integers as above the maximum', () => {
    expect(errorsOf({ base_fee: '9007199254740993' })).toEqual([
      { field: 'base_fee', problem: 'above-maximum', limit: 2_147_483_647 },
    ]);
  });

  it('refuses a fee past a 64-bit integer as not an integer', () => {
    expect(errorsOf({ base_fee: '9223372036854775808' })).toEqual([
      { field: 'base_fee', problem: 'not-an-integer' },
    ]);
  });

  it('lists every field that fails, in the form order, not the first', () => {
    expect(
      errorsOf({
        name: null,
        description: 'x'.repeat(501),
        base_fee: 'a',
        penalty_step: '-3',
        reward_description: 'x'.repeat(501),
      }),
    ).toEqual([
      { field: 'name', problem: 'required' },
      { field: 'description', problem: 'too-long', limit: 500 },
      { field: 'base_fee', problem: 'not-an-integer' },
      { field: 'penalty_step', problem: 'below-minimum', limit: 0 },
      { field: 'reward_description', problem: 'too-long', limit: 500 },
    ]);
  });

  it('ignores reward_description on update, whatever it holds', () => {
    expect(
      leagueFormEntry(
        posted({ reward_description: 'x'.repeat(501) }),
        'update',
      ),
    ).toMatchObject({ ok: true, value: { reward: null } });
  });

  it('treats a field the post leaves out as null', () => {
    expect(leagueFormEntry({ name: 'Klubas' }, 'create')).toMatchObject({
      ok: true,
      value: { name: 'Klubas', description: null, baseFee: null },
    });
  });
});
