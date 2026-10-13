import { describe, expect, it } from 'vitest';
import { refuse } from '../shared/result';
import { roundNo, team } from '../testing';
import { survivalPickFormEntry } from './survival-pick-form';

// updatePredictionSurvivalUser's validation (sportbet at 3eb95e7,
// PredictionSurvivalController.php:83-93): one refusal, the first of
// match(true), on the trimmed fields.

describe('survivalPickFormEntry', () => {
  it.each([null, ''])('survival form: no team is no-team (%j)', (teamID) => {
    expect(survivalPickFormEntry({ teamID, round: '3' })).toEqual(
      refuse('no-team'),
    );
  });

  it.each(['0', '-4', '+4', '4.5', 'x', '07', '2147483648'])(
    'survival form: a team that is not an id is bad-team (%s)',
    (teamID) => {
      expect(survivalPickFormEntry({ teamID, round: null })).toEqual(
        refuse('bad-team'),
      );
    },
  );

  it.each(['0', 'x', '-1', '2147483648'])(
    'survival form: a round given but not an id is bad-round (%s)',
    (round) => {
      expect(survivalPickFormEntry({ teamID: '4', round })).toEqual(
        refuse('bad-round'),
      );
    },
  );

  it('survival form: no-team comes before bad-round', () => {
    expect(survivalPickFormEntry({ teamID: '', round: 'x' })).toEqual(
      refuse('no-team'),
    );
  });

  it('survival form: bad-team comes before bad-round', () => {
    expect(survivalPickFormEntry({ teamID: 'x', round: 'x' })).toEqual(
      refuse('bad-team'),
    );
  });

  it('survival form: a team and the round the page showed', () => {
    expect(
      survivalPickFormEntry({ teamID: '2147483647', round: '12' }),
    ).toEqual({
      ok: true,
      value: { team: team('2147483647'), shownRound: roundNo(12) },
    });
  });

  it.each([null, ''])(
    'survival form: a page that does not say its round (%j)',
    (round) => {
      expect(survivalPickFormEntry({ teamID: '4', round })).toEqual({
        ok: true,
        value: { team: team('4'), shownRound: null },
      });
    },
  );
});
