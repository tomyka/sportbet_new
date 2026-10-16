import {
  ruledRules,
  rulesPage,
  sportbetRules,
  type RuleSet,
  type TournamentFacts,
} from '@sportbet/domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RulesView } from './rules-view';

const FACTS: TournamentFacts = {
  teamCount: 20,
  deadlineRound: 5,
  survival: true,
};

function show(
  rules: RuleSet = ruledRules,
  facts: TournamentFacts | null = FACTS,
  player = false,
) {
  return render(
    <RulesView page={rulesPage(rules, facts)} player={player} panel={null} />,
  );
}

/** The card with this title. */
const card = (title: string): HTMLElement => {
  const heading = screen.getByRole('heading', { name: title, level: 2 });
  const found = heading.closest('div.border');
  if (!(found instanceof HTMLElement)) throw new Error(`no card ${title}`);
  return found;
};

/** The card's n-th table. */
const tableAt = (root: HTMLElement, index: number): HTMLElement => {
  const found = within(root).getAllByRole('table')[index];
  if (found === undefined) throw new Error('no table ' + String(index));
  return found;
};

const rowsOf = (table: HTMLElement): string[][] =>
  Array.from(table.querySelectorAll('tbody tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent),
  );

describe("/rules: the six cards, in sportbet's order and titles", () => {
  it('draws them in order', () => {
    show();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Totalizatoriaus eiga',
      'Taškų skaičiavimas - rungtynių rezultatai',
      'Tikslumas pagal rezultato skirtumą',
      'Koeficientas',
      'Sekos premija',
      'Taškų skaičiavimas - turnyro eiga',
    ]);
  });
});

describe('the overview card (R-106, R-107, R-128, R-133)', () => {
  it("names the two stages with R-76's names and marks (Q2)", () => {
    show();
    const overview = card('Totalizatoriaus eiga');
    expect(overview.textContent).toContain('Reguliarusis sezonas');
    expect(overview.textContent).toContain(
      'Rungtynių rezultatų ir vietų bendroje lentelėje spėjimas, komandų, patenkančių į atkrintamųjų (1/4) ir finalo ketverto (1/2) etapus, bei finalo išankstinis prognozavimas.',
    );
    expect(overview.textContent).toContain(
      'Nuoseklus atkrintamųjų (1/4), finalo ketverto (1/2) etapų ir finalo (F) rezultatų spėjimas.',
    );
  });

  it("states the deadline as the last result of the tournament's round, with its number, a link to the standings for a player only (R-106, Q1)", () => {
    show(ruledRules, FACTS, true);
    const overview = card('Totalizatoriaus eiga');
    expect(overview.textContent).toContain(
      'Rezultatus pateikti galima iki kiekvienų rungtynių pradžios. Turnyro eigos prognozė turi būti pateikta iki bus įvesti paskutinių 5-ojo turo rungtynių rezultatai.',
    );
    expect(overview.textContent).not.toContain('iki pirmųjų rungtynių');
    expect(
      within(overview)
        .getByRole('link', { name: 'Turnyro eigos prognozė' })
        .getAttribute('href'),
    ).toBe('/prediction/standings');
  });

  it('is text, not a link, for a guest', () => {
    show();
    expect(within(card('Totalizatoriaus eiga')).queryByRole('link')).toBeNull();
    expect(card('Totalizatoriaus eiga').textContent).toContain(
      'Turnyro eigos prognozė turi būti pateikta iki bus įvesti paskutinių 5-ojo turo rungtynių rezultatai.',
    );
  });

  it('leaves the standings deadline out with no tournament at all, the first sentence staying', () => {
    show(ruledRules, null);
    const text = card('Totalizatoriaus eiga').textContent;
    expect(text).toContain(
      'Rezultatus pateikti galima iki kiekvienų rungtynių pradžios.',
    );
    expect(text).not.toContain('turo rungtynių rezultatai');
  });

  it('says "Vertinimas" with sportbet\'s bullets, R-107\'s tie-break word for word and the switch-off after 20 misses (R-7, Q4)', () => {
    show();
    const items = within(card('Totalizatoriaus eiga'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Prognozuojamų rezultatų tikslumas vertinamas taškais.',
      'Laimi daugiausiai surinkęs taškų.',
      'Jei keli dalyviai surenka po lygiai taškų, žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų rungtynių skaičių.',
      'Neperdavus laiku rezultato, spėjimas bus sugeneruotas automatiškai - taškams už rungtynes nebus taikomas koeficientas.',
      'Praleidus 20 rungtynių per turnyrą, žaidėjas paslepiamas lentelėse ir spėjimai už jį nebegeneruojami, kol jis vėl išsaugo spėjimą.',
    ]);
  });

  it("shows the switch-off bullet under both rule sets: it is sportbet_new's own rule", () => {
    show(sportbetRules);
    expect(card('Totalizatoriaus eiga').textContent).toContain('Praleidus');
  });
});

