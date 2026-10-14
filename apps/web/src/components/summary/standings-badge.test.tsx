import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StandingsVerdict } from '@sportbet/domain';
import { badge } from '../../../tests/support/summary-views';
import { StandingsBadgeView } from './standings-badge';

const hover = () => fireEvent.mouseEnter(screen.getByTestId('sst-badge'));

const popLines = () =>
  Array.from(
    screen.getByRole('tooltip').querySelectorAll('div > div'),
    (row) => row.textContent,
  );

describe('StandingsBadgeView (.sst-badge)', () => {
  it.each([
    ['hit', 'bg-ok-tint', 'text-ok'],
    ['miss', 'bg-bad-tint', 'text-bad'],
    ['partial', 'bg-warn-tint', 'text-warn'],
    ['pending', 'bg-warn-tint', 'text-warn'],
    ['none', 'bg-surface-2', 'text-dim'],
  ] as const satisfies readonly (readonly [
    StandingsVerdict,
    string,
    string,
  ])[])(
    "the %s verdict wears sportbet's %s and %s tokens, showing the symbol it is given",
    (verdict, ground, ink) => {
      render(<StandingsBadgeView stage="place" badge={badge('4', verdict)} />);
      const drawn = screen.getByTestId('sst-badge');
      expect(drawn.textContent).toBe('4');
      expect(drawn.getAttribute('data-verdict')).toBe(verdict);
      expect(drawn.className).toContain(ground);
      expect(drawn.className).toContain(ink);
    },
  );

  it.each([
    ['place', '3', 'Grupės vieta: spėta 3'],
    ['place', '-', 'Grupės vieta: spėta -'],
    ['playOffs', '-', '1/4'],
    ['finalFour', '-', '1/2'],
    ['final', '2', 'Finalas: spėta 2'],
  ] as const)(
    'with no popover the %s badge shows only a title built from "%s": "%s"',
    (stage, shown, title) => {
      render(<StandingsBadgeView stage={stage} badge={badge(shown, 'none')} />);
      expect(screen.getByTestId('sst-badge').getAttribute('title')).toBe(title);
      hover();
      expect(screen.queryByRole('tooltip')).toBeNull();
    },
  );

  it.each([
    ['place', 'Grupės vieta'],
    ['playOffs', 'Ketvirtfinalis'],
    ['finalFour', 'Pusfinalis'],
    ['final', 'Finalas'],
  ] as const)(
    'a popover opens on hover for the %s badge, headed "%s", with its points and no title',
    (stage, label) => {
      render(
        <StandingsBadgeView
          stage={stage}
          badge={badge('✓', 'hit', {
            pointsTenths: 190,
            base: null,
            multiplier: null,
          })}
        />,
      );
      expect(screen.getByTestId('sst-badge').hasAttribute('title')).toBe(false);
      hover();
      expect(popLines()).toEqual([`${label}19.0`]);
    },
  );

  it('a bonus adds "Spėjimo taškai" and "Koeficientas" with the multiplication sign', () => {
    render(
      <StandingsBadgeView
        stage="place"
        badge={badge('1', 'hit', {
          pointsTenths: 380,
          base: '19.0',
          multiplier: '2.00',
        })}
      />,
    );
    hover();
    expect(popLines()).toEqual([
      'Grupės vieta38.0',
      'Spėjimo taškai19.0',
      'Koeficientas×2.00',
    ]);
  });
});
