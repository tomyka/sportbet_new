import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressLine } from './progress-line';

describe("ProgressLine: main.blade.php's .sb-topline", () => {
  it('game page: the round, a bar as wide as the scored share, "scored / total" and "N šiandien"', () => {
    render(<ProgressLine name="3 turas" scored={4} total={9} today={2} />);
    expect(screen.getByText('3 turas')).toBeDefined();
    expect(screen.getByText('4 / 9')).toBeDefined();
    expect(screen.getByText('2 šiandien')).toBeDefined();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('4');
    expect(bar.getAttribute('aria-valuemax')).toBe('9');
    expect(screen.getByTestId('progress-fill').style.width).toBe('44%');
  });

  it('game page: no "šiandien" badge on a day with no games', () => {
    render(<ProgressLine name="3 turas" scored={4} total={9} today={0} />);
    expect(screen.queryByText(/šiandien/)).toBeNull();
  });

  it('game page: a round with no games draws an empty bar', () => {
    render(<ProgressLine name="3 turas" scored={0} total={0} today={0} />);
    expect(screen.getByTestId('progress-fill').style.width).toBe('0%');
  });
});