describe('the match card (R-10, R-106)', () => {
  it('has the six tiles: (1+Koef.)×50, 50 − |Δ|, +50, +20, +(N−1)×5 (R-106), ×1 / ×2 / ×3 under ruledRules (R-10)', () => {
    show();
    const tiles = Array.from(
      card('Taškų skaičiavimas - rungtynių rezultatai').querySelectorAll(
        '.grid > div',
      ),
    ).map((tile) => tile.textContent);
    expect(tiles).toEqual([
      '(1+Koef.)×50Nugalėtojas - su koeficiento premija',
      '50 − |Δ|Tikslumas pagal rezultato skirtumą',
      '+50Bingo - tikslus rezultatas',
      '+20Tikslus skirtumas, kai rezultatas netikslus',
      '+(N−1)×5Seka - N atspėjimų iš eilės',
      '×1 / ×2 / ×3Etapo koeficientas',
    ]);
  });

  it("shows sportbet's ×1 / ×2 under sportbetRules", () => {
    show(sportbetRules);
    expect(
      card('Taškų skaičiavimas - rungtynių rezultatai').textContent,
    ).toContain('×1 / ×2Etapo koeficientas');
  });

  it("has the formula and the two entry bounds from the prediction page's texts", () => {
    show();
    const match = card('Taškų skaičiavimas - rungtynių rezultatai');
    expect(match.textContent).toContain(
      'Taškai = (Nugalėtojas + Tikslumas + Bingo + Seka) × Etapo_koef',
    );
    expect(
      within(match)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Rezultatas turi būti nuo 50 iki 120.',
      'Lygiosios negalimos - komandų rezultatai turi skirtis.',
    ]);
  });
});

describe('the margin card (R-42, MS-6)', () => {
  it('shows the five examples with a real minus and the bonus: Bingo, the exact margin, none', () => {
    show();
    const margin = card('Tikslumas pagal rezultato skirtumą');
    const table = within(margin).getByRole('table');
    expect(rowsOf(table)).toEqual([
      ['88:79', '88:79', '0', '50', '+50 (Bingo)'],
      ['88:79', '92:83', '0', '50', '+20'],
      ['88:79', '85:80', '4', '46', '-'],
      ['88:79', '79:88', '18', '32', '-'],
      ['88:79', '60:115', '64', '−14', '-'],
    ]);
    expect(margin.textContent).toContain(
      'Prašovus skirtumą daugiau nei 50 taškais, tikslumo taškai tampa neigiami.',
    );
    expect(margin.textContent).toContain(
      'Tikslumas = 50 − |prognozuotas skirtumas − tikrasis skirtumas|',
    );
  });

  it('colours a positive points cell as sportbet does and a negative one muted', () => {
    show();
    const cells = Array.from(
      within(card('Tikslumas pagal rezultato skirtumą'))
        .getByRole('table')
        .querySelectorAll('tbody tr td:nth-child(4)'),
    );
    expect(cells[0]?.className).toContain('bg-accent-tint');
    expect(cells[4]?.className).toContain('text-muted');
  });
});

