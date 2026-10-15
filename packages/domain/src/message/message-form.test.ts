import { describe, expect, it } from 'vitest';
import { leagueNo } from '../testing';
import {
  messageFormEntry,
  messageIdEntry,
  messageLeagueAllowed,
  type MessageFieldError,
} from './message-form';

const L41 = leagueNo(41);
const L42 = leagueNo(42);
const allowed = [L41, L42];

const posted = (over: Record<string, string> = {}) => ({
  message: 'Lyga prasideda rytoj',
  leagueID: '41',
  active: 'on',
  ...over,
});

const errorsOf = (
  over: Record<string, string>,
): readonly MessageFieldError[] => {
  const checked = messageFormEntry(posted(over), allowed);
  if (checked.ok) throw new Error('expected a refusal');
  return checked.errors;
};

describe('messageFormEntry', () => {
  it('accepts a text, an allowed league and the active switch', () => {
    expect(messageFormEntry(posted(), allowed)).toEqual({
      ok: true,
      value: { text: 'Lyga prasideda rytoj', league: L41, active: true },
    });
  });

  it('reads a blank league as null: a message no dashboard shows', () => {
    expect(messageFormEntry(posted({ leagueID: '' }), allowed)).toEqual({
      ok: true,
      value: { text: 'Lyga prasideda rytoj', league: null, active: true },
    });
  });

  it('reads the switch as on only when it is exactly on, absent as off', () => {
    const entry = (active: string) => {
      const checked = messageFormEntry(posted({ active }), allowed);
      return checked.ok ? checked.value.active : 'refused';
    };
    expect(entry('on')).toBe(true);
    expect(entry('')).toBe(false);
    expect(entry('1')).toBe(false);
    expect(entry('ON')).toBe(false);
    expect(entry('true')).toBe(false);
  });

  it('accepts the longest text and refuses one character more (10 000)', () => {
    expect(
      messageFormEntry(posted({ message: 'Š'.repeat(10_000) }), allowed).ok,
    ).toBe(true);
    expect(errorsOf({ message: 'Š'.repeat(10_001) })).toEqual([
      { field: 'message', problem: 'too-long', limit: 10_000 },
    ]);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(
      messageFormEntry(posted({ message: '😀'.repeat(10_000) }), allowed).ok,
    ).toBe(true);
    expect(errorsOf({ message: '😀'.repeat(10_001) })).toEqual([
      { field: 'message', problem: 'too-long', limit: 10_000 },
    ]);
  });

  it('refuses an empty text as required', () => {
    expect(errorsOf({ message: '' })).toEqual([
      { field: 'message', problem: 'required' },
    ]);
  });

  it.each(['abc', '1.5', '01', '4 1', '1e1', '99999999999999999999'])(
    'refuses the league %j as not an integer',
    (leagueID) => {
      expect(errorsOf({ leagueID })).toEqual([
        { field: 'leagueID', problem: 'not-an-integer' },
      ]);
    },
  );

  it.each(['43', '0', '-1'])(
    'refuses the whole number %j that is no league of the tournament (R-95)',
    (leagueID) => {
      expect(errorsOf({ leagueID })).toEqual([
        { field: 'leagueID', problem: 'league-not-allowed' },
      ]);
    },
  );

  it('reads +41 as Laravel does, the integer 41', () => {
    const checked = messageFormEntry(posted({ leagueID: '+41' }), allowed);
    expect(checked.ok && checked.value.league).toBe(L41);
  });

  it('refuses every league when the tournament has none', () => {
    expect(messageFormEntry(posted(), []).ok).toBe(false);
    expect(messageFormEntry(posted({ leagueID: '' }), []).ok).toBe(true);
  });

  it('lists every failing field, in sportbet order: the text, then the league', () => {
    expect(errorsOf({ message: '', leagueID: 'x' })).toEqual([
      { field: 'message', problem: 'required' },
      { field: 'leagueID', problem: 'not-an-integer' },
    ]);
  });
});

describe('messageLeagueAllowed (R-95)', () => {
  it('holds for a blank league and a league of the tournament only', () => {
    expect(messageLeagueAllowed(null, allowed)).toBe(true);
    expect(messageLeagueAllowed(L42, allowed)).toBe(true);
    expect(messageLeagueAllowed(leagueNo(7), allowed)).toBe(false);
  });
});

describe('messageIdEntry', () => {
  it('reads a posted messageID only as an id (issue 281: userID[]=x acted on 1)', () => {
    expect(messageIdEntry('12')).toEqual({ ok: true, value: 12 });
    expect(messageIdEntry('')).toEqual({ ok: false, refusal: 'required' });
    expect(messageIdEntry('x')).toEqual({
      ok: false,
      refusal: 'not-an-integer',
    });
    expect(messageIdEntry('012')).toEqual({
      ok: false,
      refusal: 'not-an-integer',
    });
    expect(messageIdEntry('99999999999')).toEqual({
      ok: false,
      refusal: 'not-an-integer',
    });
  });
});
