import { describe, expect, it } from 'vitest';
import { readPostedId } from './posted-id';

function formOf(entries: readonly (readonly [string, string])[]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

const refused = (problem: string) => ({
  ok: false,
  answer: {
    kind: 'redirect',
    to: '/admin/leagues',
    flash: {
      kind: 'admin-invalid',
      problems: [{ field: 'leagueID', problem }],
    },
  },
});

describe('a posted id (issue 281)', () => {
  it('posted-id: a whole number is the id, trimmed', () => {
    expect(
      readPostedId(
        formOf([['leagueID', ' 12 ']]),
        'leagueID',
        '/admin/leagues',
      ),
    ).toEqual({ ok: true, id: 12 });
  });

  it('posted-id: a blank or missing field is required, back to the page with the summary', () => {
    expect(
      readPostedId(formOf([['leagueID', ' ']]), 'leagueID', '/admin/leagues'),
    ).toEqual(refused('required'));
    expect(readPostedId(formOf([]), 'leagueID', '/admin/leagues')).toEqual(
      refused('required'),
    );
  });

  it.each(['1.5', 'abc', '0', '-3', '1e3', '99999999999999999999'])(
    'posted-id: "%s" is not an id',
    (text) => {
      expect(
        readPostedId(
          formOf([['leagueID', text]]),
          'leagueID',
          '/admin/leagues',
        ),
      ).toEqual(refused('not-an-integer'));
    },
  );

  it('posted-id: leagueID[]=1 is a list, refused, and never reads as league 1', () => {
    expect(
      readPostedId(formOf([['leagueID[]', '1']]), 'leagueID', '/admin/leagues'),
    ).toEqual(refused('not-an-integer'));
  });
});
