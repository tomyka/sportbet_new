import { describe, expect, it } from 'vitest';
import { rate, roundNo } from '../testing';
import {
  ROUND_DAY_MAX,
  ROUND_RATE_MAX,
  roundFormEntry,
  type RoundField,
} from './round-form';

const valid: Readonly<
  Record<RoundField | 'eventSurvival' | 'isKnockout', string>
> = {
  event: '39 turas',
  eventDay: '39',
  stage: 'play-offs',
  rate: '2',
  eventSurvival: '',
  isKnockout: '',
};

describe('roundFormEntry (InsertEventRequest, validateNameAndDay)', () => {
  it('round form: a complete form is an entry, the switches absent', () => {
    expect(roundFormEntry(valid)).toEqual({
      ok: true,
      value: {
        name: '39 turas',
        number: roundNo(39),
        stage: 'play-offs',
        rate: rate(2),
        survival: false,
        knockout: false,
      },
    });
  });

  it('round form: a switch is on only for "on", as sportbet reads it', () => {
    const on = roundFormEntry({
      ...valid,
      eventSurvival: 'on',
      isKnockout: 'on',
    });
    expect(on.ok && [on.value.survival, on.value.knockout]).toEqual([
      true,
      true,
    ]);
    const other = roundFormEntry({
      ...valid,
      eventSurvival: '1',
      isKnockout: 'true',
    });
    expect(other.ok && [other.value.survival, other.value.knockout]).toEqual([
      false,
      false,
    ]);
  });

  it('round form: the name is kept as given (the caller trims)', () => {
    const entry = roundFormEntry({ ...valid, event: '1 turas' });
    expect(entry.ok && entry.value.name).toBe('1 turas');
  });

  it('round form: a blank name is required', () => {
    expect(roundFormEntry({ ...valid, event: '' })).toEqual({
      ok: false,
      errors: [{ field: 'event', problem: 'required' }],
    });
  });

  it.each([
    ['', 'required'],
    ['x', 'not-an-integer'],
    ['1.5', 'not-an-integer'],
    ['01', 'not-an-integer'],
    ['0', 'below-minimum'],
    ['-3', 'below-minimum'],
    [String(ROUND_DAY_MAX + 1), 'above-maximum'],
  ] as const)('round form: the day %j is %s', (eventDay, problem) => {
    expect(roundFormEntry({ ...valid, eventDay })).toEqual({
      ok: false,
      errors: [{ field: 'eventDay', problem }],
    });
  });

  it('round form: the day runs from 1 to the column maximum', () => {
    for (const day of ['1', String(ROUND_DAY_MAX)]) {
      expect(roundFormEntry({ ...valid, eventDay: day }).ok).toBe(true);
    }
  });

  it.each([
    ['', 'required'],
    ['final-fours', 'unknown-stage'],
    ['Regular', 'unknown-stage'],
  ] as const)('round form: the stage %j is %s', (stage, problem) => {
    expect(roundFormEntry({ ...valid, stage })).toEqual({
      ok: false,
      errors: [{ field: 'stage', problem }],
    });
  });

  it.each(['regular', 'play-in', 'play-offs', 'final-four', 'final'])(
    'round form: the stage %s is accepted',
    (stage) => {
      expect(roundFormEntry({ ...valid, stage }).ok).toBe(true);
    },
  );

  it.each([
    ['', 'required'],
    ['two', 'not-an-integer'],
    ['2.0', 'not-an-integer'],
    ['0', 'below-minimum'],
    ['-1', 'below-minimum'],
    [String(ROUND_RATE_MAX + 1), 'above-maximum'],
  ] as const)('round form: the rate %j is %s', (rateText, problem) => {
    expect(roundFormEntry({ ...valid, rate: rateText })).toEqual({
      ok: false,
      errors: [{ field: 'rate', problem }],
    });
  });

  it('round form: the rate runs from 1 to 127 (sportbet max:127, the smallint)', () => {
    expect(ROUND_RATE_MAX).toBe(127);
    for (const value of ['1', '127']) {
      expect(roundFormEntry({ ...valid, rate: value }).ok).toBe(true);
    }
  });

  it('round form: every failing field is listed, name first, then day, stage, rate', () => {
    expect(
      roundFormEntry({
        ...valid,
        event: '',
        eventDay: 'x',
        stage: '',
        rate: '0',
      }),
    ).toEqual({
      ok: false,
      errors: [
        { field: 'event', problem: 'required' },
        { field: 'eventDay', problem: 'not-an-integer' },
        { field: 'stage', problem: 'required' },
        { field: 'rate', problem: 'below-minimum' },
      ],
    });
  });
});
