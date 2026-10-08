import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { signedInBrowser } from '../support/hub';
import { JONAS_ACCOUNT } from '../support/accounts';
import { Browser, documentOf, type Page } from '../support/browser';
import { jonasPlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

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

/** More teams in SOONER's tournament (41), from 413: a table a stage can fill. */
const moreTeams = async (count: number) => {
  for (let index = 0; index < count; index += 1) {
    await client.query(
      'insert into teams (id, tournament_id, name) overriding system value values ($1, 41, $2)',
      [413 + index, `Komanda ${String(413 + index)}`],
    );
  }
};

/** The 422 a conflict or the chain answers: Laravel's, under teamID. */
const conflict = (message: string) => ({
  message,
  errors: { teamID: [message] },
});

const notYours = {
  success: false,
  message: 'Šios prognozės išsaugoti negalima.',
};

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

  it('a ninth play-off tick: "1/4 etape jau pažymėta 8 komandų.", nothing written', async () => {
    const browser = await playing();
    await moreTeams(7);
    for (const team of [411, 412, 413, 414, 415, 416, 417, 418]) {
      expect(
        (await browser.post(SAVE, row(team, { quarterfinal: '1' }))).status,
      ).toBe(200);
    }
    const page = await browser.post(SAVE, row(419, { quarterfinal: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(conflict('1/4 etape jau pažymėta 8 komandų.'));
    expect(
      (await rows()).find((each) => each.team_id === 419)?.play_offs,
    ).toBeNull();
  });

  it('a fifth Final Four tick: "1/2 etape jau pažymėta 4 komandų."', async () => {
    const browser = await playing();
    await moreTeams(3);
    const finalFour = { quarterfinal: '1', semifinal: '1' };
    for (const team of [411, 412, 413, 414]) {
      expect((await browser.post(SAVE, row(team, finalFour))).status).toBe(200);
    }
    const page = await browser.post(SAVE, row(415, finalFour));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(conflict('1/2 etape jau pažymėta 4 komandų.'));
  });

  it('a final place another team holds: "Ši finalo vieta jau užimta kitos komandos."', async () => {
    const browser = await playing();
    const finalist = { quarterfinal: '1', semifinal: '1', final: '1' };
    expect((await browser.post(SAVE, row(411, finalist))).status).toBe(200);
    const page = await browser.post(SAVE, row(412, finalist));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(
      conflict('Ši finalo vieta jau užimta kitos komandos.'),
    );
  });

  it('R-78: a final place without a Final Four tick is refused, nothing written', async () => {
    const browser = await playing();
    const page = await browser.post(
      SAVE,
      row(411, { quarterfinal: '1', semifinal: '0', final: '2' }),
    );
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(
      conflict(
        'Finalo vietą galima nurodyti tik komandai, pažymėtai 1/2 etape.',
      ),
    );
    expect(await rows()).toEqual([]);
  });

  it('a team that is not stored is not yours, nothing written', async () => {
    const browser = await playing();
    const page = await browser.post(SAVE, row(999, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(notYours);
    expect(await rows()).toEqual([]);
  });

  it('issue 255: a stored team of a tournament the player is not in is not yours', async () => {
    const browser = await playing();
    await saveTournamentWithGames(db, LATER);
    const page = await browser.post(SAVE, row(421, { groupPosition: '1' }));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(notYours);
    expect(await rows()).toEqual([]);
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

  it('issue 255: an order whose first team is of a tournament the player is not in is not yours, nothing written', async () => {
    const browser = await playing();
    await saveTournamentWithGames(db, LATER);
    const page = await browser.post(REORDER, order(421, 422));
    expect(page.status).toBe(422);
    expect(json(page)).toEqual(notYours);
    expect(await rows()).toEqual([]);
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

// The spec's guarantee: a box the page offers is never one the save
// refuses. The ladder posts a row's place as last saved (decision 5), so a
// stored place the page shows - sportbet keeps a place 0, and its places
// were never unique - is posted back with every tick.
describe('a tick on a row whose stored place the page shows (QA)', () => {
  const stored = async (places: readonly [number, number]) => {
    const [first, second] = places;
    await client.query(
      'insert into standings_predictions (player_id, team_id, place) values (1, 411, $1), (1, 412, $2)',
      [first, second],
    );
  };

  it.each([
    ['a stored place 0', [0, 1], 411, 0],
    ['two rows stored with one place', [1, 1], 411, 1],
    ['a stored place past the table', [1, 3], 412, 3],
  ] as const)(
    '%s: the tick the page offers, posted with that place, is saved',
    async (_case, places, team, place) => {
      const browser = await playing();
      await stored(places);
      const document = documentOf(await browser.get(PAGE));
      const box = document.querySelector(
        `[data-testid="ladder-row"][data-team="${String(team)}"] input[aria-label^="1/4: "]`,
      );
      expect(box).not.toBeNull();
      expect(box?.hasAttribute('disabled')).toBe(false);
      const page = await browser.post(
        SAVE,
        row(team, { groupPosition: String(place), quarterfinal: '1' }),
      );
      expect(json(page)).toEqual({ success: true });
    },
  );
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
