import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SurvivalRules } from './survival-rules';

const cells = (row: HTMLElement) =>
  Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent);

describe('SurvivalRules ("Taisyklės")', () => {
  it("the four rules, the second with the Euroleague's two grounds (10 and 12 differ)", () => {
    render(<SurvivalRules />);
    expect(screen.getByRole('heading', { name: 'Taisyklės' })).toBeDefined();
    expect(
      screen.getAllByTestId('survival-rule').map((rule) => rule.textContent),
    ).toEqual([
      '1Kiekvieną turą renkiesi vieną komandą, kuri, tavo manymu, laimės savo rungtynes.',
      '2Ji laimi - namie gauni 10, išvykoje 12 taškų; jie sumuojasi per visą seriją, ir žaidi toliau.',
      '3Ji pralaimi - serija nutrūksta, skaičiavimas prasideda iš naujo, o visos komandos vėl laisvos.',
      '4Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta.',
    ]);
  });

  it('the points table: "Namie" 10..50 / 150, "Išvykoje" 12..60 / 180', () => {
    render(<SurvivalRules />);
    const rows = screen.getAllByRole('row');
    expect(rows.map(cells)).toEqual([
      ['turas', '1', '2', '3', '4', '5', 'Iš viso'],
      ['Namie', '10', '20', '30', '40', '50', '150'],
      ['Išvykoje', '12', '24', '36', '48', '60', '180'],
    ]);
  });
});
