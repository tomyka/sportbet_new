import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PointsBreakdown } from './points-breakdown';

const SCORED = {
  total: '129.5',
  winner: '79.5',
  margin: '50.0',
  bingo: '0.0',
  serija: '20.0',
};

describe('PointsBreakdown (.upcoming-pts and its .sr-pop popover)', () => {
  it('shows the total, and the serija under it with its flame', () => {
    render(<PointsBreakdown points={SCORED} />);
    const shown = screen.getByTestId('line-points');
    expect(shown.textContent).toContain('129.5');
    expect(shown.textContent).toContain('+20.0');
    expect(shown.querySelector('[data-icon="fire"]')).not.toBeNull();
    expect(shown.className).toContain('text-accent');
  });

  it('opens the breakdown on hover: Nugalėtojas, Skirtumas, Tikslus and Serija', () => {
    render(<PointsBreakdown points={SCORED} />);
    fireEvent.mouseEnter(screen.getByTestId('line-points'));
    const pop = screen.getByRole('tooltip');
    expect(
      [...pop.querySelectorAll('div')].map((row) => row.textContent),
    ).toEqual([
      'Nugalėtojas79.5',
      'Skirtumas50.0',
      'Tikslus0.0',
      'Serija+20.0',
    ]);
    fireEvent.mouseLeave(screen.getByTestId('line-points'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('without a serija, no Serija line and no flame', () => {
    render(<PointsBreakdown points={{ ...SCORED, serija: null }} />);
    fireEvent.mouseEnter(screen.getByTestId('line-points'));
    expect(screen.getByRole('tooltip').textContent).not.toContain('Serija');
  });

  it('nothing earned: 0.0, drawn transparent, with no breakdown (upt-empty)', () => {
    render(<PointsBreakdown points={null} />);
    const shown = screen.getByTestId('line-points');
    expect(shown.textContent).toBe('0.0');
    expect(shown.className).toContain('text-transparent');
    fireEvent.mouseEnter(shown);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
