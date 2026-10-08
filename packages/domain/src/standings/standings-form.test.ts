import { describe, expect, it } from 'vitest';
import { team } from '../testing';
import {
  finalPlaceFromText,
  reorderFormEntry,
  standingsFormEntry,
} from './standings-form';

const row = (
  fields: Partial<
    Record<'team' | 'place' | 'playOffs' | 'finalFour' | 'finalPlace', string>
  >,
) =>
  standingsFormEntry({
    team: '11',
    place: '',
    playOffs: '',
    finalFour: '',
    finalPlace: '',
    ...fields,
  });

describe('standingsFormEntry (UpdatePredictionStandingRequest::rules)', () => {
  it('standings form: a blank row is the team, everything else null', () => {
    expect(row({})).toEqual({
      ok: true,
      value: {
        team: team('11'),
        place: null,
        playOffs: null,
        finalFour: null,
        finalPlace: null,
      },
    });
  });

  it('standings form: a full row is the place, both ticks as posted, the final place', () => {
    expect(
      row({ place: '3', playOffs: '1', finalFour: '0', finalPlace: '2' }),
    ).toEqual({
      ok: true,
      value: {
        team: team('11'),
        place: 3,
        playOffs: true,
        finalFour: false,
        finalPlace: 2,
      },
    });
  });

  it('standings form: teamID is required and an id', () => {
    for (const team of ['', '0', '-1', 'x', '2147483648']) {
      expect(row({ team })).toEqual({
        ok: false,
        errors: [{ field: 'team', problem: 'not-an-id' }],
      });
    }
  });

  it("standings form: a place is a stored place's shape, a whole number from 0 (sportbet's place 0 posted back); the table's range is predictStandingsRow's", () => {
    expect(row({ place: '0' })).toMatchObject({
      ok: true,
      value: { place: 0 },
    });
    expect(row({ place: '-1' })).toEqual({
      ok: false,
      errors: [{ field: 'place', problem: 'bad-place' }],
    });
    expect(row({ place: '1.5' })).toEqual({
      ok: false,
      errors: [{ field: 'place', problem: 'bad-place' }],
    });
    expect(row({ place: '99' }).ok).toBe(true);
  });

  it("standings form: Laravel's integer takes a sign and refuses a leading zero or an exponent", () => {
    expect(row({ place: '+2', playOffs: '+1', finalPlace: '+1' })).toEqual({
      ok: true,
      value: {
        team: team('11'),
        place: 2,
        playOffs: true,
        finalFour: null,
        finalPlace: 1,
      },
    });
    for (const place of ['02', '1e1']) {
      expect(row({ place })).toEqual({
        ok: false,
        errors: [{ field: 'place', problem: 'bad-place' }],
      });
    }
  });

  it('standings form: a tick is 0 or 1', () => {
    expect(row({ playOffs: '2' })).toEqual({
      ok: false,
      errors: [{ field: 'playOffs', problem: 'bad-tick' }],
    });
    expect(row({ finalFour: 'on' })).toEqual({
      ok: false,
      errors: [{ field: 'finalFour', problem: 'bad-tick' }],
    });
  });

  it('standings form: a final place is 1 or 2', () => {
    for (const finalPlace of ['0', '3', '01']) {
      expect(row({ finalPlace })).toEqual({
        ok: false,
        errors: [{ field: 'finalPlace', problem: 'bad-final-place' }],
      });
    }
  });

  it("standings form: every failing field, in the rules' order (id, place, final, then the stages)", () => {
    expect(
      row({
        team: 'x',
        finalFour: 'y',
        playOffs: '01',
        finalPlace: '0',
        place: '-1',
      }),
    ).toEqual({
      ok: false,
      errors: [
        { field: 'team', problem: 'not-an-id' },
        { field: 'place', problem: 'bad-place' },
        { field: 'finalPlace', problem: 'bad-final-place' },
        { field: 'playOffs', problem: 'bad-tick' },
        { field: 'finalFour', problem: 'bad-tick' },
      ],
    });
  });
});

describe('reorderFormEntry (ReorderPredictionStandingsRequest)', () => {
  it('standings reorder form: the ids in posted order', () => {
    expect(reorderFormEntry(['12', '11'])).toEqual({
      ok: true,
      value: [team('12'), team('11')],
    });
  });

  it('standings reorder form: none, one not an id, or one twice is refused', () => {
    expect(reorderFormEntry([])).toEqual({ ok: false, refusal: 'empty' });
    expect(reorderFormEntry(['11', 'x'])).toEqual({
      ok: false,
      refusal: 'not-an-id',
    });
    expect(reorderFormEntry(['11', '11'])).toEqual({
      ok: false,
      refusal: 'repeated',
    });
  });
});

describe('finalPlaceFromText (a typed final place, as the form reads it)', () => {
  it('standings form: blank is no final place; 1 and 2 are the two', () => {
    expect(finalPlaceFromText('')).toEqual({ ok: true, value: null });
    expect(finalPlaceFromText('1')).toEqual({ ok: true, value: 1 });
    expect(finalPlaceFromText('2')).toEqual({ ok: true, value: 2 });
    expect(finalPlaceFromText('+2')).toEqual({ ok: true, value: 2 });
  });

  it("standings form: anything else is refused, as Laravel's integer and max:2 refuse it", () => {
    for (const text of ['0', '3', '01', '1.0', 'x', ' 1', '-1']) {
      expect(finalPlaceFromText(text)).toEqual({
        ok: false,
        refusal: 'bad-final-place',
      });
    }
  });
});
