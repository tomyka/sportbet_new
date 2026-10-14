import { describe, expect, it } from 'vitest';
import { asLeague, asPlayer, readIdField, type IdAttribute } from './id-field';

// `$request->validate([attribute => 'required|integer'])`, then the id read
// as the domain reads every posted id (idFromText).

const ATTRIBUTES: readonly (readonly [IdAttribute, string])[] = [
  ['leagueID', 'league i d'],
  ['inviteID', 'invite i d'],
  ['invitedUserID', 'invited user i d'],
  ['memberID', 'member i d'],
];

describe('readIdField', () => {
  it('reads a posted id', () => {
    expect(readIdField('12', 'leagueID')).toEqual({ kind: 'id', id: 12 });
    expect(readIdField(' 12 ', 'leagueID')).toEqual({ kind: 'id', id: 12 });
    expect(readIdField('+12', 'leagueID')).toEqual({ kind: 'id', id: 12 });
  });

  it.each(ATTRIBUTES)(
    'names %s as Laravel does: "%s", in both its messages',
    (attribute, name) => {
      expect(readIdField(null, attribute)).toEqual({
        kind: 'refused',
        field: attribute,
        message: `The ${name} field is required.`,
      });
      expect(readIdField('abc', attribute)).toEqual({
        kind: 'refused',
        field: attribute,
        message: `The ${name} field must be an integer.`,
      });
    },
  );

  it.each([null, '', '   '])('says %j is required', (typed) => {
    expect(readIdField(typed, 'inviteID')).toEqual({
      kind: 'refused',
      field: 'inviteID',
      message: 'The invite i d field is required.',
    });
  });

  it.each(['abc', '1.5', '1e3', '007', '12x', '--1', '9223372036854775808'])(
    'says %j must be an integer',
    (typed) => {
      expect(readIdField(typed, 'leagueID')).toEqual({
        kind: 'refused',
        field: 'leagueID',
        message: 'The league i d field must be an integer.',
      });
    },
  );

  it.each(['0', '-1', '2147483648', '9223372036854775807'])(
    'passes the integer %j on as a row no one has',
    (typed) => {
      expect(readIdField(typed, 'invitedUserID')).toEqual({
        kind: 'no-such-row',
      });
    },
  );

  it('is not read from an uploaded file', () => {
    expect(readIdField(new File(['1'], 'x.txt'), 'leagueID')).toEqual({
      kind: 'refused',
      field: 'leagueID',
      message: 'The league i d field must be an integer.',
    });
  });
});

describe('the id as a domain id', () => {
  it('is a league and a player by number', () => {
    expect(asLeague(7)).toBe(7);
    expect(asPlayer(9)).toBe('9');
  });

  it('throws for a number no row can have: the reader never lets one through', () => {
    expect(() => asLeague(0)).toThrow();
  });
});
