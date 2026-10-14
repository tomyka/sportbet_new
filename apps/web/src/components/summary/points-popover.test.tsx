import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scored } from '../../../tests/support/summary-views';
import { PointsPopover } from './points-popover';

/** The popover's lines, after hovering the points. */
const hovered = (points: ReturnType<typeof scored>) => {
  render(<PointsPopover points={points} />);
  const shown = screen.getByTestId('sr-points').textContent;
  fireEvent.mouseEnter(screen.getByTestId('sr-points'));
  return {
    shown,
    lines: Array.from(
      screen.getByRole('tooltip').querySelectorAll('div > div'),
      (row) => row.textContent,
    ),
  };
};

describe("PointsPopover (the results summary's .sr-pts-link)", () => {
  it('shows full + serija to one decimal, and on hover the four parts', () => {
    const { shown, lines } = hovered(
      scored(155, {
        winnerTenths: 50,
        marginTenths: 30,
        bingoTenths: 50,
        serijaTenths: 25,
      }),
    );
    expect(shown).toBe('15.5');
    expect(lines).toEqual([
      'Nugalėtojas5.0',
      'Skirtumas3.0',
      'Tikslus5.0',
      'Serija+2.5',
    ]);
  });

  it('no "+" before a serija of 0', () => {
    const { lines } = hovered(scored(50, { winnerTenths: 50 }));
    expect(lines).toEqual([
      'Nugalėtojas5.0',
      'Skirtumas0.0',
      'Tikslus0.0',
      'Serija0.0',
    ]);
  });

  it('a scored game that paid nothing shows 0.0', () => {
    expect(hovered(scored(0)).shown).toBe('0.0');
  });
});
