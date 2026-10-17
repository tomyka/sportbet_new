import { insertTournaments } from '@sportbet/db/tournament';
import { insertTournamentPlayer, useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT } from '../support/accounts';
import { formOf, followed, said } from '../support/admin';
import { Browser, documentOf, type Page } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import { EUROLEAGUE_2026_27 } from '../support/tournaments';

// Slice 15 (#32): /admin/import, its preview and its save against the built
// app, which reads sportbet's fixture and never the live feed: each route's
// gate (R-26 amended), the preview that writes nothing, the save under R-93,
// R-110 and the two throttles. The plan's every case is the db's tests'.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

/** A fingerprint that is a SHA-256 in hex and no plan's. */
const STALE = 'a'.repeat(64);

/** Jonas, as `role`, playing the one tournament, which is empty: no team, round or game. */
async function admin(role: 'superadmin' | 'results-manager' | 'player') {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, { role });
  await insertTournaments(db, [EUROLEAGUE_2026_27]);
  await withProfile(db, EUROLEAGUE_2026_27.slug, ACTIVE_PROFILE);
  await insertTournamentPlayer(client, { tournament: 1, player: 1 });
  return browser;
}

const count = async (table: string): Promise<number> =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as n from ${table}`)).rows,
    )[0]?.n ?? -1;

/** What the import writes, counted: nothing but these. */
const written = async () => ({
  teams: await count('teams'),
  rounds: await count('rounds'),
  games: await count('games'),
  predictions: await count('match_predictions'),
});

const NOTHING = { teams: 0, rounds: 0, games: 0, predictions: 0 };

/** The fingerprint the preview page carries in its import form. */
function fingerprintOf(page: Page): string {
  const input = documentOf(page).querySelector('input[name="fingerprint"]');
  const value = input?.getAttribute('value');
  if (value === null || value === undefined) {
    throw new Error(`no fingerprint on ${page.path}`);
  }
  return value;
}

const PREVIEW = '/admin/import/preview?season=E2026';

describe('the gates (R-26 amended)', () => {
  it.each(['/admin/import', PREVIEW])(
    '%s: a guest, a player and a results manager go home; a superadmin is let in',
    async (path) => {
      expect(
        (await new Browser(baseUrl, '192.0.2.70').get(path)).location,
      ).toBe('/');
      for (const role of ['player', 'results-manager'] as const) {
        const page = await (await admin(role)).get(path);
        expect([page.status, page.location]).toEqual([307, '/']);
      }
      expect((await (await admin('superadmin')).get(path)).status).toBe(200);
    },
  );

  it('POST /admin/import/save: a guest, a player and a results manager are sent home with a 303, and nothing is written', async () => {
    const form = formOf({ season: 'E2026', fingerprint: STALE });
    const guest = await new Browser(baseUrl, '192.0.2.71').post(
      '/admin/import/save',
      form,
    );
    expect([guest.status, guest.location]).toEqual([303, '/']);
    for (const role of ['player', 'results-manager'] as const) {
      const page = await (await admin(role)).post('/admin/import/save', form);
      expect([page.status, page.location]).toEqual([303, '/']);
    }
    expect(await written()).toEqual(NOTHING);
  });

  it('POST /admin/import/save: from another site is a 403, whoever is signed in (#16)', async () => {
    const page = await (
      await admin('superadmin')
    ).post(
      '/admin/import/save',
      formOf({ season: 'E2026', fingerprint: STALE }),
      { origin: 'https://evil.example' },
    );
    expect(page.status).toBe(403);
    expect(await written()).toEqual(NOTHING);
  });
});

describe('/admin/import', () => {
  it('heads with the tournament it writes into and asks for a season, E2026 first, previewing by GET', async () => {
    const page = await (await admin('superadmin')).get('/admin/import');
    const text = said(page);
    expect(text).toContain('Tvarkaraščio importas');
    expect(text).toContain('Turnyras: Euroleague 2026/27');
    const season = documentOf(page).querySelector('input[name="season"]');
    expect(season?.getAttribute('value')).toBe('E2026');
    expect(season?.closest('form')?.getAttribute('action')).toBe(
      '/admin/import/preview',
    );
    expect(season?.closest('form')?.getAttribute('method')).toBe('get');
  });

  it('the admin index offers it to a superadmin only', async () => {
    const boss = await (await admin('superadmin')).get('/admin/index');
    expect(said(boss)).toContain('Tvarkaraščio importas');
    const manager = await (await admin('results-manager')).get('/admin/index');
    expect(said(manager)).not.toContain('Tvarkaraščio importas');
  });
});

describe('the preview', () => {
  it('lists what the fixture would bring into the empty tournament, and writes nothing', async () => {
    const page = await (await admin('superadmin')).get(PREVIEW);
    expect(page.status).toBe(200);
    const text = said(page).replace(/\s+:/g, ':');
    expect(text).toContain('Ką padarys importas');
    expect(text).toContain('Naujos komandos: 20');
    expect(text).toContain('Nauji turai: 2');
    expect(text).toContain('Naujos rungtynės: 20');
    expect(text).toContain('Perkeltos rungtynės: 0');
    expect(text).toContain('Žaidėjai, kuriems bus sukurtos spėjimų eilutės: 1');
    expect(text).not.toContain('Viskas jau atnaujinta');
    expect(fingerprintOf(page)).toMatch(/^[0-9a-f]{64}$/);
    expect(await written()).toEqual(NOTHING);
  });

  it('refuses a season code that is none, with the form, before the feed is read', async () => {
    const browser = await admin('superadmin');
    for (const path of [
      '/admin/import/preview?season=e2026',
      '/admin/import/preview?season=E26',
      '/admin/import/preview',
      '/admin/import/preview?season=E2026&season=E2027',
    ]) {
      const page = await browser.get(path);
      expect(page.status).toBe(200);
      expect(said(page)).toContain('Netinkamas sezono kodas.');
      expect(said(page)).not.toContain('Ką padarys importas');
    }
  });

  it('is refused for a finished tournament (R-110)', async () => {
    const browser = await admin('superadmin');
    await client.query("update tournaments set ends_on = '2020-01-01'");
    const page = await browser.get(PREVIEW);
    expect(said(page)).toContain('Turnyras baigtas - keisti negalima.');
    expect(said(page)).not.toContain('Ką padarys importas');
  });

  it('is limited to 10 an account a minute (importPreviewLimits)', async () => {
    const browser = await admin('superadmin');
    for (let tried = 0; tried < 10; tried += 1) {
      expect(said(await browser.get(PREVIEW))).toContain('Ką padarys importas');
    }
    const eleventh = await browser.get(PREVIEW);
    expect(said(eleventh)).toContain('Per daug bandymų.');
    expect(said(eleventh)).not.toContain('Ką padarys importas');
    // A code that is none costs nothing: it is refused before the count.
    expect(said(await browser.get('/admin/import/preview?season=x'))).toContain(
      'Netinkamas sezono kodas.',
    );
  });
});

describe('the save', () => {
  it('imports the plan the admin previewed, says what it did, and a second preview has nothing to change', async () => {
    const browser = await admin('superadmin');
    const previewed = await browser.get(PREVIEW);
    const posted = await browser.post(
      '/admin/import/save',
      formOf({ season: 'E2026', fingerprint: fingerprintOf(previewed) }),
    );
    expect([posted.status, posted.location]).toEqual([303, '/admin/import']);
    expect(said(await followed(browser, posted))).toContain(
      'Importuota: 20 komandų, 2 turų, 20 naujų rungtynių, 0 perkeltų, 0 neperkeltų. Spėjimų eilutės sukurtos 1 žaidėjams.',
    );
    expect(await written()).toEqual({
      teams: 20,
      rounds: 2,
      games: 20,
      predictions: 20,
    });
    expect(
      await count(
        "rounds where name in ('1 turas', '2 turas') and stage = 'regular' and rate = 1 and survival and not knockout",
      ),
    ).toBe(2);

    const again = await browser.get(PREVIEW);
    expect(said(again)).toContain(
      'Viskas jau atnaujinta - nieko keisti nereikia.',
    );
    expect(
      documentOf(again)
        .querySelector('form[action="/admin/import/save"] button')
        ?.hasAttribute('disabled'),
    ).toBe(true);
  });

  it('sends a plan that changed since the preview back to the preview, with its message (R-93), writing nothing', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/import/save',
      formOf({ season: 'E2026', fingerprint: STALE }),
    );
    expect([posted.status, posted.location]).toEqual([303, PREVIEW]);
    const fresh = await followed(browser, posted);
    expect(said(fresh)).toContain(
      'Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite dar kartą.',
    );
    expect(said(fresh)).toContain('Ką padarys importas');
    expect(await written()).toEqual(NOTHING);
  });

  it('refuses a season code that is none, and a fingerprint that is no SHA-256, before counting or fetching', async () => {
    const browser = await admin('superadmin');
    const badSeason = await browser.post(
      '/admin/import/save',
      formOf({ season: 'x', fingerprint: STALE }),
    );
    expect([badSeason.status, badSeason.location]).toEqual([
      303,
      '/admin/import',
    ]);
    expect(said(await followed(browser, badSeason))).toContain(
      'Netinkamas sezono kodas.',
    );
    const badFingerprint = await browser.post(
      '/admin/import/save',
      formOf({ season: 'E2026', fingerprint: 'nope' }),
    );
    expect(badFingerprint.location).toBe(PREVIEW);
    expect(await written()).toEqual(NOTHING);
  });

  it('is refused for a finished tournament (R-110), writing nothing', async () => {
    const browser = await admin('superadmin');
    const previewed = await browser.get(PREVIEW);
    await client.query("update tournaments set ends_on = '2020-01-01'");
    const posted = await browser.post(
      '/admin/import/save',
      formOf({ season: 'E2026', fingerprint: fingerprintOf(previewed) }),
    );
    expect(posted.location).toBe('/admin/import');
    expect(said(await followed(browser, posted))).toContain(
      'Turnyras baigtas - keisti negalima.',
    );
    expect(await written()).toEqual(NOTHING);
  });

  it('is limited to 60 an account a minute (adminWriteLimits)', async () => {
    const browser = await admin('superadmin');
    const form = () => formOf({ season: 'E2026', fingerprint: STALE });
    for (let tried = 0; tried < 60; tried += 1) {
      expect((await browser.post('/admin/import/save', form())).location).toBe(
        PREVIEW,
      );
    }
    const sixtyFirst = await browser.post('/admin/import/save', form());
    expect(sixtyFirst.location).toBe('/admin/import');
    expect(said(await followed(browser, sixtyFirst))).toContain(
      'Per daug bandymų.',
    );
  });
});
