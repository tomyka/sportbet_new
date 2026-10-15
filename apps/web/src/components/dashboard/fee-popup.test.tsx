import type { FeePayment, FeePopup as FeePopupView } from '@sportbet/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS, FeePopup } from './fee-popup';

// The #feeModal of partials/fee.blade.php: three copyable rows and no QR.

const PAYMENT: FeePayment = {
  beneficiary: 'Jonas Jonaitis',
  iban: 'LT12 1000 0111 0100 1000',
  reference: 'Jaunimo linijai',
  note: 'Ačiū, kad mokate',
};

const WITH_ROWS: FeePopupView = { amount: '1 234,00', payment: PAYMENT };

const written: string[] = [];

beforeEach(() => {
  written.length = 0;
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the fee pop-up', () => {
  it('shows the amount, the three rows, the instruction and the note', () => {
    render(<FeePopup popup={WITH_ROWS} close={() => undefined} />);
    expect(
      screen.getByRole('dialog', { name: 'Dalyvio mokestis' }),
    ).toBeTruthy();
    expect(screen.getByText('1 234,00 €')).toBeTruthy();
    for (const label of ['Gavėjas', 'Sąskaita (IBAN)', 'Mokėjimo paskirtis']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const value of [
      'Jonas Jonaitis',
      'LT12 1000 0111 0100 1000',
      'Jaunimo linijai',
    ]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(
      screen.getByText(
        'Mokėjimo paskirtį nurodykite tiksliai taip, kaip parašyta.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ačiū, kad mokate')).toBeTruthy();
    expect(screen.queryByText(/administratorius dar nenurodė/u)).toBeNull();
  });

  it('draws no note paragraph when there is none', () => {
    render(
      <FeePopup
        popup={{
          ...WITH_ROWS,
          payment: { ...PAYMENT, note: null },
        }}
        close={() => undefined}
      />,
    );
    expect(
      screen.getAllByText(/\./u).filter((el) => el.tagName === 'P'),
    ).toHaveLength(1);
  });

  it.each([
    ['Kopijuoti gavėją', 'Jonas Jonaitis'],
    ['Kopijuoti IBAN', 'LT12 1000 0111 0100 1000'],
    ['Kopijuoti mokėjimo paskirtį', 'Jaunimo linijai'],
  ])(
    "%s writes exactly the row's value, and shows the done state for 1.2 s",
    async (label, value) => {
      render(<FeePopup popup={WITH_ROWS} close={() => undefined} />);
      const button = screen.getByRole('button', { name: label });
      expect(button.getAttribute('data-done')).toBe('false');
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      expect(written).toEqual([value]);
      expect(button.getAttribute('data-done')).toBe('true');
      expect(button.className).toContain('border-ok text-ok');
      act(() => {
        vi.advanceTimersByTime(COPIED_MS);
      });
      expect(button.getAttribute('data-done')).toBe('false');
      expect(COPIED_MS).toBe(1200);
    },
  );

  it('says the administrator has not named where to pay when there are no rows', () => {
    render(
      <FeePopup
        popup={{ amount: '20,00', payment: null }}
        close={() => undefined}
      />,
    );
    expect(
      screen.getByText(
        'Mokėjimo rekvizitų administratorius dar nenurodė. Susisiekite su lygos administratoriumi.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kopijuoti/u })).toBeNull();
    expect(screen.getByText('20,00 €')).toBeTruthy();
  });

  it('closes by its Uždaryti buttons', () => {
    const close = vi.fn();
    render(<FeePopup popup={WITH_ROWS} close={close} />);
    for (const button of screen.getAllByRole('button', { name: 'Uždaryti' })) {
      fireEvent.click(button);
    }
    expect(close).toHaveBeenCalledTimes(2);
  });
});
