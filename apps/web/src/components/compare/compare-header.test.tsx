import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  comparison,
  JONAS,
  side,
  ZUKAUSKAS,
} from '../../../tests/support/summary-views';
import { CompareHeader } from './compare-header';

const header = (
  me: Parameters<typeof side>[2],
  them: Parameters<typeof side>[2],
  record: { wins: number; draws: number; losses: number } | null = null,
) =>
  render(
    <CompareHeader
      comparison={comparison(
        side(JONAS, 'jonas', { rank: 2, ...me }),
        side(ZUKAUSKAS, 'zuk', { rank: 5, ...them }),
        { record },
      )}
    />,
  );

const total = (name: string) =>
  within(screen.getByTestId(`compare-${name}`)).getByTestId('compare-total');

describe('CompareHeader (compare/_card.blade.php)', () => {
  it('each side: its rank with "#", its username and its total to one decimal', () => {
    header({ totalCents: 12_345 }, { totalCents: 9050 });
    const me = screen.getByTestId('compare-me');
    expect(me.textContent).toBe('#2jonas123.5');
    expect(screen.getByTestId('compare-them').textContent).toBe('#5zuk90.5');
  });

  it('the larger total is marked the winner, the smaller the loser', () => {
    header({ totalCents: 2000 }, { totalCents: 1000 });
    expect(total('me').className).toContain('text-accent');
    expect(total('them').className).toContain('text-muted');
  });

  it('the marks swap with the totals', () => {
    header({ totalCents: 1000 }, { totalCents: 2000 });
    expect(total('me').className).toContain('text-muted');
    expect(total('them').className).toContain('text-accent');
  });

  it('equal totals mark neither', () => {
    header({ totalCents: 1000 }, { totalCents: 1000 });
    for (const name of ['me', 'them']) {
      expect(total(name).className).toContain('text-text');
      expect(total(name).className).not.toContain('text-accent');
      expect(total(name).className).not.toContain('text-muted');
    }
  });

  it('"vs" and the round record "{w}W", "{d}D", "{l}L" in the ok, muted and bad tokens', () => {
    header({}, {}, { wins: 3, draws: 1, losses: 0 });
    expect(screen.getByText('vs')).toBeDefined();
    const record = screen.getByTestId('compare-record');
    expect(
      Array.from(record.children, (part) => [
        part.textContent,
        /text-(?:ok|muted|bad)/u.exec(part.className)?.[0],
      ]),
    ).toEqual([
      ['3W', 'text-ok'],
      ['1D', 'text-muted'],
      ['0L', 'text-bad'],
    ]);
  });

  it('with no round there is "vs" and no record', () => {
    header({}, {}, null);
    expect(screen.getByText('vs')).toBeDefined();
    expect(screen.queryByTestId('compare-record')).toBeNull();
  });
});
