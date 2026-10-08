import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { signedInBrowser } from '../support/hub';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { jonasPlaying } from '../support/predictions';
import { CLOSED, SOONER } from '../support/registration';

// Slice 9 (#23): the standings ladder at sportbet's URL, its row save
// (updatePredictionStandingsUser, at /prediction/standings/save - Next
// serves no page and handler at one path) and its reorder
// (reorderPredictionStandingsUser), against the built app. SOONER's teams
// are 411 and 412, its deadline 40 days off; CLOSED's 431 and 432, its
// deadline passed yesterday.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const PAGE = '/prediction/standings';
const SAVE = '/prediction/standings/save';
const REORDER = '/prediction/standings/reorder';

const json = (page: Page): unknown => JSON.parse(page.html);

const row = (team: number, fields: Readonly<Record<string, string>> = {}) => {
  const body = new FormData();
  body.set('teamID', String(team));
  for (const [name, value] of Object.entries({
    groupPosition: '',
    quarterfinal: '',
    semifinal: '',
    final: '',
    ...fields,
  })) {
    body.set(name, value);
  }
  return body;
};

const order = (...teams: readonly number[]) => {
  const body = new FormData();
  for (const team of teams) body.append('order[]', String(team));
  return body;
};

const rows = async () =>
  z
    .array(
      z.object({
        team_id: z.int(),
        place: z.int().nullable(),
        play_offs: z.boolean().nullable(),
        final_four: z.boolean().nullable(),
      }),
    )
    .parse(
      (
        await client.query(
          'select team_id, place, play_offs, final_four from standings_predictions where player_id = 1 order by team_id',
        )
      ).rows,
    );

const playing = (plan = SOONER) => jonasPlaying(db, client, baseUrl, plan);

