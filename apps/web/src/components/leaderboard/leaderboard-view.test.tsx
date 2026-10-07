import type { LeaderboardRow } from '@sportbet/domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { player } from '../../../tests/support/dashboard';
import { GLYPH } from '../hub/glyphs';
import { LeaderboardView } from './leaderboard-view';

const row = (
  username: string,
  rank: number,
  overrides: Partial<LeaderboardRow> = {},
): LeaderboardRow => ({
  player: player(username),
  username,
  rank,
  totalCents: 100_000 - rank * 1_000,
  exact: 5,
  winners: 20,
  games: 40,
  ...overrides,
});

const ROWS = [
  row('ona', 1, { totalCents: 123_456, exact: 12, winners: 33, games: 51 }),
  row('petras', 2),
  row('jonas', 3),
  row('rasa', 4),
];

const rowOf = (username: string) => {
  const found = screen.getByText(username).closest('tr');
  if (found === null) throw new Error(`no row ${username}`);
  return within(found);
};

describe('LeaderboardView: leaderboard.blade.php\'s "Lyderių lentelė"', () => {
  it('leaderboard: the trophy and title, the intro with "Prisijunk" linking to the page itself', () => {
    render(<LeaderboardView rows={ROWS} />);
    const title = screen.getByText('Lyderių lentelė');
    expect(title.querySelector('[data-icon="trophy-fill"]')).not.toBeNull();
    const intro = screen.getByTestId('leaderboard-intro');
    expect(intro.textContent).toBe(
      'Žaidžiame nuo 2016 metų - kiekvienas turnyras prideda naujų iššūkių ir intrigų. Prisijunk ir išbandyk save.',
    );
    expect(
      screen.getByRole('link', { name: 'Prisijunk' }).getAttribute('href'),
    ).toBe('/leaderboard');
  });

  it('leaderboard: the columns "#", "Žaidėjas", "Taškai", then "Tikslūs" from sm and "Nugalėtojai", "Žaidimai" from md', () => {
    render(<LeaderboardView rows={ROWS} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      '#',
      'Žaidėjas',
      'Taškai',
      'Tikslūs',
      'Nugalėtojai',
      'Žaidimai',
    ]);
    expect(headers[3]?.className).toContain('sm:table-cell');
    expect(headers[4]?.className).toContain('md:table-cell');
    expect(headers[5]?.className).toContain('md:table-cell');
  });

  it("leaderboard: a row's medal or rank, the username, the total to one decimal, exact scores, winners and games", () => {
    render(<LeaderboardView rows={ROWS} />);
    const ona = rowOf('ona');
    expect(ona.getByText(GLYPH.gold)).toBeDefined();
    expect(ona.getByText('1,234.6')).toBeDefined();
    expect(ona.getByText('12')).toBeDefined();
    expect(ona.getByText('33')).toBeDefined();
    expect(ona.getByText('51')).toBeDefined();
    expect(rowOf('petras').getByText(GLYPH.silver)).toBeDefined();
    expect(rowOf('jonas').getByText(GLYPH.bronze)).toBeDefined();
    expect(rowOf('rasa').getByText('4')).toBeDefined();
  });

  it('leaderboard: ranks 1 to 3 on the warm tint (.lb-pub-top), the rest plain', () => {
    render(<LeaderboardView rows={ROWS} />);
    expect(screen.getByText('jonas').closest('tr')?.className).toContain(
      'bg-warn-tint',
    );
    expect(screen.getByText('rasa').closest('tr')?.className).not.toContain(
      'bg-warn-tint',
    );
  });

  it('leaderboard: the empty text before any game is scored (issue 131)', () => {
    render(<LeaderboardView rows={[]} />);
    expect(
      screen.getByText(
        'Kol kas nesužaista nė vienų rungtynių - lentelė pasipildys po pirmųjų rezultatų.',
      ),
    ).toBeDefined();
  });

  it("leaderboard: then the leaderboard's charity card (R-75)", () => {
    render(<LeaderboardView rows={ROWS} />);
    expect(screen.getByTestId('charity-card').textContent).toContain(
      'Sužinoti daugiau apie labdarą',
    );
  });
});
