import { team } from '@sportbet/domain/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  card,
  ledger,
  openPage,
  pageData,
  points,
} from '../../../tests/support/survival-views';
import { SurvivalView } from './survival-view';

const pips = () =>
  screen.getAllByTestId('survival-pip').map((pip) => ({
    n: pip.textContent,
    state: pip.getAttribute('data-state'),
  }));

describe('SurvivalView (survival.blade.php)', () => {
  it('no survival round: one card, "Išlikimo žaidimas baigėsi."', () => {
    render(<SurvivalView data={pageData({ kind: 'over' }, null)} />);
    expect(screen.getByText('Išlikimo žaidimas baigėsi.')).toBeDefined();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('Taisyklės')).toBeNull();
  });

  it('the hero: the streak over "Iš eilės", and "Surinkta serijoje N taškų"', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            run: [ledger(1, 3, 'survived', 10), ledger(2, 4, 'survived', 22)],
            streak: 2,
            runPoints: points(32),
          }),
        )}
      />,
    );
    expect(screen.getByTestId('survival-streak').textContent).toBe('2');
    expect(screen.getByText('Iš eilės')).toBeDefined();
    expect(screen.getByTestId('survival-run-points').textContent).toBe(
      'Surinkta serijoje 32 taškų',
    );
  });

  it('the pips: max(5, streak + 1), the hits filled and the next one marked', () => {
    render(
      <SurvivalView
        data={pageData(openPage({ streak: 2, runPoints: points(22) }))}
      />,
    );
    expect(pips()).toEqual([
      { n: '1', state: 'hit' },
      { n: '2', state: 'hit' },
      { n: '3', state: 'now' },
      { n: '4', state: 'ahead' },
      { n: '5', state: 'ahead' },
    ]);
  });

  it('a long streak grows the pips past five', () => {
    render(<SurvivalView data={pageData(openPage({ streak: 6 }))} />);
    expect(pips()).toHaveLength(7);
    expect(pips()[6]).toEqual({ n: '7', state: 'now' });
  });

  it('the verdict once scored: "Turas užskaitytas: +N", or the run broken', () => {
    const { unmount } = render(
      <SurvivalView
        data={pageData(
          openPage({
            verdict: { state: 'survived', points: points(22) },
            choosing: false,
          }),
        )}
      />,
    );
    expect(screen.getByText('Turas užskaitytas: +22')).toBeDefined();
    unmount();
    render(
      <SurvivalView
        data={pageData(
          openPage({ verdict: { state: 'lost' }, choosing: false }),
        )}
      />,
    );
    expect(
      screen.getByText('Serija nutrūko - kitą turą pradedi iš naujo.'),
    ).toBeDefined();
  });

  it('no verdict before the round is scored', () => {
    render(<SurvivalView data={pageData()} />);
    expect(screen.queryByText(/Turas užskaitytas/u)).toBeNull();
    expect(screen.queryByText(/Serija nutrūko/u)).toBeNull();
    expect(screen.getByText('Už šį turą')).toBeDefined();
  });

  it('the card: the round\'s name with "· Rinkis komandą" while choosing, and the counts', () => {
    render(<SurvivalView data={pageData(openPage({ free: 3, used: 1 }))} />);
    expect(
      screen.getByRole('heading', { name: '3 turas · Rinkis komandą' }),
    ).toBeDefined();
    expect(screen.getByText('Laisvų: 3 · Panaudotų: 1')).toBeDefined();
    expect(
      screen.getByText(
        'Komandą gali rinktis ar keisti iki jos rungtynių pradžios.',
      ),
    ).toBeDefined();
  });

  it('not choosing: the name alone; a round without a name is "Išlikimas"', () => {
    render(
      <SurvivalView data={pageData(openPage({ choosing: false }), null)} />,
    );
    expect(screen.getByRole('heading', { name: 'Išlikimas' })).toBeDefined();
  });

  it('R-4: a locked pick says so, and every card is disabled', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            pickLocked: true,
            choosing: false,
            picked: team('1'),
            cards: [
              card(1, 2, {
                picked: true,
                selectable: false,
                state: { kind: 'started' },
              }),
              card(3, 4, { selectable: false }),
            ],
          }),
        )}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Pasirinkimas užfiksuotas - pasirinktos komandos rungtynės jau prasidėjo.',
    );
    for (const input of screen.getAllByRole('radio')) {
      expect(input).toHaveProperty('disabled', true);
    }
  });

  it('a locked pick in a scored round: no notice, the verdict says it', () => {
    render(
      <SurvivalView
        data={pageData(
          openPage({
            pickLocked: true,
            choosing: false,
            verdict: { state: 'lost' },
          }),
        )}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the run card shows only with a run; the rules always', () => {
    const { unmount } = render(<SurvivalView data={pageData()} />);
    expect(screen.queryByText('Tavo serija')).toBeNull();
    expect(screen.getByText('Taisyklės')).toBeDefined();
    unmount();
    render(
      <SurvivalView
        data={pageData(openPage({ run: [ledger(2, 4, 'pending', null)] }))}
      />,
    );
    expect(screen.getByText('Tavo serija')).toBeDefined();
  });
});
