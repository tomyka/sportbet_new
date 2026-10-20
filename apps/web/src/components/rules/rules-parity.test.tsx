import { helpPage, rulesPage, type TournamentFacts } from '@sportbet/domain';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpView } from '../help/help-view';
import { RulesView } from './rules-view';

// Slice 18 (#35), QA: the whole text of /rules and /help, block by block and
// in order, against sportbet's views at 1618164 (partials/rules.blade.php,
// help.blade.php) for a Euroleague tournament of 20 teams whose deadline
// round is 5. Every entry is sportbet's sentence unless a comment names the
// ruling that changed it (R-2, R-7, R-10, R-76 + R-133 Q2, R-106, R-133,
// R-138: the scoring balance, ruled only).
// A sentence added, dropped or moved fails here, which the per-card tests
// (that look a sentence up) cannot say.

const FACTS: TournamentFacts = {
  teamCount: 20,
  deadlineRound: 5,
  survival: true,
};

const BLOCKS = 'h2, p, li, td, th, div';

/** The page's innermost text blocks in document order, whitespace folded, empty ones (icons) dropped. */
function blocks(root: HTMLElement): string[] {
  // A strong is a block of its own only directly under a div (a stage's or
  // a section's title); inside a sentence it is part of it.
  const all = Array.from(root.querySelectorAll(`${BLOCKS}, div > strong`));
  return all
    .filter((element) => element.querySelector(BLOCKS) === null)
    .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
    .filter((text) => text !== '');
}

function rulesBlocks(): string[] {
  const { container } = render(
    <RulesView page={rulesPage(FACTS)} player={false} panel={null} />,
  );
  return blocks(container);
}

const MISS_ROWS = [
  ['0', '190'],
  ['1', '180'],
  ['2', '170'],
  ['3', '160'],
  ['4', '150'],
  ['5', '140'],
  ['6', '130'],
  ['7', '120'],
].flat();

/**
 * The margin rule's texts and its five worked rows: R-138's scoring balance
 * (50 - 2 x |error|, +30, +100), which rewrites exactly these lines of
 * sportbet's page.
 */
const BALANCE = {
  ruled: {
    // R-138: the slope 2, the bonus +30, the bingo +100.
    tile: '50 − 2×|Δ|',
    bingoTile: '+100',
    exactTile: '+30',
    rule: 'Svarbus komandų rezultatų skirtumas: nuo 50 atimama dvigubai tiek, kiek prognozuotas skirtumas prasilenkia su tikruoju.',
    formula:
      'Tikslumas = 50 − 2 × |prognozuotas skirtumas − tikrasis skirtumas|',
    bonuses:
      'Atspėjus tikslų skirtumą, bet ne tikslų rezultatą, prie tikslumo taškų pridedama +30. Atspėjus tikslų rezultatą, vietoj to skiriamas Bingo +100 - šios premijos nesumuojamos.',
    rows: [
      ...['88:79', '88:79', '0', '50', '+100 (Bingo)'],
      ...['88:79', '92:83', '0', '50', '+30'],
      ...['88:79', '85:80', '4', '42', '-'],
      ...['88:79', '79:88', '18', '14', '-'],
      ...['88:79', '60:115', '64', '−78', '-'],
    ],
    // 50 - 2 x 25 = 0: past 25 points of miss the accuracy turns negative.
    caption:
      'Prašovus skirtumą daugiau nei 25 taškais, tikslumo taškai tampa neigiami.',
  },
} as const;

