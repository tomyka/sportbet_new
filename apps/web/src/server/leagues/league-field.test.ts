import { describe, expect, it } from 'vitest';
import { readLeagueField } from './league-field';

// `$request->validate(['leagueID' => 'required|integer'])`, then the id
// read as the domain reads every posted id (idFromText).

describe('readLeagueField', () => {
  it('reads a posted id', () => {
    expect(readLeagueField('12')).toEqual({ kind: 'league', id: 12 });
    expect(readLeagueField(' 12 ')).toEqual({ kind: 'league', id: 12 });
    expect(readLeagueField('+12')).toEqual({ kind: 'league', id: 12 });
  });

  it.each([null, '', '   '])(
    'says %j is required, as Laravel does',
    (typed) => {
      expect(readLeagueField(typed)).toEqual({
        kind: 'refused',
        message: 'The league i d field is required.',
      });
    },
  );

  it.each(['abc', '1.5', '1e3', '007', '12x', '--1', '9223372036854775808'])(
    'says %j must be an integer, as Laravel does',
    (typed) => {
      expect(readLeagueField(typed)).toEqual({
        kind: 'refused',
        message: 'The league i d field must be an integer.',
      });
    },
  );

  it.each(['0', '-1', '2147483648', '9223372036854775807'])(
    'passes the integer %j on as a league no one has',
    (typed) => {
      expect(readLeagueField(typed)).toEqual({ kind: 'no-such-league' });
    },
  );

  it('is not read from an uploaded file', () => {
    expect(readLeagueField(new File(['1'], 'x.txt'))).toEqual({
      kind: 'refused',
      message: 'The league i d field must be an integer.',
    });
  });
});
