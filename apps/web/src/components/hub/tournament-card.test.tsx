import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { card, TIP_OFF } from '../../../tests/support/hub-cards';
import { TournamentCard } from './tournament-card';

const GAME = {
  id: 1,
  tipOff: TIP_OFF,
  home: 'Zalgiris Kaunas',
  away: 'Real Madrid',
};

const LEADER = { rank: 1, username: 'ada', totalCents: 1000 };
const MEDAL = { team: 'Real Madrid', first: 1, second: 0, third: 0, fourth: 0 };

/** The widget's column in the card's 12-column row (Bootstrap's col-md-N). */
const span = (testId: string) =>
  screen.getByTestId(testId).parentElement?.className ?? '';

describe('TournamentCard', () => {
  it('card: name, sport and dates, description, and no button when there is none', () => {
    render(<TournamentCard card={card()} />);
    const shown = screen.getByTestId('tournament-card');
    expect(
      screen.getByRole('heading', { name: 'Euroleague 2026/27' }),
    ).toBeDefined();
    expect(shown.textContent).toContain('Krepšinis · 2026-09-30 - 2027-05-23');
    expect(shown.textContent).toContain('Eurolygos sezonas');
    expect(shown.querySelector('button, a')).toBeNull();
  });

  it('card: its button', () => {
    render(<TournamentCard card={card({ action: 'play' })} />);
    expect(screen.getByRole('button', { name: 'Žaisti →' })).toBeDefined();
  });

  it('card: an upcoming card explains the game, 7 of 12 beside its next games', () => {
    render(
      <TournamentCard
        card={card({
          group: 'upcoming',
          howItWorks: true,
          upcomingGames: [GAME],
        })}
      />,
    );
    expect(span('how-it-works')).toContain('md:col-span-7');
    expect(span('upcoming-games')).toContain('md:col-span-5');
  });

  it('card: with no next games, "Kaip tai veikia?" takes the whole row', () => {
    render(
      <TournamentCard card={card({ group: 'upcoming', howItWorks: true })} />,
    );
    expect(span('how-it-works')).toContain('col-span-12');
    expect(span('how-it-works')).not.toContain('md:col-span-7');
    expect(screen.queryByTestId('upcoming-games')).toBeNull();
  });

  it("card: a guest's active card shows the leaders and medals when there are any, the next games, and always the stats", () => {
    render(
      <TournamentCard
        card={card({
          upcomingGames: [GAME],
          guestPanels: {
            leaders: [],
            medals: [],
            participants: 3,
            predictions: 0,
          },
        })}
      />,
    );
    expect(screen.queryByTestId('leaders')).toBeNull();
    expect(screen.queryByTestId('medals')).toBeNull();
    expect(span('upcoming-games')).toContain('md:col-span-6');
    expect(span('stats')).toContain('md:col-span-4');
    expect(screen.queryByTestId('how-it-works')).toBeNull();
  });

  it("card: with all four of a guest's panels, three in a row and the stats across the whole card", () => {
    render(
      <TournamentCard
        card={card({
          upcomingGames: [GAME],
          guestPanels: {
            leaders: [LEADER],
            medals: [MEDAL],
            participants: 3,
            predictions: 7,
          },
        })}
      />,
    );
    expect(span('leaders')).toContain('md:col-span-4');
    expect(span('medals')).toContain('md:col-span-4');
    expect(span('upcoming-games')).toContain('md:col-span-4');
    expect(span('stats')).toContain('col-span-12');
    expect(span('stats')).not.toContain('md:col-span-4');
  });
});