/** sportbet's /rules for a guest, with the rulings applied; `rates` is R-10's tile, `misses` R-7's number, `balance` R-138's scoring texts. */
function expectedRules(options: {
  rates: string;
  misses: number;
  balance: keyof typeof BALANCE;
}): string[] {
  const balance = BALANCE[options.balance];
  return [
    'Totalizatoriaus eiga',
    'Totalizatorius vykdomas dviem etapais:',
    'I',
    'Reguliarusis sezonas',
    // R-76 / R-133 Q2: the stages' names with marks.
    'Rungtynių rezultatų ir vietų bendroje lentelėje spėjimas, komandų, patenkančių į atkrintamųjų (1/4) ir finalo ketverto (1/2) etapus, bei finalo išankstinis prognozavimas.',
    // R-106, R-128, R-133 Q1: the deadline is the round's last result.
    'Rezultatus pateikti galima iki kiekvienų rungtynių pradžios. Turnyro eigos prognozė turi būti pateikta iki bus įvesti paskutinių 5-ojo turo rungtynių rezultatai.',
    'II',
    'Atkrintamųjų etapas',
    'Nuoseklus atkrintamųjų (1/4), finalo ketverto (1/2) etapų ir finalo (F) rezultatų spėjimas.',
    'Vertinimas',
    'Prognozuojamų rezultatų tikslumas vertinamas taškais.',
    'Laimi daugiausiai surinkęs taškų.',
    // R-107: word for word.
    'Jei keli dalyviai surenka po lygiai taškų, žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų rungtynių skaičių.',
    'Neperdavus laiku rezultato, spėjimas bus sugeneruotas automatiškai - taškams už rungtynes nebus taikomas koeficientas.',
    // R-7, R-32, R-133 Q4: an added bullet.
    `Praleidus ${String(options.misses)} rungtynių per turnyrą, žaidėjas paslepiamas lentelėse ir spėjimai už jį nebegeneruojami, kol jis vėl išsaugo spėjimą.`,

    'Taškų skaičiavimas - rungtynių rezultatai',
    '(1+Koef.)×50',
    'Nugalėtojas - su koeficiento premija',
    balance.tile,
    'Tikslumas pagal rezultato skirtumą',
    balance.bingoTile,
    'Bingo - tikslus rezultatas',
    balance.exactTile,
    'Tikslus skirtumas, kai rezultatas netikslus',
    // R-106: +(N-1)x5, sportbet's literal was +N-1.
    '+(N−1)×5',
    'Seka - N atspėjimų iš eilės',
    options.rates,
    'Etapo koeficientas',
    'Taškai = (Nugalėtojas + Tikslumas + Bingo + Seka) × Etapo_koef',
    'Rezultatas turi būti nuo 50 iki 120.',
    'Lygiosios negalimos - komandų rezultatai turi skirtis.',

    'Tikslumas pagal rezultato skirtumą',
    balance.rule,
    balance.formula,
    balance.bonuses,
    'Rungtynės',
    'Prognozė',
    'Skirtumo klaida',
    'Taškai',
    'Premija',
    ...balance.rows,
    balance.caption,

    'Koeficientas',
    'Koeficientas atlygina už drąsų, retai atspėtą spėjimą - kuo mažiau dalyvių pasirinko tą baigtį, tuo daugiau taškų už nugalėtoją.',
    'Koef. formulė: log₂(Dalyvių_skaičius / Spėjusiųjų_šią_baigtį)',
    'Taikomas tik atspėjus nugalėtoją.',
    'Automatiškai sugeneruotiems spėjimams koeficientas = 0',
    // R-2, R-133 Q3: an added bullet.
    'Koeficientas skaičiuojamas tik pagal tikrus spėjimus - automatiškai sugeneruoti spėjimai į jį neįskaičiuojami.',
    'Spėjo šią baigtį',
    'Koef.',
    'Nugalėtojas',
    ...['93 % (28/30)', '0.10', '(1+0.10)×50 = 55.0'],
    ...['50 % (15/30)', '1.00', '(1+1.00)×50 = 100.0'],
    ...['33 % (10/30)', '1.59', '(1+1.59)×50 = 129.5'],
    ...['10 % (3/30)', '3.32', '(1+3.32)×50 = 216.0'],
    ...['3 % (1/30)', '4.91', '(1+4.91)×50 = 295.5'],

    'Sekos premija',
    'Už kiekvieną iš eilės teisingai atspėtą nugalėtoją kaupiama sekos premija.',
    // R-106: kick-off order, sportbet's "(ID tvarka)".
    'Skaičiuojama pagal rungtynių pradžios laiką.',
    'Vienas teisingas spėjimas iš eilės - premijos nėra.',
    'Kiekvienas papildomas teisingas spėjimas iš eilės prideda +5.',
    'Sekos premija dauginama iš etapo koeficiento kartu su kitais taškais.',
    'Atspėjimų iš eilės',
    'Sekos premija',
    ...['1', '+0', '2', '+5', '3', '+10', 'N', '+(N−1)×5'],

    'Taškų skaičiavimas - turnyro eiga',
    'Vietos lentelėje',
    'Nuokrypis nuo tikrosios vietos',
    'Taškai',
    ...MISS_ROWS,
    'Toliau - po 10 taškų už kiekvieną papildomą vietą, kol nukrenta iki 0.',
    'Vieta spėjama bendroje lentelėje (1-20).',
    'Nokautų etapas - patekimas',
    'Etapas',
    'atspėta',
    'neatspėta',
    // R-76 / R-133 Q2: names with marks, sportbet's "Ketvirtfinalis", "Pusfinalis".
    ...['Atkrintamosios (1/4)', '60', '0'],
    ...['Finalo ketvertas (1/2)', '120', '0'],
    // R-133 Q2: "Finalas (F)", sportbet's "Finalas".
    'Finalas (F) - vietos (prognozė vs tikroji)',
    ...['1', '2', '1', '36', '27', '2', '27', '30'],
    'Eilutė = prognozė, stulpelis = tikroji vieta',
    '1 - čempionas, 2 - vicečempionas.',
  ];
}

