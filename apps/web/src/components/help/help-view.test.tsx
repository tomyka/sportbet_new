import {
  helpPage,
  SURVIVAL_REPEAT_RULE,
  type HelpFacts,
} from '@sportbet/domain';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpView } from './help-view';

const FACTS: HelpFacts = {
  teamCount: 20,
  deadlineRound: 5,
  standingsCloses: { state: 'open' },
  survival: true,
};

const show = (facts: HelpFacts = FACTS) =>
  render(<HelpView help={helpPage(facts)} />);

const card = (title: string): HTMLElement => {
  const heading = screen.getByRole('heading', { name: title, level: 2 });
  const found = heading.closest('div.border');
  if (!(found instanceof HTMLElement)) throw new Error(`no card ${title}`);
  return found;
};

describe("/help: three cards in sportbet's order", () => {
  it('Spėjimai, Suvestinė, Informacija', () => {
    show();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Spėjimai', 'Suvestinė', 'Informacija']);
  });
});

describe('Spėjimai', () => {
  it('describes the match results, with the generated-prediction sentence and the results screenshot', () => {
    show();
    const predictions = card('Spėjimai');
    expect(predictions.textContent).toContain('Rungtynių rezultatai');
    expect(predictions.textContent).toContain(
      'Kiekvienų rungtynių rezultatą reikia atspėti iki jų pradžios. Jei spėjimas nepateikiamas laiku - jis sugeneruojamas automatiškai ir taškams nebus taikomas odds koeficientas.',
    );
    const shot = within(predictions).getByAltText(
      'Rungtynių rezultatų spėjimas',
    );
    expect(shot.getAttribute('src')).toContain('results.png');
  });

  it('describes the standings with the deadline round, the table length and the stages with marks (R-106, Q1, Q2)', () => {
    show();
    expect(card('Spėjimai').textContent).toContain(
      'Kol neįvesti paskutinių 5-ojo turo rungtynių rezultatai, reikia numatyti, kaip baigsis reguliarusis sezonas: kiekvienos komandos vietą bendroje lentelėje (1-20) ir kas prasibraus į tolesnius etapus: atkrintamąsias (1/4) ir finalo ketvertą (1/2).',
    );
    expect(card('Spėjimai').textContent).not.toContain(
      'Iki pirmųjų rungtynių pradžios',
    );
  });

  it('names the final\'s two places and says a short table is saved (Q5), not "nepriimama"', () => {
    show();
    const text = card('Spėjimai').textContent;
    expect(text).toContain('Finale nurodomi du: čempionas ir sidabras.');
    expect(text).toContain(
      'Lentelę galima pildyti dalimis - nepilna prognozė taip pat išsaugoma.',
    );
    expect(text).not.toContain('nepriimama');
    expect(
      within(card('Spėjimai'))
        .getByAltText('Turnyro eigos spėjimas')
        .getAttribute('src'),
    ).toContain('standings.png');
  });

  it('leaves the deadline clause and the table length out with no tournament', () => {
    show({
      teamCount: null,
      deadlineRound: null,
      standingsCloses: null,
      survival: false,
    });
    const text = card('Spėjimai').textContent;
    expect(text).toContain(
      'Reikia numatyti, kaip baigsis reguliarusis sezonas: kiekvienos komandos vietą bendroje lentelėje ir kas prasibraus',
    );
    expect(text).not.toContain('(1-');
    expect(text).not.toContain('turo rungtynių rezultatai');
  });

  it('draws the survival block with the repeat rule naming the reset (Q6), only while the tournament plays survival (Q7)', () => {
    show();
    const text = card('Spėjimai').textContent;
    expect(text).toContain('Išlikimas');
    expect(text).toContain(SURVIVAL_REPEAT_RULE);
    expect(text).toContain('arba kol panaudotos visos komandos.');
    expect(
      within(card('Spėjimai'))
        .getByAltText('Išlikimo spėjimas')
        .getAttribute('src'),
    ).toContain('survival.png');
  });

  it('draws no survival block when the tournament does not play it', () => {
    show({ ...FACTS, survival: false });
    expect(card('Spėjimai').textContent).not.toContain('Išlikimas');
    expect(screen.queryByAltText('Išlikimo spėjimas')).toBeNull();
  });

  it('has the basketball for the matches, not a football', () => {
    show();
    expect(card('Spėjimai').querySelector('svg')).not.toBeNull();
  });
});

describe('Suvestinė', () => {
  it("lists the four summaries, survival's only with the tournament's switch (Q7)", () => {
    show();
    const items = within(card('Suvestinė'))
      .getAllByRole('listitem')
      .map((item) => item.textContent.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      'Prognozės - visų dalyvių rungtynių spėjimų ir gautų taškų suvestinė.',
      'Eiga - dalyvių turnyro eigos prognozių suvestinė.',
      'Išlikimas - išlikimo žaidimo suvestinė.',
      'Grafikas - dalyvių taškų ir vietų kitimo dinamika per visą turnyrą.',
    ]);
  });

  it('drops the survival line when the tournament does not play it', () => {
    show({ ...FACTS, survival: false });
    expect(card('Suvestinė').textContent).not.toContain('Išlikimas');
    expect(within(card('Suvestinė')).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('Informacija', () => {
  it('lists the four pages, as sportbet does', () => {
    show();
    const items = within(card('Informacija'))
      .getAllByRole('listitem')
      .map((item) => item.textContent.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      'Taisyklės - taškų skaičiavimo taisyklės ir pilnas žaidimo aprašymas.',
      'Pagalba - šis puslapis.',
      'Jaunimo linija - informacija apie paramą Jaunimo Linijai.',
      'Privatumas - privatumo politika.',
    ]);
  });
});