describe('POST /prediction/standings/save (updatePredictionStandingsUser)', () => {
  it('saved: 200 {success: true}, the row written and the rest seeded blank', async () => {
    const browser = await playing();
    const page = await browser.post(
      SAVE,
      row(411, { groupPosition: '1', quarterfinal: '1', semifinal: '0' }),
    );
    expect(page.status).toBe(200);
    expect(json(page)).toEqual({ success: true });
    expect(await rows()).toEqual([
      { team_id: 411, place: 1, play_offs: true, final_four: false },
      { team_id: 412, place: null, play_offs: null, final_four: null },
    ]);
  });

  it("a field refused: Laravel's 422 under sportbet's name, nothing written", async () => {
    const browser = await playing();
    const page = await browser.post(SAVE, row(411, { final: '3' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Finalo vieta turi būti 1 arba 2.',
      errors: { final: ['Finalo vieta turi būti 1 arba 2.'] },
    });
    expect(await rows()).toEqual([]);
  });

  it('a place past the table: 422 on groupPosition', async () => {
    const browser = await playing();
    const page = await browser.post(SAVE, row(411, { groupPosition: '3' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Tokios vietos lentelėje nėra.',
      errors: { groupPosition: ['Tokios vietos lentelėje nėra.'] },
    });
  });

  it("a place another team holds: 422 under teamID, sportbet's text", async () => {
    const browser = await playing();
    await browser.post(SAVE, row(411, { groupPosition: '1' }));
    const page = await browser.post(SAVE, row(412, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Ši vieta jau užimta kitos komandos.',
      errors: { teamID: ['Ši vieta jau užimta kitos komandos.'] },
    });
  });

  it('R-78: a Final Four tick without a play-off tick is refused', async () => {
    const browser = await playing();
    const page = await browser.post(
      SAVE,
      row(411, { quarterfinal: '0', semifinal: '1' }),
    );
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      message: 'Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.',
      errors: {
        teamID: [
          'Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.',
        ],
      },
    });
  });

  it('after the deadline: "Prognozių laikas baigėsi.", nothing written', async () => {
    const browser = await playing(CLOSED);
    const page = await browser.post(SAVE, row(431, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Prognozių laikas baigėsi.',
    });
    expect((await rows()).some((each) => each.place !== null)).toBe(false);
  });

  it("issue 255: another tournament's team is not yours", async () => {
    const browser = await playing();
    const page = await browser.post(SAVE, row(431, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual({
      success: false,
      message: 'Šios prognozės išsaugoti negalima.',
    });
  });

  it("the 121st save within a minute, rows and orders together, is 429 with the throttle's text", async () => {
    const browser = await playing();
    for (let save = 0; save < 60; save += 1) {
      expect((await browser.post(SAVE, row(411))).status).toBe(200);
      expect((await browser.post(REORDER, order(411, 412))).status).toBe(200);
    }
    const page = await browser.post(SAVE, row(411, { quarterfinal: '1' }));
    expect(page.status).toBe(429);
    expect(json(page)).toEqual({
      success: false,
      message: 'Per daug bandymų. Pabandykite dar kartą po 1 min.',
    });
    expect((await rows())[0]?.play_offs).toBeNull();
  }, 60_000);

  it('a save that waits past the 5 s lock_timeout is a 503, not a 500', async () => {
    const browser = await playing();
    await browser.post(SAVE, row(411));
    const holder = await client.connect();
    try {
      await holder.query('begin');
      await holder.query(
        'select 1 from standings_predictions where player_id = 1 for update',
      );
      const page = await browser.post(SAVE, row(411, { groupPosition: '1' }));
      expect(page.status).toBe(503);
      expect(json(page)).toEqual({
        success: false,
        message: 'Spėjimas neišsaugotas. Bandykite dar kartą.',
      });
      await holder.query('commit');
    } finally {
      holder.release();
    }
  }, 30_000);

  it('a guest gets 401 {"message":"Unauthenticated."}; another site 403, nothing written', async () => {
    const guest = await new Browser(baseUrl, '192.0.2.90').post(SAVE, row(411));
    expect(guest.status).toBe(401);
    expect(json(guest)).toEqual({ message: 'Unauthenticated.' });
    const browser = await playing();
    const crossSite = await browser.post(
      SAVE,
      row(411, { groupPosition: '1' }),
      {
        origin: 'https://evil.example',
      },
    );
    expect(crossSite.status).toBe(403);
    expect(await rows()).toEqual([]);
  });
});

describe('POST /prediction/standings/reorder (reorderPredictionStandingsUser)', () => {
  it('saved: the places only, ticks untouched', async () => {
    const browser = await playing();
    await browser.post(SAVE, row(411, { quarterfinal: '1' }));
    const page = await browser.post(REORDER, order(412, 411));
    expect(page.status).toBe(200);
    expect(json(page)).toEqual({ success: true });
    expect(await rows()).toEqual([
      { team_id: 411, place: 2, play_offs: true, final_four: null },
      { team_id: 412, place: 1, play_offs: null, final_four: null },
    ]);
  });

  it('not the whole table: "Eilė nesutampa su jūsų lentele."; a repeated team: 422 on order', async () => {
    const browser = await playing();
    const partial = await browser.post(REORDER, order(411));
    expect(partial.status).toBe(422);
    expect(json(partial)).toEqual({
      success: false,
      message: 'Eilė nesutampa su jūsų lentele.',
    });
    const repeated = await browser.post(REORDER, order(411, 411));
    expect(repeated.status).toBe(422);
    expect(json(repeated)).toEqual({
      message: 'Eilė neteisinga.',
      errors: { order: ['Eilė neteisinga.'] },
    });
  });

  it('after the deadline: "Prognozių laikas baigėsi."', async () => {
    const browser = await playing(CLOSED);
    const page = await browser.post(REORDER, order(432, 431));
    expect(json(page)).toEqual({
      success: false,
      message: 'Prognozių laikas baigėsi.',
    });
  });

  it('a guest gets 401; another site 403', async () => {
    const guest = await new Browser(baseUrl, '192.0.2.91').post(
      REORDER,
      order(411, 412),
    );
    expect(guest.status).toBe(401);
    const browser = await playing();
    const crossSite = await browser.post(REORDER, order(412, 411), {
      origin: 'https://evil.example',
    });
    expect(crossSite.status).toBe(403);
    expect(await rows()).toEqual([]);
  });
});

describe('GET /prediction/standings (getPredictionStandingsUser)', () => {
  it('a guest is sent to sign in, to come back here', async () => {
    const page = await new Browser(baseUrl, '192.0.2.92').get(PAGE);
    expect(page.status).toBe(307);
    expect(page.location).toBe(
      `/login?intended=${encodeURIComponent('/prediction/standings')}`,
    );
  });

  it('a player in no tournament goes to the front page', async () => {
    const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT);
    const page = await browser.get(PAGE);
    expect(page.status).toBe(307);
    expect(page.location).toBe('/');
  });

  it('a player: the ladder, "Išsaugoti šią tvarką" (R-79) and when it closes (R-80); "Eiga" in the navigation', async () => {
    const browser = await playing();
    const document = documentOf(await browser.get(PAGE));
    const ladder = document.querySelectorAll('[data-testid="ladder-row"]');
    expect(ladder).toHaveLength(2);
    for (const each of ladder) {
      expect(each.getAttribute('draggable')).toBe('true');
    }
    expect(document.body.textContent).toContain('Išsaugoti šią tvarką');
    expect(document.body.textContent).toContain('Prognozės užsidaro');
    expect(
      document.querySelector('a[href="/prediction/standings"]')?.textContent,
    ).toContain('Eiga');
  });

  it('closed: "Prognozės uždarytos.", every control disabled, nothing draggable', async () => {
    const browser = await playing(CLOSED);
    const document = documentOf(await browser.get(PAGE));
    expect(document.body.textContent).toContain('Prognozės uždarytos.');
    const ladder = document.querySelectorAll('[data-testid="ladder-row"]');
    expect(ladder).toHaveLength(2);
    for (const each of ladder) {
      expect(each.getAttribute('draggable')).not.toBe('true');
      for (const control of each.querySelectorAll('input, button')) {
        expect(control.hasAttribute('disabled')).toBe(true);
      }
    }
    expect(document.body.textContent).not.toContain('Išsaugoti šią tvarką');
  });
});
