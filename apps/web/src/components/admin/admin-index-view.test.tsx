import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminIndexView } from './admin-index-view';

describe('AdminIndexView (admin/index.blade.php)', () => {
  it('admin: "Admin skydelis" and the tiles whose pages exist, the recalculation a POST', () => {
    render(<AdminIndexView />);
    expect(
      screen.getByRole('heading', { name: 'Admin skydelis' }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Rezultatai (turas)' })
        .getAttribute('href'),
    ).toBe('/admin/results');
    expect(
      screen
        .getByRole('link', { name: 'Visi rezultatai' })
        .getAttribute('href'),
    ).toBe('/admin/resultsAll');
    const recalculate = screen.getByRole('button', {
      name: 'Perskaičiuoti taškus',
    });
    expect(recalculate.closest('form')?.getAttribute('method')).toBe('post');
    expect(recalculate.closest('form')?.getAttribute('action')).toBe(
      '/admin/recalculateAllGamePoints',
    );
    expect(screen.queryByText('Eigos taškai')).toBeNull();
  });
});
