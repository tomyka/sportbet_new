import { describe, expect, it } from 'vitest';
import { Points } from '../points/points';
import { at, makeGame, unwrap } from '../testing';
import { predictionVerdict, standingsVerdict } from './verdict';

const played = makeGame({
  id: 1,
  round: 1,
  home: 'ZAL',
  away: 'OLY',
  tipOff: '2026-06-15T18:00:00Z',
  result: [88, 79],
});
const unplayed = makeGame({
  id: 2,
  round: 1,
  home: 'REA',
  away: 'FEN',
  tipOff: '2026-06-15T20:00:00Z',
});
const paid = { winner: unwrap(Points.ofHundredths(7950)) };
const unpaid = { winner: Points.ZERO };
const homeCall = { home: 85, away: 80 };

describe('predictionVerdict (PredictionVerdict::forResult, Euroleague)', () => {
  it('verdict: no prediction draws no badge', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: false,
        prediction: null,
        points: paid,
      }),
    ).toBeNull();
  });

  it('verdict: a game with no result is pending', () => {
    expect(
      predictionVerdict({
        game: unplayed,
        knockout: false,
        prediction: homeCall,
        points: null,
      }),
    ).toBe('pending');
  });

  it('verdict: a postponed game is pending (R-63)', () => {
    const postponed = unwrap(unplayed.postpone(at('2026-06-15T10:00:00Z')));
    expect(postponed.postponed).toBe(true);
    expect(
      predictionVerdict({
        game: postponed,
        knockout: false,
        prediction: homeCall,
        points: null,
      }),
    ).toBe('pending');
  });

  it('verdict: winner points above 0 are ok', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: false,
        prediction: homeCall,
        points: paid,
      }),
    ).toBe('ok');
  });

  it('verdict: no winner points are fail', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: false,
        prediction: { home: 80, away: 85 },
        points: unpaid,
      }),
    ).toBe('fail');
  });

  it('verdict: a scored game whose row is not there yet is fail', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: false,
        prediction: homeCall,
        points: null,
      }),
    ).toBe('fail');
  });

  it('verdict: a correct winner in a knockout round with a predicted draw is fail (endingOk)', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: true,
        prediction: { home: 80, away: 80 },
        points: paid,
      }),
    ).toBe('fail');
  });

  it('verdict: the same call in a round that is not a knockout is ok', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: false,
        prediction: { home: 80, away: 80 },
        points: paid,
      }),
    ).toBe('ok');
  });

  it('verdict: a correct winner in a knockout round with a predicted win is ok', () => {
    expect(
      predictionVerdict({
        game: played,
        knockout: true,
        prediction: homeCall,
        points: paid,
      }),
    ).toBe('ok');
  });
});

describe('standingsVerdict.position', () => {
  it('verdict: no prediction or place 0 is none', () => {
    expect(standingsVerdict.position(null, 3)).toBe('none');
    expect(standingsVerdict.position(0, 3)).toBe('none');
  });
  it('verdict: no actual place is pending', () => {
    expect(standingsVerdict.position(3, null)).toBe('pending');
  });
  it('verdict: the exact place is a hit, any other a miss', () => {
    expect(standingsVerdict.position(3, 3)).toBe('hit');
    expect(standingsVerdict.position(3, 4)).toBe('miss');
  });
});

describe('standingsVerdict.advanced', () => {
  it('verdict: no tick is none, even when the team advanced', () => {
    expect(standingsVerdict.advanced(false, true)).toBe('none');
    expect(standingsVerdict.advanced(false, null)).toBe('none');
  });
  it('verdict: a tick with the stage undecided is pending', () => {
    expect(standingsVerdict.advanced(true, null)).toBe('pending');
  });
  it('verdict: a tick on a team that advanced is a hit, otherwise a miss', () => {
    expect(standingsVerdict.advanced(true, true)).toBe('hit');
    expect(standingsVerdict.advanced(true, false)).toBe('miss');
  });
});

describe('standingsVerdict.final', () => {
  const base: Parameters<typeof standingsVerdict.final>[0] = {
    predictedFinal: 1,
    predictedFinalFour: true,
    teamFinalFour: true,
    teamFinal: null,
  };
  it('verdict: no final place or place 0 is none', () => {
    expect(standingsVerdict.final({ ...base, predictedFinal: null })).toBe(
      'none',
    );
    expect(standingsVerdict.final({ ...base, predictedFinal: 0 })).toBe('none');
  });
  it('verdict: a team out before the Final Four is a miss whatever its final place', () => {
    expect(
      standingsVerdict.final({ ...base, teamFinalFour: false, teamFinal: 1 }),
    ).toBe('miss');
  });
  it('verdict: a team still to play is pending', () => {
    expect(standingsVerdict.final(base)).toBe('pending');
    expect(standingsVerdict.final({ ...base, teamFinalFour: null })).toBe(
      'pending',
    );
  });
  it('verdict: the exact final place is a hit', () => {
    expect(standingsVerdict.final({ ...base, teamFinal: 1 })).toBe('hit');
  });
  it('verdict: a wrong final place is partial with the Final Four ticked, else a miss', () => {
    expect(standingsVerdict.final({ ...base, teamFinal: 2 })).toBe('partial');
    expect(
      standingsVerdict.final({
        ...base,
        predictedFinalFour: false,
        teamFinal: 2,
      }),
    ).toBe('miss');
  });
});
