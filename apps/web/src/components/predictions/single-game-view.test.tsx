import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SingleGameView } from './single-game-view';

const GAME = {
  game: 9001,
  home: 'Zalgiris Kaunas',
  away: 'Real Madrid',
  stamp: '2027-03-04 20:00',
  locked: false,
  prediction: { home: '', away: '' },
  min: 50,
  max: 120,
};

describe('SingleGameView (game-single.blade.php)', () => {
  it('"Spėjimas": both crests and names, "vs", the tip-off in Vilnius with " LT"', () => {
    render(<SingleGameView game={GAME} />);
    const card = screen.getByTestId('single-game');
    expect(screen.getByRole('heading', { name: 'Spėjimas' })).toBeDefined();
    expect(card.textContent).toContain('vs');
    expect(card.textContent).toContain('2027-03-04 20:00 LT');
    expect(screen.getAllByAltText('Zalgiris Kaunas')).toHaveLength(1);
    expect(screen.getAllByAltText('Real Madrid')).toHaveLength(1);
  });

  it('open, with a row: the form', () => {
    render(<SingleGameView game={GAME} />);
    expect(screen.getByTestId('single-game-form')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Išsaugoti spėjimą' }),
    ).toBeDefined();
  });

  it('locked: "Žaidimas jau prasidėjo - spėjimų keisti negalima.", and the player\'s prediction when there is one', () => {
    render(
      <SingleGameView
        game={{ ...GAME, locked: true, prediction: { home: '85', away: '80' } }}
      />,
    );
    const card = screen.getByTestId('single-game');
    expect(card.textContent).toContain(
      'Žaidimas jau prasidėjo - spėjimų keisti negalima.',
    );
    expect(card.textContent).toContain('85 : 80');
    expect(card.textContent).toContain('Jūsų spėjimas');
    expect(screen.queryByTestId('single-game-form')).toBeNull();
  });

  it('locked with a blank row: the notice alone', () => {
    render(<SingleGameView game={{ ...GAME, locked: true }} />);
    expect(screen.getByTestId('single-game').textContent).not.toContain(
      'Jūsų spėjimas',
    );
  });

  it('no row: "Spėjimas nerastas. Bandykite dar kartą nuo pagrindinio puslapio."', () => {
    render(<SingleGameView game={{ ...GAME, prediction: null }} />);
    expect(screen.getByTestId('single-game').textContent).toContain(
      'Spėjimas nerastas. Bandykite dar kartą nuo pagrindinio puslapio.',
    );
    expect(
      screen
        .getByRole('link', { name: 'pagrindinio puslapio' })
        .getAttribute('href'),
    ).toBe('/');
  });
});
