import { Points } from '@sportbet/domain';
import { team, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { teamName, wholePoints } from './survival-text';

describe('wholePoints', () => {
  it("PHP's (int): the whole part, towards zero", () => {
    expect(wholePoints(unwrap(Points.whole(22)))).toBe(22);
    expect(wholePoints(unwrap(Points.ofHundredths(2250)))).toBe(22);
    expect(wholePoints(unwrap(Points.ofHundredths(-2250)))).toBe(-22);
  });
});

describe('teamName', () => {
  it("the team's stored name; a team with none is an impossible state", () => {
    const names = new Map([[team('1'), 'Olympiacos']]);
    expect(teamName(names, team('1'))).toBe('Olympiacos');
    expect(() => teamName(names, team('2'))).toThrow();
  });
});
