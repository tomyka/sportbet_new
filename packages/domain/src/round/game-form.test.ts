import { describe, expect, it } from 'vitest';
import { at, team } from '../testing';
import { gameFormEntry, type GameFormFields } from './game-form';

const valid: GameFormFields = {
  gameDateTime: '2026-12-01T20:00',
  homeTeamID: '11',
  awayTeamID: '12',
  eventID: '5',
};

describe('gameFormEntry (insertGame, updateGame; R-91)', () => {
  it('game form: ids as posted, the time read as Vilnius time', () => {
    expect(gameFormEntry(valid)).toEqual({
      ok: true,
      value: {
        tipOff: at('2026-12-01T18:00:00Z'),
        home: team('11'),
        away: team('12'),
        roundId: 5,
      },
    });
  });

  it.each([
    ['homeTeamID', ''],
    ['awayTeamID', ''],
    ['eventID', ''],
  ] as const)('game form: %s is required when blank', (field, blank) => {
    expect(gameFormEntry({ ...valid, [field]: blank })).toEqual({
      ok: false,
      errors: [{ field, problem: 'required' }],
    });
  });

  it.each(['x', '1.5', '-1', '0', '012', '99999999999'])(
    'game form: %j is no id',
    (text) => {
      expect(gameFormEntry({ ...valid, homeTeamID: text })).toEqual({
        ok: false,
        errors: [{ field: 'homeTeamID', problem: 'not-an-id' }],
      });
    },
  );

  it('game form: a blank time is required', () => {
    expect(gameFormEntry({ ...valid, gameDateTime: '' })).toEqual({
      ok: false,
      errors: [{ field: 'gameDateTime', problem: 'required' }],
    });
  });

  it.each([
    ['2026-12-01 20:00', 'bad-time'],
    ['2027-03-28T03:30', 'nonexistent-time'],
    ['2026-10-25T03:30', 'ambiguous-time'],
  ] as const)(
    'game form: the time %j is %s (R-91)',
    (gameDateTime, problem) => {
      expect(gameFormEntry({ ...valid, gameDateTime })).toEqual({
        ok: false,
        errors: [{ field: 'gameDateTime', problem }],
      });
    },
  );

  it('game form: every failing field is listed, the ids in sportbet`s order, then the time', () => {
    expect(
      gameFormEntry({
        gameDateTime: '2027-03-28T03:30',
        homeTeamID: '',
        awayTeamID: 'x',
        eventID: '',
      }),
    ).toEqual({
      ok: false,
      errors: [
        { field: 'homeTeamID', problem: 'required' },
        { field: 'awayTeamID', problem: 'not-an-id' },
        { field: 'eventID', problem: 'required' },
        { field: 'gameDateTime', problem: 'nonexistent-time' },
      ],
    });
  });
});
