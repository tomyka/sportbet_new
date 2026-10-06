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
