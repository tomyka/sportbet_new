import { team } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { teamName } from './survival-text';

describe('teamName', () => {
  it("the team's stored name; a team with none is an impossible state", () => {
    const names = new Map([[team('1'), 'Olympiacos']]);
    expect(teamName(names, team('1'))).toBe('Olympiacos');
    expect(() => teamName(names, team('2'))).toThrow();
  });
});
