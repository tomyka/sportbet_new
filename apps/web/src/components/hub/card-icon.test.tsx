import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CardIcon } from './card-icon';

it("a card title's icon is in the accent (.sb-card-icon)", () => {
  const { container } = render(<CardIcon name="calendar3" />);
  const wrap = container.firstElementChild;
  expect(wrap?.className).toContain('text-accent');
  expect(wrap?.querySelector('svg')?.getAttribute('data-icon')).toBe(
    'calendar3',
  );
});

it("the leaders' trophy is amber (.sb-card-icon--trophy)", () => {
  const { container } = render(<CardIcon name="trophy-fill" tone="warn" />);
  expect(container.firstElementChild?.className).toContain('text-warn');
  expect(container.firstElementChild?.className).not.toContain('text-accent');
});
