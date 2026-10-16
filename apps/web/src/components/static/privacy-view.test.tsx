import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrivacyView } from './privacy-view';

/** The text the owner approved on 2026-10-16 (privacy-new.txt, R-108): in order, one entry for each sentence or item. */
const APPROVED = [
  'Privatumo politika',
  'Atnaujinta: 2026 m. spalio mėn.',
  '1. Kas mes esame',
  'SportBet yra sporto prognozių žaidimas, skirtas asmeniniam naudojimui tarp draugų ir kolegų. Administratorius: Tomas Konovalovas, el. paštas: t.konovalovas@gmail.com.',
  '2. Kokius duomenis renkame',
  'Paskyros duomenys - el. pašto adresas ir vartotojo vardas, kuriuos pateikiate registruodamiesi.',
  'Prognozės - jūsų įvesti rungtynių rezultatų ir turnyro eigos spėjimai.',
  'Sesijos duomenys - prisijungimo sesija saugoma naršyklės slapuke (cookie), kad galėtumėte naudotis svetaine.',
  'Techniniai duomenys - IP adresas ir naršyklės informacija, matomi tik serverio žurnaluose; prisijungimų įraše IP adresas nesaugomas.',
  '3. Kaip naudojame duomenis',
  'Valdyti jūsų paskyrą ir rodyti asmeninę statistiką.',
  'Skaičiuoti taškus ir formuoti lyderių lentelę.',
  'Siųsti svarbius pranešimus apie žaidimą (pvz., turnyro pradžią).',
  '4. Reklama ir trečiųjų šalių slapukai',
  'Ši svetainė naudoja Google AdSense reklamai rodyti. Google ir jos partneriai gali naudoti slapukus, kad rodytų jums aktualesnę reklamą, remdamiesi jūsų ankstesniais apsilankymais šioje ir kitose svetainėse.',
  'Daugiau apie tai, kaip Google naudoja duomenis, rasite: policies.google.com/technologies/ads.',
  'Reklamų personalizavimą galite išjungti: google.com/settings/ads.',
  '5. Slapukai (cookies)',
  'Naudojame šiuos slapukus:',
  'Sesijos slapukas - būtinas prisijungimui palaikyti. Galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu; ištrinamas atsijungus.',
  'Google AdSense slapukai - reklamos personalizavimui ir statistikai. Valdomi „Google LLC".',
  'Slapukus galite išjungti naršyklės nustatymuose, tačiau tada gali neveikti prisijungimas.',
  '6. Duomenų saugojimas',
  'Paskyros duomenys saugomi tol, kol paskyra yra aktyvi arba kol pateikiate prašymą juos ištrinti. Techniniai žurnalai saugomi ne ilgiau nei 90 dienų.',
  '7. Jūsų teisės (BDAR / GDPR)',
  'Turite teisę:',
  'Susipažinti su savo asmens duomenimis.',
  'Reikalauti juos ištaisyti arba ištrinti.',
  'Atšaukti sutikimą dėl duomenų tvarkymo.',
  'Pateikti skundą Valstybinei duomenų apsaugos inspekcijai (vdai.lrv.lt).',
  'Kreipkitės el. paštu: t.konovalovas@gmail.com.',
  '8. Pakeitimai',
  'Apie esminius privatumo politikos pakeitimus informuosime per svetainę. Toliau naudodamiesi svetaine, sutinkate su nauja politika.',
];

const normal = (text: string): string => text.replace(/\s+/g, ' ').trim();

describe('/privacy (R-108, approved 2026-10-16)', () => {
  it('says every sentence of the approved text, in order', () => {
    render(<PrivacyView />);
    const page = normal(document.body.textContent);
    let from = 0;
    for (const sentence of APPROVED) {
      const at = page.indexOf(normal(sentence), from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at + sentence.length;
    }
  });

  it('has the headings 1 to 8 as sub-headings under the title', () => {
    render(<PrivacyView />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privatumo politika' }),
    ).toBeDefined();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(APPROVED.filter((line) => /^[1-8]\. /.test(line)));
  });

  it("carries R-108's three fixes: October 2026, the IP in the logs only (R-45), the 90-day session cookie (R-44)", () => {
    render(<PrivacyView />);
    const text = normal(document.body.textContent);
    expect(text).toContain('Atnaujinta: 2026 m. spalio mėn.');
    expect(text).toContain(
      'matomi tik serverio žurnaluose; prisijungimų įraše IP adresas nesaugomas.',
    );
    expect(text).toContain(
      'Galioja 90 dienų ir pratęsiamas kiekvieno apsilankymo metu; ištrinamas atsijungus.',
    );
    expect(text).not.toContain('birželio');
    expect(text).not.toContain('Ištrinamas uždarius naršyklę');
    expect(text).not.toContain('automatiškai perduodama serverio žurnalams');
  });

  it('links the administrator by mailto, twice, and the external pages with rel="noopener"', () => {
    render(<PrivacyView />);
    const mails = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('mailto:'));
    expect(mails.map((link) => link.getAttribute('href'))).toEqual([
      'mailto:t.konovalovas@gmail.com',
      'mailto:t.konovalovas@gmail.com',
    ]);
    const external = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('https://'));
    expect(external.map((link) => link.getAttribute('href'))).toEqual([
      'https://policies.google.com/technologies/ads',
      'https://www.google.com/settings/ads',
      'https://vdai.lrv.lt',
    ]);
    for (const link of external) {
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });
});
