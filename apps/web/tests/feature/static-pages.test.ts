import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { Browser, documentOf } from '../support/browser';
import { ACTIVE_PROFILE, withProfile } from '../support/hub';
import { jonasPlaying } from '../support/predictions';
import { saveTournamentWithGames, SOONER } from '../support/registration';

// Slice 18 (#35): /rules, /help and /charity against the built app, and
// /support and /sponsors answered by redirects (C12, C13).

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const guest = (ip = '192.0.2.70') => new Browser(baseUrl, ip);

const textOf = (html: string): string =>
  documentOf({
    path: '/',
    status: 200,
    location: null,
    html,
    setCookies: [],
  }).body.textContent;

/** SOONER, visible to a guest, with or without the survival game. */
async function visibleTournament(survival: boolean): Promise<void> {
  await saveTournamentWithGames(db, {
    ...SOONER,
    tournament: { ...SOONER.tournament, survival },
  });
  await withProfile(db, SOONER.tournament.slug, ACTIVE_PROFILE);
}

describe('the four pages answer a guest and a player', () => {
  it('a guest gets /rules, /help and /charity with 200, even on an empty database', async () => {
    const browser = guest();
    for (const path of ['/rules', '/help', '/charity']) {
      const page = await browser.get(path);
      expect(page.status).toBe(200);
    }
  });

  it('a player gets them too', async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    for (const path of ['/rules', '/help', '/charity']) {
      const page = await browser.get(path);
      expect(page.status).toBe(200);
    }
  });
});

describe('/rules (R-100, R-106, R-128, R-133)', () => {
  it("states the ruled rates, the serija step of 5 and the odds line (R-10, R-2), and sportbet's own text where no ruling touched it", async () => {
    const text = textOf((await guest().get('/rules')).html);
    expect(text).toContain('×1 / ×2 / ×3');
    expect(text).toContain('+(N−1)×5');
    expect(text).toContain('Skaičiuojama pagal rungtynių pradžios laiką.');
    expect(text).toContain('tik pagal tikrus spėjimus');
    expect(text).toContain(
      'Jei keli dalyviai surenka po lygiai taškų, žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų rungtynių skaičių.',
    );
    expect(text).toContain('Atkrintamosios (1/4)');
    expect(text).toContain('Finalo ketvertas (1/2)');
  });

  it('on an empty database: no table length, no deadline round, the page still whole', async () => {
    const text = textOf((await guest().get('/rules')).html);
    expect(text).not.toContain('Vieta spėjama bendroje lentelėje');
    expect(text).not.toContain('turo rungtynių rezultatai');
    expect(text).toContain('Totalizatoriaus eiga');
  });

  it('describes the tournament a guest would join: its table length and its deadline round', async () => {
    await visibleTournament(true);
    const text = textOf((await guest().get('/rules')).html);
    expect(text).toContain('Vieta spėjama bendroje lentelėje (1-2).');
    expect(text).toContain(
      'Turnyro eigos prognozė turi būti pateikta iki bus įvesti paskutinių 5-ojo turo rungtynių rezultatai.',
    );
  });

  it('links the standings page for a player only', async () => {
    await visibleTournament(true);
    const asGuest = documentOf(await guest().get('/rules'));
    expect(
      asGuest.querySelector('main a[href="/prediction/standings"]'),
    ).toBeNull();
    const player = await jonasPlaying(db, client, baseUrl, SOONER);
    const asPlayer = documentOf(await player.get('/rules'));
    expect(
      asPlayer.querySelector('main a[href="/prediction/standings"]'),
    ).not.toBeNull();
  });
});

describe('/help (R-106, R-133)', () => {
  it('shows the survival block and the summary line for a tournament that plays survival, a guest included (Q7)', async () => {
    await visibleTournament(true);
    const text = textOf((await guest().get('/help')).html);
    expect(text).toContain('arba kol panaudotos visos komandos.');
    expect(text).toContain('išlikimo žaidimo suvestinė.');
    expect(text).toContain(
      'Kol neįvesti paskutinių 5-ojo turo rungtynių rezultatai, reikia numatyti',
    );
    expect(text).toContain('(1-2)');
  });

  it('drops both for a tournament without the survival game', async () => {
    await visibleTournament(false);
    const text = textOf((await guest().get('/help')).html);
    expect(text).not.toContain('arba kol panaudotos visos komandos');
    expect(text).not.toContain('išlikimo žaidimo suvestinė.');
  });

  it('draws the three screenshots (the files are served by the image: the E2E reads them)', async () => {
    await visibleTournament(true);
    const html = (await guest().get('/help')).html;
    const document = documentOf({
      path: '/help',
      status: 200,
      location: null,
      html,
      setCookies: [],
    });
    expect(document.querySelectorAll('main img')).toHaveLength(3);
  });

  it('says a short standings table is saved (Q5)', async () => {
    const text = textOf((await guest().get('/help')).html);
    expect(text).toContain(
      'Lentelę galima pildyti dalimis - nepilna prognozė taip pat išsaugoma.',
    );
  });
});

describe('/charity (R-52, R-75)', () => {
  it('has the hero, the basketball sentence and the eleven proofs', async () => {
    const page = await guest().get('/charity');
    const text = textOf(page.html);
    expect(text).toContain('Žaidžiame dėl gero tikslo');
    expect(text).toContain('krepšinio prognozių žaidimas');
    expect(text).not.toContain('futbolo');
    expect(text).toContain('7 500€');
    const proofs = documentOf(page).querySelectorAll(
      '[data-testid="charity-proof"]',
    );
    expect(proofs).toHaveLength(11);
    expect(proofs[0]?.getAttribute('href')).toBe(
      '/img/charity/JL_payment_el2025.png',
    );
  });
});

describe('/support and /sponsors (C12, C13)', () => {
  it('redirect permanently: /support to /charity, /sponsors to /', async () => {
    const browser = guest();
    const support = await browser.get('/support');
    expect(support.status).toBe(308);
    expect(support.location).toBe('/charity');
    const sponsors = await browser.get('/sponsors');
    expect(sponsors.status).toBe(308);
    expect(sponsors.location).toBe('/');
  });
});

describe("the shell's links to them", () => {
  it("a guest's rail lists Taisyklės, Pagalba and Jaunimo linija, and the phone bar the Jaunimo linija pill", async () => {
    const document = documentOf(await guest().get('/'));
    for (const href of ['/rules', '/help', '/charity']) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(document.querySelector('a[href="/privacy"]')).toBeNull();
  });

  it("a player's rail lists them too, and the phone menu's Informacija block", async () => {
    const browser = await jonasPlaying(db, client, baseUrl, SOONER);
    const document = documentOf(await browser.get('/main'));
    for (const href of ['/rules', '/help', '/charity']) {
      expect(
        document.querySelectorAll(`a[href="${href}"]`).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
