import { describe, expect, it } from 'vitest';
import { helpPage } from './help-page';

const FACTS = { teamCount: 20, deadlineRound: 5, survival: true } as const;

describe('helpPage', () => {
  it('the table length is the team count (R-106)', () => {
    expect(helpPage(FACTS).tableLength).toBe(20);
  });

  it('the deadline round is passed through (R-106, R-128, R-133)', () => {
    expect(helpPage(FACTS).deadlineRound).toBe(5);
  });

  it('follows the tournament survival switch', () => {
    expect(helpPage(FACTS).survival).toBe(true);
    expect(helpPage({ ...FACTS, survival: false }).survival).toBe(false);
  });

  it('with no tournament leaves the table length and the deadline round out and shows no survival (R-133)', () => {
    expect(helpPage(null)).toEqual({
      tableLength: null,
      deadlineRound: null,
      survival: false,
    });
  });
});
