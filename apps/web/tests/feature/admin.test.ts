import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { savePlaying } from '../support/predictions';
import { CLOSED } from '../support/registration';

// The admin gate (slice 7a, #21): AdminMiddleware for R-26 (amended),
// against the built app.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PAGES = ['/admin/index', '/admin/results', '/admin/resultsAll'];

describe('the admin pages (R-26 amended)', () => {
  it.each(PAGES)('a guest opening %s goes home (decision 2)', async (path) => {
    const page = await new Browser(baseUrl, '192.0.2.90').get(path);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it.each(PAGES)('a player opening %s goes home', async (path) => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, 'player');
    const page = await browser.get(path);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it.each([
    ['results-manager', '/admin/index'],
    ['superadmin', '/admin/results'],
    ['results-manager', '/admin/resultsAll'],
  ] as const)('a %s opens %s', async (role, path) => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, role);
    await savePlaying(db, client, CLOSED);
    const page = await browser.get(path);
    expect(page.status).toBe(200);
  });

  it('the role is read on every request: a manager demoted meanwhile goes home', async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'results-manager',
    );
    expect((await browser.get('/admin/index')).status).toBe(200);
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    const page = await browser.get('/admin/index');
    expect(page.status).toBe(307);
  });

  it('"Visi rezultatai" lists the open tournament\'s games, with their names', async () => {
    const browser = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'superadmin',
    );
    await savePlaying(db, client, CLOSED);
    const page = await browser.get('/admin/resultsAll');
    expect(page.status).toBe(200);
    expect(page.html).toContain('Rungtynės');
  });

  it('the shell links an admin to /admin and a player not', async () => {
    const admin = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'superadmin',
    );
    expect((await admin.get('/')).html).toContain('href="/admin/index"');
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    expect((await admin.get('/')).html).not.toContain('href="/admin/index"');
  });

  it("/admin redirects to the dashboard at /admin/index, as sportbet's route 'admin' does (302, anyone)", async () => {
    const guest = await new Browser(baseUrl, '192.0.2.92').get('/admin');
    expect(guest.status).toBe(302);
    expect(guest.location).toBe('/admin/index');
    const admin = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'superadmin',
    );
    const page = await admin.get('/admin');
    expect(page.location).toBe('/admin/index');
    expect((await admin.get(page.location ?? '')).status).toBe(200);
  });
});
