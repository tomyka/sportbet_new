import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './icon';

const NAMES: readonly IconName[] = [
  'arrow-left',
  'arrow-left-right',
  'arrow-repeat',
  'arrow-right-short',
  'bar-chart-fill',
  'bar-chart-steps',
  'box-arrow-in-right',
  'box-arrow-right',
  'bullseye',
  'calendar3',
  'caret-down-fill',
  'caret-right-fill',
  'caret-up-fill',
  'check-circle-fill',
  'check2',
  'check2-all',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'clock',
  'cookie',
  'database-gear',
  'envelope',
  'exclamation-circle',
  'fire',
  'gear-fill',
  'globe2',
  'graph-up-arrow',
  'house',
  'info-circle',
  'lightning-fill',
  'list',
  'list-ul',
  'lock-fill',
  'pencil-square',
  'person',
  'person-fill',
  'plus-circle',
  'shield-check',
  'sports-basketball',
  'star-fill',
  'trophy',
  'trophy-fill',
  'x-lg',
];

describe('Icon', () => {
  it.each(NAMES)(
    'draws %s as a 1em glyph in the text colour, hidden from screen readers',
    (name) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('data-icon')).toBe(name);
      // Bootstrap's 16-unit box; the Material basketball keeps its own 24.
      expect(svg?.getAttribute('viewBox')).toBe(
        name === 'sports-basketball' ? '0 0 24 24' : '0 0 16 16',
      );
      expect(svg?.getAttribute('width')).toBe('1em');
      expect(svg?.getAttribute('fill')).toBe('currentColor');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    },
  );

  it('keeps the even-odd fill of the glyphs Bootstrap Icons draws with it', () => {
    const { container } = render(<Icon name="list" />);
    expect(container.querySelector('path')?.getAttribute('fill-rule')).toBe(
      'evenodd',
    );
  });
});

it("draws the Material basketball on its own 24-unit box (sportbet's $matchIcon)", () => {
  const { container } = render(<Icon name="sports-basketball" />);
  expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
    '0 0 24 24',
  );
  const { container: other } = render(<Icon name="fire" />);
  expect(other.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 16 16');
});
