import { describe, expect, it } from 'vitest';
import { helpPage } from './help-page';

const FACTS = {
  teamCount: 20,
  deadlineRound: 5,
  standingsCloses: { state: 'open' },
  survival: true,
} as const;

describe('helpPage', () => {
  it('the table length is the team count, null kept with no tournament', () => {
    expect(helpPage(FACTS).tableLength).toBe(20);
    expect(helpPage({ ...FACTS, teamCount: null }).tableLength).toBeNull();
  });

  it('the deadline round and its state are passed through (R-106, R-128, R-133)', () => {
    expect(helpPage(FACTS)).toMatchObject({
      deadlineRound: 5,
      standingsCloses: { state: 'open' },
    });
    expect(
      helpPage({ ...FACTS, standingsCloses: { state: 'never' } }),
    ).toMatchObject({ deadlineRound: 5, standingsCloses: { state: 'never' } });
    expect(
      helpPage({ ...FACTS, deadlineRound: null, standingsCloses: null }),
    ).toMatchObject({ deadlineRound: null, standingsCloses: null });
  });

  it('a Euroleague final names two places', () => {
    expect(helpPage(FACTS).finalPlaces).toBe(2);
  });

  it('accepts a partial table, as the standings save does (R-106, R-133): sportbet help says it does not', () => {
    expect(helpPage(FACTS).partialTableAccepted).toBe(true);
  });

  it('follows the tournament survival switch', () => {
    expect(helpPage(FACTS).survival).toBe(true);
    expect(helpPage({ ...FACTS, survival: false }).survival).toBe(false);
  });
});
