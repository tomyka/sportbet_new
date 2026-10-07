import { insertTournaments } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf } from '../support/browser';
import { ACTIVE_PROFILE, signedInBrowser, withProfile } from '../support/hub';
import { saveTournamentWithGames, SOONER } from '../support/registration';
import { EUROLEAGUE_2025_26 } from '../support/tournaments';

// TournamentController::hub for a signed-in player, and R-50, against
// the built app.

const baseUrl = inject('baseUrl');
const { db } = useTestDatabase();

describe('the hub, signed in', () => {
  it('offers a tournament still taking players its registration link, and a guest no button', async () => {
    await saveTournamentWithGames(db, SOONER);
    await withProfile(db, SOONER.tournament.slug, ACTIVE_PROFILE);
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const signedIn = documentOf(await browser.get('/'));
    expect(
      signedIn.querySelector(
        `a[href="/tournament/${SOONER.tournament.slug}/register"]`,
      )?.textContent,
    ).toBe('Registruotis į turnyrą →');
    const guest = documentOf(await new Browser(baseUrl, '192.0.2.41').get('/'));
    expect(
      guest.querySelector(
        `a[href="/tournament/${SOONER.tournament.slug}/register"]`,
      ),
    ).toBeNull();
  });

  it('leaves out a non-public tournament for a player not in it, and shows it to an admin (R-50)', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    await withProfile(db, EUROLEAGUE_2025_26.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    const player = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    expect((await player.get('/')).html).not.toContain('Euroleague 2025/26');
    const admin = await signedInBrowser(
      db,
      baseUrl,
      JONAS_ACCOUNT,
      'results-manager',
      '192.0.2.42',
    );
    expect((await admin.get('/')).html).toContain('Euroleague 2025/26');
  });
});
