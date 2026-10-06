import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TeamCrest } from './team-crest';

it("a team's crest is its TeamLogo file, named by the team, on sportbet's white plate", () => {
  const { getByRole } = render(<TeamCrest team="Zalgiris Kaunas" />);
  const crest = getByRole('img', { name: 'Zalgiris Kaunas' });
  expect(crest.getAttribute('src')).toBe('/img/teams/zalgiris%20kaunas.png');
  expect(crest.className).toContain('bg-crest-plate');
  expect(crest.className).toContain('border-crest-plate-line');
});

it('a team with no crest file is drawn with the placeholder, still named', () => {
  const { getByRole } = render(<TeamCrest team="Nežinoma" />);
  expect(getByRole('img', { name: 'Nežinoma' }).getAttribute('src')).toBe(
    '/img/teams/_placeholder.svg',
  );
});

it("draws the predictions page sizes on sportbet's .sb-crest plate: 22, 26 and 52px, square-ish", () => {
  for (const [size, px] of [
    ['line', 22],
    ['row', 26],
    ['large', 52],
  ] as const) {
    const { container } = render(<TeamCrest team="Real Madrid" size={size} />);
    const crest = container.querySelector('img');
    expect(crest?.getAttribute('width')).toBe(String(px));
    expect(crest?.className).toContain(`size-[${String(px)}px]`);
    expect(crest?.className).toContain('rounded-[6px]');
    expect(crest?.className).toContain('object-contain');
    expect(crest?.className).toContain('bg-crest-plate');
  }
});

it("keeps the hub's crest as it was: 20px and round (.standing-flag)", () => {
  const { container } = render(<TeamCrest team="Real Madrid" />);
  const crest = container.querySelector('img');
  expect(crest?.getAttribute('width')).toBe('20');
  expect(crest?.className).toContain('rounded-full');
  expect(crest?.className).toContain('object-cover');
});
