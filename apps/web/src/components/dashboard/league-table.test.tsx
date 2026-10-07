import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  historyOf,
  player,
  tableOf,
  tableRow,
} from '../../../tests/support/dashboard';
import { LeagueTable } from './league-table';

const rowOf = (username: string) => {
  const found = screen.getByText(username).closest('[data-testid="lb-row"]');
  if (!(found instanceof HTMLElement)) throw new Error(`no row ${username}`);
  return found;
};

const RICH = {
  survival: true,
  rows: [
    tableRow('ona', 1, {
      totalCents: 123_456,
      matchCents: 100_050,
      serijaCents: 1_250,
      standingsCents: 21_656,
      survivalCents: 150,
      bingo: 3,
      stages: { place: 19_000, playOffs: 2_656, finalFour: 0, final: 0 },
    }),
    tableRow('jonas', 2, { totalCents: 5_000, survivalCents: 300 }),
  ],
};

describe('LeagueTable: partials/points.blade.php\'s "Taškų lentelė"', () => {
  it('game page: the title, "#", "Žaidėjas" and "Taškai", and the sub-columns with their tooltips', () => {
    render(<LeagueTable table={RICH} me={null} />);
    expect(screen.getByText('Taškų lentelė')).toBeDefined();
    expect(screen.getByText('#')).toBeDefined();
    expect(screen.getByText('Žaidėjas')).toBeDefined();
    expect(screen.getByText('Taškai')).toBeDefined();
    const titles = [
      'Rezultatų spėjimo taškai',
      'Eigos spėjimo taškai',
      'Išlikimo taškai',
      'Sekos taškai',
      'Bingo taškai',
    ];
    for (const title of titles) {
      // Shown from md up, as sportbet's d-none d-md-block.
      expect(screen.getByTitle(title).className).toContain('md:flex');
    }
  });

  it('game page: "Išlikimo taškai" only when the tournament plays survival', () => {
    render(<LeagueTable table={{ ...RICH, survival: false }} me={null} />);
    expect(screen.queryByTitle('Išlikimo taškai')).toBeNull();
    expect(within(rowOf('ona')).queryByText('1.5')).toBeNull();
  });

  it("game page: a row's rank, name, parts to one decimal, serija as +X, bingo as a star and count, and the total", () => {
    render(<LeagueTable table={RICH} me={null} />);
    const ona = within(rowOf('ona'));
    expect(ona.getByText('1')).toBeDefined();
    expect(ona.getByText('1,000.5')).toBeDefined();
    expect(ona.getByText('216.6')).toBeDefined();
    expect(ona.getByText('1.5')).toBeDefined();
    expect(ona.getByText('+12.5')).toBeDefined();
    expect(ona.getByTestId('lb-bingo').textContent).toBe('3');
    expect(
      ona.getByTestId('lb-bingo').querySelector('[data-icon="star-fill"]'),
    ).not.toBeNull();
    expect(ona.getByText('1,234.6')).toBeDefined();
    const jonas = within(rowOf('jonas'));
    expect(jonas.getByText('-')).toBeDefined();
    expect(jonas.getByText('3')).toBeDefined();
    expect(jonas.getByTestId('lb-bingo').textContent).toBe('');
  });

  it('game page: names are plain text until the compare page (slice 11)', () => {
    render(<LeagueTable table={RICH} me={null} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('game page: ranks 1 to 3 in the text colour, the rest muted', () => {
    render(<LeagueTable table={tableOf(4)} me={null} />);
    expect(within(rowOf('p3')).getByText('3').className).toContain('text-text');
    expect(within(rowOf('p4')).getByText('4').className).toContain(
      'text-muted',
    );
  });

  it("game page: the player's own row is highlighted, its name and total in the accent", () => {
    render(<LeagueTable table={tableOf(3)} me={player('p2')} />);
    expect(rowOf('p2').getAttribute('data-me')).toBe('true');
    expect(rowOf('p2').className).toContain('bg-accent-tint');
    expect(screen.getByText('p2').className).toContain('text-accent');
    expect(rowOf('p1').getAttribute('data-me')).toBeNull();
  });

  it('game page: the standings cell opens its stages by Euroleague name (R-76), those above 0 only', () => {
    render(<LeagueTable table={RICH} me={null} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(within(rowOf('ona')).getByText('216.6'));
    const pop = within(screen.getByRole('tooltip'));
    expect(pop.getByText('Reguliarus sezonas')).toBeDefined();
    expect(pop.getByText('190.0')).toBeDefined();
    expect(pop.getByText('Atkrintamosios')).toBeDefined();
    expect(pop.getByText('26.6')).toBeDefined();
    expect(pop.queryByText('Finalo ketvertas')).toBeNull();
    expect(pop.queryByText('Finalas')).toBeNull();
    fireEvent.mouseLeave(within(rowOf('ona')).getByText('216.6'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('game page: a standings cell with no stage points opens nothing', () => {
    render(<LeagueTable table={RICH} me={null} />);
    fireEvent.mouseEnter(
      within(rowOf('jonas')).getByText('0.0', {
        selector: '[data-testid="lb-standings"]',
      }),
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('game page: the top 10, then "···" and the own row below them, and "Rodyti visus (N)" / "Rodyti mažiau"', () => {
    render(<LeagueTable table={tableOf(14)} me={player('p13')} />);
    expect(screen.getByText('p10')).toBeDefined();
    expect(screen.queryByText('p11')).toBeNull();
    expect(screen.getByText('···')).toBeDefined();
    expect(screen.getByText('p13')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Rodyti visus (14)' }));
    expect(screen.getByText('p11')).toBeDefined();
    expect(screen.getByText('p14')).toBeDefined();
    expect(screen.queryByText('···')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rodyti mažiau' }));
    expect(screen.queryByText('p11')).toBeNull();
  });

  it('game page: no "···" when the own row is in the top 10, no button for 10 players or fewer', () => {
    const { unmount } = render(
      <LeagueTable table={tableOf(14)} me={player('p4')} />,
    );
    expect(screen.queryByText('···')).toBeNull();
    unmount();
    render(<LeagueTable table={tableOf(10)} me={null} />);
    expect(screen.queryByRole('button', { name: /Rodyti/ })).toBeNull();
  });

  it('game page: a row with a history opens its trend on a click, and closes again', () => {
    const table = {
      survival: false,
      rows: [
        tableRow('ona', 1, { history: historyOf(2, 1) }),
        tableRow('jonas', 2),
      ],
    };
    render(<LeagueTable table={table} me={null} />);
    const ona = rowOf('ona');
    expect(ona.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Paskutinės 6 rungtynės')).toBeNull();
    fireEvent.click(ona);
    expect(ona.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Paskutinės 6 rungtynės')).toBeDefined();
    fireEvent.keyDown(ona, { key: 'Enter' });
    expect(screen.queryByText('Paskutinės 6 rungtynės')).toBeNull();
    // A row with no history is not a control.
    expect(rowOf('jonas').getAttribute('role')).toBeNull();
  });
});