describe('the odds card (R-2, R-61)', () => {
  it('shows the five crowd sizes with the odds and the winner points', () => {
    show();
    const rows = rowsOf(within(card('Koeficientas')).getByRole('table'));
    expect(rows).toHaveLength(5);
    expect(rows.map(([share]) => share)).toEqual([
      '93 % (28/30)',
      '50 % (15/30)',
      '33 % (10/30)',
      '10 % (3/30)',
      '3 % (1/30)',
    ]);
    for (const [, odds, winner] of rows) {
      expect(odds).toMatch(/^\d+\.\d\d$/);
      expect(winner).toMatch(/^\(1\+\d+\.\d\d\)×50 = \d+\.\d$/);
    }
  });

  it("has the formula bullets, and R-2's only under ruledRules (Q3)", () => {
    show();
    const items = within(card('Koeficientas'))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toContain('Taikomas tik atspėjus nugalėtoją.');
    expect(items).toContain(
      'Koeficientas skaičiuojamas tik pagal tikrus spėjimus - automatiškai sugeneruoti spėjimai į jį neįskaičiuojami.',
    );
  });

  it('has no R-2 bullet under sportbetRules', () => {
    show(sportbetRules);
    expect(card('Koeficientas').textContent).not.toContain(
      'tik pagal tikrus spėjimus',
    );
  });
});

describe('the serija card (R-106)', () => {
  it('says the order is kick-off, not "ID tvarka", and +5 per extra call', () => {
    show();
    const serija = card('Sekos premija');
    expect(serija.textContent).toContain(
      'Skaičiuojama pagal rungtynių pradžios laiką.',
    );
    expect(serija.textContent).not.toContain('ID tvarka');
    expect(serija.textContent).toContain(
      'Kiekvienas papildomas teisingas spėjimas iš eilės prideda +5.',
    );
  });

  it('shows runs 1, 2, 3 and N at the step', () => {
    show();
    expect(rowsOf(within(card('Sekos premija')).getByRole('table'))).toEqual([
      ['1', '+0'],
      ['2', '+5'],
      ['3', '+10'],
      ['N', '+(N−1)×5'],
    ]);
  });
});

describe('the standings card (R-128, R-133 Q2, Q8)', () => {
  const standings = () => card('Taškų skaičiavimas - turnyro eiga');

  it('lists the place misses 0 to 7 with 190 down to 120, the continue caption and the table length', () => {
    show();
    const rows = rowsOf(tableAt(standings(), 0));
    expect(rows[0]).toEqual(['0', '190']);
    expect(rows[1]).toEqual(['1', '180']);
    expect(rows[7]).toEqual(['7', '120']);
    expect(rows).toHaveLength(8);
    expect(standings().textContent).toContain(
      'Toliau - po 10 taškų už kiekvieną papildomą vietą, kol nukrenta iki 0.',
    );
    expect(standings().textContent).toContain(
      'Vieta spėjama bendroje lentelėje (1-20).',
    );
  });

  it('leaves the "(1-N)" caption out with no tournament', () => {
    show(ruledRules, null);
    expect(standings().textContent).not.toContain(
      'Vieta spėjama bendroje lentelėje',
    );
    expect(standings().textContent).toContain('Toliau - po 10 taškų');
  });

  it("names the bracket rows with R-76's names and marks, 60 and 120, a miss 0", () => {
    show();
    expect(rowsOf(tableAt(standings(), 1))).toEqual([
      ['Atkrintamosios (1/4)', '60', '0'],
      ['Finalo ketvertas (1/2)', '120', '0'],
    ]);
  });

  it('draws the finals matrix 36 27 / 27 30 under "Finalas (F)" with the champion line', () => {
    show();
    expect(rowsOf(tableAt(standings(), 2))).toEqual([
      ['1', '36', '27'],
      ['2', '27', '30'],
    ]);
    expect(standings().textContent).toContain(
      'Finalas (F) - vietos (prognozė vs tikroji)',
    );
    expect(standings().textContent).toContain(
      '1 - čempionas, 2 - vicečempionas.',
    );
    expect(standings().textContent).not.toContain('Ketvirtfinalis');
  });
});

describe('the fee panel', () => {
  it('is drawn only when the player has one', () => {
    const page = rulesPage(ruledRules, FACTS);
    const { rerender } = render(<RulesView page={page} player panel={null} />);
    expect(screen.queryByText(/Dalyvių skaičius/)).toBeNull();
    rerender(
      <RulesView
        page={page}
        player
        panel={{
          money: null,
          reward: 'Prizas: 100 €',
        }}
      />,
    );
    expect(screen.getByText('Prizas: 100 €')).toBeDefined();
  });
});
