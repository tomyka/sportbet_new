import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharityView } from './charity-view';

describe('/charity (charity.blade.php, R-52, R-75)', () => {
  it('has the hero: the title, 7 500€, 8+ and 2018, and a button to Jaunimo linija', () => {
    render(<CharityView />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Žaidžiame dėl gero tikslo',
      }),
    ).toBeDefined();
    const text = document.body.textContent;
    for (const stat of [
      '7 500€',
      'paaukota iš viso',
      '8+',
      'turnyrų',
      '2018',
      'pradėjome',
    ]) {
      expect(text).toContain(stat);
    }
    const buttons = screen.getAllByRole('link', { name: /Jaunimo linija/ });
    for (const link of buttons) {
      expect(link.getAttribute('href')).toBe('https://www.jaunimolinija.lt/');
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });

  it('speaks of a basketball game, not a football one (R-52, R-75)', () => {
    render(<CharityView />);
    expect(document.body.textContent).toContain(
      'SportBet - tai ne tik krepšinio prognozių žaidimas.',
    );
    expect(document.body.textContent).not.toContain('futbolo');
  });

  it("has the thanks with the total and TransUnion's matching to 2024", () => {
    render(<CharityView />);
    expect(document.body.textContent).toContain(
      'Jūsų dėka JAU pavyko surinkti ir paaukoti Jaunimo Linijai 7 500€. Iki 2024 metų visą surinktą paramą dvigubino TransUnion Lithuania įmonė. Ačiū, kad prisidedate prie gerų darbų!',
    );
  });

  it('has the thank-you image', () => {
    render(<CharityView />);
    expect(
      screen.getByAltText('Jaunimo linija - ačiū').getAttribute('src'),
    ).toContain('JL_thank.png');
  });

  it("has the eleven payment proofs in sportbet's order, each a link to its image, labelled", () => {
    render(<CharityView />);
    const proofs = screen.getAllByTestId('charity-proof');
    expect(proofs.map((proof) => proof.textContent)).toEqual([
      'Euroleague 2025',
      'Euroleague 2024',
      'Euroleague 2023',
      'Euroleague 2022',
      'EuroBasket 2022',
      'Euroleague 2021',
      'Euroleague 2020',
      'Euro 2020',
      'Euroleague 2019',
      'Euroleague 2018 (2)',
      'Euroleague 2018 (1)',
    ]);
    expect(proofs.map((proof) => proof.getAttribute('href'))).toEqual([
      '/img/charity/JL_payment_el2025.png',
      '/img/charity/JL_payment_el2024.png',
      '/img/charity/JL_payment_el2023.png',
      '/img/charity/JL_payment_el2022.png',
      '/img/charity/JL_payment_ecb2022.png',
      '/img/charity/JL_payment_el2021.png',
      '/img/charity/JL_payment_el2020.png',
      '/img/charity/JL_payment_ecf2020.png',
      '/img/charity/JL_payment_el2019.png',
      '/img/charity/JL_payment_el2018_2.png',
      '/img/charity/JL_payment_el2018_1.png',
    ]);
    for (const proof of proofs) {
      expect(proof.getAttribute('rel')).toBe('noopener');
      const label = proof.textContent;
      expect(within(proof).getByAltText(`${label} mokėjimas`)).toBeDefined();
    }
  });
});
