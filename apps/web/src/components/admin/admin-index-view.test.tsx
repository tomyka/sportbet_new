import type { Role } from '@sportbet/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminIndexView } from './admin-index-view';

const view = (role: Role) =>
  render(<AdminIndexView role={role} flash={null} />);

const hrefOf = (name: string) =>
  screen.getByRole('link', { name }).getAttribute('href');

describe('AdminIndexView (admin/index.blade.php)', () => {
  it('admin: "Admin skydelis" and the tiles whose pages exist, the recalculation a POST', () => {
    view('results-manager');
    expect(
      screen.getByRole('heading', { name: 'Admin skydelis' }),
    ).toBeTruthy();
    expect(hrefOf('Rezultatai (turas)')).toBe('/admin/results');
    expect(hrefOf('Visi rezultatai')).toBe('/admin/resultsAll');
    const recalculate = screen.getByRole('button', {
      name: 'Perskaičiuoti taškus',
    });
    expect(recalculate.closest('form')?.getAttribute('method')).toBe('post');
    expect(recalculate.closest('form')?.getAttribute('action')).toBe(
      '/admin/recalculateAllGamePoints',
    );
    expect(screen.queryByText('Eigos taškai')).toBeNull();
  });

  it("R-26 amended: a superadmin sees every structure tile, each at sportbet's URL", () => {
    view('superadmin');
    expect(hrefOf('Turnyrai')).toBe('/admin/tournaments');
    expect(hrefOf('Turai')).toBe('/admin/events');
    expect(hrefOf('Žaidimai')).toBe('/admin/games');
    expect(hrefOf('Komandos')).toBe('/admin/teams');
  });

  it('R-26 amended: a results manager sees only the standings facts among them', () => {
    view('results-manager');
    expect(hrefOf('Komandos')).toBe('/admin/teams');
    for (const name of ['Turnyrai', 'Turai', 'Žaidimai']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('a player has no structure tile (the page itself sends a player home)', () => {
    view('player');
    for (const name of ['Turnyrai', 'Turai', 'Žaidimai', 'Komandos']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
  });

  it('admin: the one-time message - "Turnyro kontekstas: ..." - is shown under the title', () => {
    render(
      <AdminIndexView
        role="superadmin"
        flash={{
          kind: 'admin',
          message: 'context-chosen',
          name: 'Euroleague 2026/27',
        }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Turnyro kontekstas: Euroleague 2026/27',
    );
  });
});
