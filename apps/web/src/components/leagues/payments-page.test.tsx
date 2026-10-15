import { paymentsMeter, type PaymentsPage } from '@sportbet/domain';
import { leagueNo } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaymentsView } from './payments-page';

// leagues/payments.blade.php and partials/league-payment-details-form.blade.php.

function pageOf(details: Partial<PaymentsPage['details']> = {}): PaymentsPage {
  return {
    league: { id: leagueNo(9), name: 'Draugų lyga' },
    hasFee: true,
    meter: paymentsMeter(
      { collected: 0, expected: 4000, paidCount: 0, memberCount: 1 },
      true,
    ),
    rows: [
      {
        member: 5,
        display: 'Jonas Jonaitis',
        username: 'jonas',
        isGuest: false,
        paid: false,
        amountText: '',
      },
    ],
    details: { beneficiary: '', iban: '', note: '', ...details },
  };
}

const boxOf = (label: string): HTMLInputElement | HTMLTextAreaElement => {
  const box = screen.getByLabelText(label, { exact: false });
  if (!(
    box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement
  )) {
    throw new Error('no box');
  }
  return box;
};

describe('the payments page', () => {
  it('titles the card with the league and links back to Lygos', () => {
    render(<PaymentsView page={pageOf()} flash={null} />);
    expect(screen.getByText('Mokėjimai · Draugų lyga')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Lygos' }).getAttribute('href'),
    ).toBe('/leagues');
  });

  it('draws the board and the details form in a real post form to payment-details', () => {
    const { container } = render(<PaymentsView page={pageOf()} flash={null} />);
    expect(
      screen.getByLabelText('Jonas Jonaitis', { selector: 'input' }),
    ).toBeTruthy();
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/leagues/9/payment-details');
    expect(screen.getByText('Mokėjimo rekvizitai')).toBeTruthy();
    expect(
      screen.getByText('Matys tik tie nariai, kurie dar nesumokėjo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Išsaugoti' })).toBeTruthy();
  });

  it("the boxes have sportbet's names, limits and help", () => {
    render(<PaymentsView page={pageOf()} flash={null} />);
    const beneficiary = boxOf('Gavėjas');
    expect(beneficiary.getAttribute('name')).toBe('payment_beneficiary');
    expect(beneficiary.getAttribute('maxlength')).toBe('70');
    expect(beneficiary.getAttribute('placeholder')).toBe('Vardas Pavardė');
    expect(beneficiary.getAttribute('aria-describedby')).toBe(
      'payment_beneficiary_help',
    );
    expect(
      screen.getByText(
        'Sąskaitos savininko vardas ir pavardė, ne lygos ar įmonės pavadinimas - mokėtojo bankas palygina jį su sąskaita ir įspėja, jei nesutampa.',
      ),
    ).toBeTruthy();
    const iban = boxOf('Sąskaita (IBAN)');
    expect(iban.getAttribute('name')).toBe('payment_iban');
    expect(iban.getAttribute('maxlength')).toBe('42');
    const note = boxOf('Papildomas tekstas');
    expect(note.getAttribute('name')).toBe('payment_note');
    expect(note.getAttribute('maxlength')).toBe('500');
    expect(screen.getByText('— nebūtina')).toBeTruthy();
  });

  it('shows the stored IBAN grouped, and the beneficiary and note as stored', () => {
    render(
      <PaymentsView
        page={pageOf({
          beneficiary: 'Jonas Jonaitis',
          iban: 'LT12 1000 0111 0100 1000',
          note: 'Ačiū',
        })}
        flash={null}
      />,
    );
    expect(boxOf('Gavėjas').value).toBe('Jonas Jonaitis');
    expect(boxOf('Sąskaita (IBAN)').value).toBe('LT12 1000 0111 0100 1000');
    expect(boxOf('Papildomas tekstas').value).toBe('Ačiū');
  });

  it("offers the beneficiary the page was given (the owner's name) and an empty box for an ownerless league", () => {
    const offered = render(
      <PaymentsView
        page={pageOf({ beneficiary: 'Savininkas Jonas' })}
        flash={null}
      />,
    );
    expect(boxOf('Gavėjas').value).toBe('Savininkas Jonas');
    offered.unmount();
    render(<PaymentsView page={pageOf()} flash={null} />);
    expect(boxOf('Gavėjas').value).toBe('');
  });

  it('shows the message of the last save once, in the card', () => {
    render(
      <PaymentsView
        page={pageOf()}
        flash={{ kind: 'league', message: 'payments-saved' }}
      />,
    );
    expect(screen.getByText('Mokėjimai išsaugoti').getAttribute('role')).toBe(
      'status',
    );
  });

  it('shows an error message of the details form', () => {
    render(
      <PaymentsView
        page={pageOf()}
        flash={{ kind: 'league', message: 'details-iban-invalid' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Neteisingas IBAN - patikrinkite, ar nesuklydote skaitmeniu.',
    );
  });

  it('draws no message when there is none', () => {
    render(<PaymentsView page={pageOf()} flash={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
