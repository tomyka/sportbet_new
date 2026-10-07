import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { game, gameLine, PLAYED_LINE } from '../../../tests/support/dashboard';
import { gameRowOf } from './game-row';
import { FixtureDeck } from './fixture-deck';

const rowsOf = (...lines: Parameters<typeof gameRowOf>[0][]) =>
  lines.map(gameRowOf);

const cards = () => screen.getAllByTestId('deck-card');

describe('FixtureDeck: partials/fixture-deck.blade.php\'s "Artimiausios rungtynės"', () => {
  it('game page: the title and "Visi spėjimai" to the predictions page', () => {
    render(<FixtureDeck games={rowsOf(gameLine())} />);
    expect(screen.getByText('Artimiausios rungtynės')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Visi spėjimai' }).getAttribute('href'),
    ).toBe('/prediction/results');
  });

  it('game page: an open card - "MMM D · H:i" in Vilnius, both teams with "?" for a blank side, "Tavo spėjimas" and "Spėti", linking to the predictions page', () => {
    render(
      <FixtureDeck
        games={rowsOf(gameLine({ predicted: { home: 81, away: null } }))}
      />,
    );
    const [card] = cards();
    if (card === undefined) throw new Error('no card');
    const inCard = within(card);
    expect(card.getAttribute('href')).toBe('/prediction/results');
    expect(inCard.getByText('Spa 20 · 21:00')).toBeDefined();
    expect(inCard.getByText('Olympiacos')).toBeDefined();
    expect(inCard.getByText('Zalgiris')).toBeDefined();
    expect(inCard.getByText('81')).toBeDefined();
    expect(inCard.getByText('?')).toBeDefined();
    expect(inCard.getByText('Tavo spėjimas')).toBeDefined();
    expect(inCard.getByText('Spėti')).toBeDefined();
    expect(card.querySelectorAll('img')).toHaveLength(2);
  });

  it('game page: a played card says "Rez h:a"; a started or played card offers nothing, not "Keisti" (R-75)', () => {
    render(
      <FixtureDeck
        games={rowsOf(
          PLAYED_LINE,
          gameLine({ game: game(11), state: 'locked', predict: false }),
        )}
      />,
    );
    const [played, locked] = cards();
    expect(played?.textContent).toContain('Rez 88:79');
    expect(locked?.textContent).toContain('Tavo spėjimas');
    expect(screen.queryByText('Spėti')).toBeNull();
    expect(screen.queryByText('Keisti')).toBeNull();
  });

  it('game page: the arrows, named for a screen reader, show only when the deck overflows', () => {
    render(<FixtureDeck games={rowsOf(gameLine())} />);
    // jsdom lays nothing out, so the deck never overflows here.
    for (const name of ['Ankstesnės rungtynės', 'Vėlesnės rungtynės']) {
      const arrow = screen.getByLabelText(name);
      expect(arrow.hidden).toBe(true);
    }
  });
});
