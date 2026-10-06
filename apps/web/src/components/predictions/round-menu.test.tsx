import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { routerSpies } from '../../../tests/support/router';
import { describe, expect, it, vi } from 'vitest';
import { RoundMenu } from './round-menu';

const ROUNDS = [
  { id: 21, name: '1 turas' },
  { id: 22, name: '2 turas' },
];

describe('RoundMenu (results.blade.php)', () => {
  it('lists "Visi etapai" first, then every round, the chosen one selected', () => {
    render(<RoundMenu rounds={ROUNDS} selected={22} />);
    const menu = screen.getByRole('combobox');
    expect(
      [...menu.querySelectorAll('option')].map((option) => option.textContent),
    ).toEqual(['Visi etapai', '1 turas', '2 turas']);
    expect(menu).toHaveProperty('value', '22');
  });

  it('R-58: choosing "Visi etapai" asks for every round, a round for itself', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue(routerSpies({ push }));
    render(<RoundMenu rounds={ROUNDS} selected={22} />);
    const menu = screen.getByRole('combobox');
    fireEvent.change(menu, { target: { value: 'all' } });
    expect(push).toHaveBeenLastCalledWith('/prediction/results?event=all');
    fireEvent.change(menu, { target: { value: '21' } });
    expect(push).toHaveBeenLastCalledWith('/prediction/results?event=21');
  });
});