describe('/rules, block by block against sportbet 1618164', () => {
  it('sportbet plus the listed rulings and nothing else', () => {
    expect(rulesBlocks()).toEqual(
      expectedRules({
        rates: '×1 / ×2 / ×3',
        misses: 20,
        balance: 'ruled',
      }),
    );
  });
});

const HELP_FACTS: TournamentFacts = FACTS;

function helpBlocks(facts: TournamentFacts): string[] {
  const { container } = render(<HelpView help={helpPage(facts)} />);
  return blocks(container);
}

/** sportbet's /help (help.blade.php), the rulings applied; `survival` is the tournament's switch (R-133 Q7). */
function expectedHelp(survival: boolean): string[] {
  return [
    'Spėjimai',
    'Rungtynių rezultatai',
    'Kiekvienų rungtynių rezultatą reikia atspėti iki jų pradžios. Jei spėjimas nepateikiamas laiku - jis sugeneruojamas automatiškai ir taškams nebus taikomas odds koeficientas.',
    'Turnyro eiga',
    // R-106, R-133 Q1, Q2: the deadline round and the stage marks.
    'Kol neįvesti paskutinių 5-ojo turo rungtynių rezultatai, reikia numatyti, kaip baigsis reguliarusis sezonas: kiekvienos komandos vietą bendroje lentelėje (1-20) ir kas prasibraus į tolesnius etapus: atkrintamąsias (1/4) ir finalo ketvertą (1/2).',
    'Finale nurodomi du: čempionas ir sidabras.',
    // R-106, R-133 Q5: a short table is saved.
    'Lentelę galima pildyti dalimis - nepilna prognozė taip pat išsaugoma.',
    ...(survival
      ? [
          'Išlikimas',
          // R-133 Q6: "arba kol panaudotos visos komandos" added.
          'Kiekvieną turą renkiesi vieną komandą, kuri, tavo manymu, laimės. Jei ji laimi - serija tęsiasi ir taškai auga. Jei pralaimi - serija nutrūksta, skaičiavimas prasideda iš naujo, o visos komandos vėl laisvos. Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta arba kol panaudotos visos komandos.',
        ]
      : []),
    'Suvestinė',
    'Suvestinė atsiranda, kai turnyre yra bent vienos suskaičiuotos rungtynės. Kitų žaidėjų spėjimai matomi tik tų rungtynių, kurios jau prasidėjo arba turi rezultatą.',
    'Prognozės - visų dalyvių rungtynių spėjimų ir gautų taškų suvestinė.',
    'Eiga - dalyvių turnyro eigos prognozių suvestinė.',
    ...(survival ? ['Išlikimas - išlikimo žaidimo suvestinė.'] : []),
    'Grafikas - dalyvių taškų ir vietų kitimo dinamika per visą turnyrą.',
    'Informacija',
    'Taisyklės - taškų skaičiavimo taisyklės ir pilnas žaidimo aprašymas.',
    'Pagalba - šis puslapis.',
    'Jaunimo linija - informacija apie paramą Jaunimo Linijai.',
    'Privatumas - privatumo politika.',
  ];
}

describe('/help, block by block against sportbet 1618164', () => {
  it('for a tournament with survival: sportbet plus the listed rulings and nothing else', () => {
    expect(helpBlocks(HELP_FACTS)).toEqual(expectedHelp(true));
  });

  it('for a tournament without it: the survival block and the summary line are the only difference', () => {
    expect(helpBlocks({ ...HELP_FACTS, survival: false })).toEqual(
      expectedHelp(false),
    );
  });
});

describe('what /rules and /help must not state (R-8, R-54, R-128: registration is not on these pages)', () => {
  it('never mentions when registration closes', () => {
    const text = [...rulesBlocks(), ...helpBlocks(HELP_FACTS)].join(' ');
    expect(text).not.toMatch(/Registracij/i);
    expect(text).not.toContain('iki pirmųjų');
  });
});
