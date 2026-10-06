import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './icon';

const NAMES: readonly IconName[] = [
  'arrow-left',
  'arrow-left-right',
  'arrow-right-short',
  'bar-chart-fill',
  'box-arrow-in-right',
  'box-arrow-right',
  'calendar3',
  'check-circle-fill',
  'check2',
  'cookie',
  'database-gear',
  'envelope',
  'exclamation-circle',
  'globe2',
  'graph-up-arrow',
  'info-circle',
  'list',
  'pencil-square',
  'person',
  'person-fill',
  'plus-circle',
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
      expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
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
