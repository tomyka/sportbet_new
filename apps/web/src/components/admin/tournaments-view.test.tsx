import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FINISHED, RUNNING } from './tournament-fixtures';
import { TournamentContextNote } from './tournament-context-note';
import { TournamentsView } from './tournaments-view';

describe('TournamentsView (admin/tournaments/index.blade.php)', () => {
  it('tournaments: the title with the count, and "Naujas turnyras" to the create page', () => {
    render(<TournamentsView tournaments={[RUNNING, FINISHED]} flash={null} />);
    expect(screen.getByRole('heading', { name: /Turnyrai/ })).toBeTruthy();
    expect(screen.getByTestId('tournament-count').textContent).toBe('2');
    expect(
      screen
        .getByRole('link', { name: /Naujas turnyras/ })
        .getAttribute('href'),
    ).toBe('/admin/tournaments/create');
  });

  it('tournaments: each row names the tournament, its slug, sport, status in words and start day', () => {
    render(<TournamentsView tournaments={[RUNNING, FINISHED]} flash={null} />);
    const [running, finished] = screen.getAllByTestId('tournament-row');
    expect(running?.textContent).toContain('Euroleague 2026/27');
    expect(running?.textContent).toContain('euroleague-2026-27');
    expect(running?.textContent).toContain('basketball');
    expect(running?.textContent).toContain('Vykstantis');
    expect(running?.textContent).toContain('2026-10-01');
    expect(finished?.textContent).toContain('Baigtas');
  });

  it('tournaments: a tournament with no start day shows a dash', () => {
    render(
      <TournamentsView
        tournaments={[
          { ...RUNNING, profile: { ...RUNNING.profile, startsOn: null } },
        ]}
        flash={null}
      />,
    );
    expect(screen.getByTestId('tournament-row').textContent).toContain('-');
  });

  it('tournaments: "Redaguoti" opens the edit form, and "▶ Kontekstas" is a POST to its context', () => {
    render(<TournamentsView tournaments={[RUNNING]} flash={null} />);
    const row = within(screen.getByTestId('tournament-row'));
    expect(
      row.getByRole('link', { name: 'Redaguoti' }).getAttribute('href'),
    ).toBe('/admin/tournaments/3/edit');
    const button = row.getByRole('button', { name: '▶ Kontekstas' });
    expect(button.getAttribute('title')).toBe('Dirbti šiame turnyre');
    const form = button.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/admin/tournaments/3/context');
  });

  it('tournaments: the one-time message is shown above the table', () => {
    render(
      <TournamentsView
        tournaments={[]}
        flash={{ kind: 'admin', message: 'tournament-created' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Turnyras sukurtas.');
  });
});

describe('TournamentContextNote (partials/admin/tournament-context.blade.php)', () => {
  it('context: names the tournament the page writes into', () => {
    render(<TournamentContextNote tournament={RUNNING.tournament} />);
    expect(screen.getByRole('note').textContent).toBe(
      'Turnyras: Euroleague 2026/27',
    );
  });

  it('context: warns when there is none', () => {
    render(<TournamentContextNote tournament={null} />);
    expect(screen.getByRole('note').textContent).toBe(
      'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
    );
  });
});
