import type { FeeMoney, FeePanel as FeePanelView } from '@sportbet/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeePanel } from './fee-panel';

// partials/fee.blade.php, drawn from the domain's FeePanel view (R-104, R-124).

const COUNTS = { players: 4, expected: '80.00', collected: '1,234.50' };

function due(overrides: Partial<FeeMoney> = {}): FeeMoney {
  return {
    state: 'due',
    feeText: '20,00',
    counts: COUNTS,
    popup: {
      amount: '20,00',
      payment: {
        beneficiary: 'Jonas Jonaitis',
        iban: 'LT12 1000 0111 0100 1000',
        reference: 'Jaunimo linijai',
        note: null,
      },
    },
    ...overrides,
  };
}

const panelOf = (
  money: FeeMoney | null,
  reward: string | null = null,
): FeePanelView => ({ money, reward });

describe('the fee panel', () => {
  it('an unpaid member sees the due line, the way to the pop-up, the counts and the pots', () => {
    render(<FeePanel panel={panelOf(due())} />);
    expect(
      screen.getByText('Dalyvio mokestis 20,00 € dar nesumokėtas.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kaip sumokėti' })).toBeTruthy();
    expect(
      screen.getByText(
        'Dalyvių skaičius: 4, prognozuojama suma: 80.00€, surinkta suma: 1,234.50€',
      ),
    ).toBeTruthy();
  });

  it('the pop-up opens with the amount and closes again', () => {
    render(<FeePanel panel={panelOf(due())} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kaip sumokėti' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Mokėti')).toBeTruthy();
    expect(screen.getByText('20,00 €')).toBeTruthy();
    const [, footer] = screen.getAllByRole('button', { name: 'Uždaryti' });
    if (footer === undefined) throw new Error('no footer button');
    fireEvent.click(footer);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a paid member sees the paid line and the counts, and no pop-up button, no dialog, no account number', () => {
    const { container } = render(
      <FeePanel
        panel={panelOf(due({ state: 'paid', popup: null }), 'Prizas: 100 €')}
      />,
    );
    expect(
      screen.getByText(
        'Startinis dalyvio mokestis sumokėtas. Sėkmės totalizatoriuje!',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/nesumokėtas/u)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.textContent).not.toContain('LT12');
    expect(container.textContent).toContain('surinkta suma: 1,234.50€');
  });

  it('a guest (R-124) sees no money at all, only the reward', () => {
    const { container } = render(
      <FeePanel panel={panelOf(null, 'Prizas: 100 €')} />,
    );
    expect(container.textContent).toBe('Prizas: 100 €');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/mokest/u)).toBeNull();
    expect(screen.queryByText(/suma/u)).toBeNull();
  });

  it('the reward is text, not HTML', () => {
    const { container } = render(
      <FeePanel panel={panelOf(due(), '<b>Prizas</b><img src=x>')} />,
    );
    expect(screen.getByText('<b>Prizas</b><img src=x>')).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws nothing but an empty box for a panel with neither money nor reward', () => {
    const { container } = render(<FeePanel panel={panelOf(null)} />);
    expect(container.textContent).toBe('');
  });
});
