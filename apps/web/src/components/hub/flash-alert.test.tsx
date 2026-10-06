import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashAlert } from './flash-alert';

// sportbet's session('info') and session('error') alerts.

describe('FlashAlert', () => {
  it('flash: a registration done is a success, naming the tournament', () => {
    render(
      <FlashAlert
        flash={{ kind: 'registered', tournament: 'Euroleague 2027/28' }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Užsiregistravote į turnyrą: Euroleague 2027/28',
    );
  });

  it.each([
    ['registration-closed', 'Registracija į šį turnyrą jau pasibaigė.'],
    ['confirm-required', 'Patvirtinkite, kad norite dalyvauti šiame turnyre.'],
  ] as const)('flash: %s is an error: %s', (kind, text) => {
    render(<FlashAlert flash={{ kind }} />);
    expect(screen.getByRole('alert').textContent).toBe(text);
  });
});
