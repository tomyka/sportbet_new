import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// "Perskaičiuoti taškus" (slice 7c, #21): ResultController::recalculateAllGamePoints, R-65.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PATH = '/admin/recalculateAllGamePoints';

describe('POST /admin/recalculateAllGamePoints', () => {
  it('recalculates, then the results page says so once', async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'results-manager',
    );
    await savePlaying(db, client, CLOSED);
    const page = await browser.post(PATH, new FormData());
    expect(page.status).toBe(303);
    expect(page.location).toBe('/admin/results');
    const shown = await browser.get('/admin/results');
    expect(shown.html).toContain('Visi taškų rezultatai perskaičiuoti.');
    expect((await browser.get('/admin/results')).html).not.toContain(
      'Visi taškų rezultatai perskaičiuoti.',
    );
  });

  it('a player is sent home; another site is refused', async () => {
    const player = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    const refused = await player.post(PATH, new FormData());
    expect(refused.status).toBe(303);
    expect(refused.location).toBe('/');
    await client.query(
      "update player_settings set role = 'superadmin' where player_id = 1",
    );
    const crossSite = await player.post(PATH, new FormData(), {
      origin: 'https://evil.example',
    });
    expect(crossSite.status).toBe(403);
  });

  it('answers POST only: a GET is 405, and nothing runs', async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'superadmin',
    );
    const page = await browser.get(PATH);
    expect(page.status).toBe(405);
    expect((await browser.get('/admin/results')).html).not.toContain(
      'Visi taškų rezultatai perskaičiuoti.',
    );
  });

  it('"Eigos taškai" is not served (R-65)', async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'superadmin',
    );
    // Posted as sportbet's tile form posts (URL-encoded, the HTML default).
    // A multipart POST to a path with no route Next itself reads as a
    // Server Action it cannot find, a 500, for any unknown path.
    const session = browser.cookie('__Host-sb_session') ?? '';
    const page = await fetch(new URL('/admin/updateStandingPoints', baseUrl), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: browser.origin,
        Cookie: `__Host-sb_session=${session}`,
      },
      body: new URLSearchParams({ x: '1' }),
    });
    expect(page.status).toBe(404);
  });
});
