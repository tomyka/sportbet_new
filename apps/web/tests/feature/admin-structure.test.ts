import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { JONAS_ACCOUNT, ZUKAUSKAS_ACCOUNT } from '../support/accounts';
import { formOf, followed, said, SUPERADMIN_POSTS } from '../support/admin';
import { Browser } from '../support/browser';
import { signedInBrowser } from '../support/hub';
import { gamesOf, savePlaying } from '../support/predictions';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  SOONER,
} from '../support/registration';

// Slice 13 (#30): /admin/tournaments, /admin/events, /admin/games and
// /admin/teams against the built app: each route's gate (R-26 amended), its
// 303 and message, and what it wrote. The confirmed delete is
// admin-confirm.test.ts's.

const baseUrl = inject('baseUrl');
const { db, client } = useTestDatabase();

const [SOONER_ROUND_1, SOONER_ROUND_5] = [411, 415];
const [SOONER_GAME_1] = gamesOf(SOONER);
const [CLOSED_GAME_1] = gamesOf(CLOSED);

/** Jonas, who plays SOONER (so it is the tournament he works on), as `role`. */
async function admin(role: 'superadmin' | 'results-manager' | 'player') {
  const browser = await signedInBrowser(db, baseUrl, JONAS_ACCOUNT, { role });
  await savePlaying(db, client, SOONER);
  return browser;
}

/** R-21: the end date passed and every game scored. */
const finishTournament41 = async (): Promise<void> => {
  await client.query(
    "update games set tip_off = date_trunc('second', now() - interval '10 days'), home_score = 80, away_score = 70 where tournament_id = 41",
  );
  await client.query(
    "update tournaments set ends_on = '2020-01-01' where id = 41",
  );
};

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  z
    .array(z.object({ n: z.int() }))
    .parse((await client.query(sql, params)).rows)[0]?.n ?? -1;

describe('the gates (R-26 amended)', () => {
  it.each([
    '/admin/tournaments',
    '/admin/tournaments/create',
    '/admin/tournaments/41/edit',
    '/admin/events',
    '/admin/games',
    '/admin/teaminsert',
  ])(
    '%s: a guest, a player and a results manager go home; a superadmin is let in',
    async (path) => {
      expect(
        (await new Browser(baseUrl, '192.0.2.60').get(path)).location,
      ).toBe('/');
      for (const role of ['player', 'results-manager'] as const) {
        const page = await (await admin(role)).get(path);
        expect([page.status, page.location]).toEqual([307, '/']);
      }
      expect((await (await admin('superadmin')).get(path)).status).toBe(200);
    },
  );

  it('/admin/teams: a guest and a player go home; a results manager and a superadmin are let in (the standings facts, R-26)', async () => {
    expect(
      (await new Browser(baseUrl, '192.0.2.61').get('/admin/teams')).location,
    ).toBe('/');
    expect((await (await admin('player')).get('/admin/teams')).location).toBe(
      '/',
    );
    for (const role of ['results-manager', 'superadmin'] as const) {
      expect((await (await admin(role)).get('/admin/teams')).status).toBe(200);
    }
  });

  it.each(SUPERADMIN_POSTS)(
    'POST %s: a guest, a player and a results manager are sent home with a 303, and nothing is written',
    async (path) => {
      const guest = await new Browser(baseUrl, '192.0.2.62').post(
        path,
        formOf({}),
      );
      expect([guest.status, guest.location]).toEqual([303, '/']);
      for (const role of ['player', 'results-manager'] as const) {
        const page = await (await admin(role)).post(path, formOf({}));
        expect([page.status, page.location]).toEqual([303, '/']);
      }
      expect(await count('select count(*)::int as n from tournaments')).toBe(1);
    },
  );

  it.each([...SUPERADMIN_POSTS, '/admin/teams/save', '/admin/confirm/save'])(
    'POST %s: from another site is a 403, whoever is signed in (#16)',
    async (path) => {
      const browser = await admin('superadmin');
      const page = await browser.post(path, formOf({}), {
        origin: 'https://evil.example',
      });
      expect(page.status).toBe(403);
    },
  );

  it('the role is read on every request: a superadmin demoted meanwhile is sent home', async () => {
    const browser = await admin('superadmin');
    expect((await browser.get('/admin/events')).status).toBe(200);
    await client.query(
      "update player_settings set role = 'player' where player_id = 1",
    );
    expect((await browser.get('/admin/events')).location).toBe('/');
    const page = await browser.post('/admin/eventInsert', formOf({}));
    expect(page.location).toBe('/');
  });
});

describe('/admin/tournaments (adminStore, adminUpdate, adminEnterContext)', () => {
  const NEW = {
    name: 'Euroleague 2028/29',
    slug: 'euroleague-2028-29',
    status: 'upcoming',
    standings_deadline_round: '',
    start_date: '2028-10-01',
    end_date: '2029-05-30',
    description: '',
    is_public: '1',
  };

  it('lists every tournament, with its name and slug', async () => {
    const page = await (await admin('superadmin')).get('/admin/tournaments');
    expect(said(page)).toContain('Euroleague 2026/27');
    expect(said(page)).toContain('euroleague-2026-27');
  });

  it('creates one with its public league, and says so on the list', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post('/admin/tournaments/save', formOf(NEW));
    expect([posted.status, posted.location]).toEqual([
      303,
      '/admin/tournaments',
    ]);
    expect(said(await followed(browser, posted))).toContain(
      'Turnyras sukurtas.',
    );
    expect(
      await count(
        "select count(*)::int as n from leagues l join tournaments t on t.id = l.tournament_id where t.slug = 'euroleague-2028-29' and l.is_public",
      ),
    ).toBe(1);
  });

  it('refuses a slug another tournament holds, writing nothing', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/tournaments/save',
      formOf({ ...NEW, slug: 'euroleague-2026-27' }),
    );
    expect(posted.location).toBe('/admin/tournaments/create');
    expect(said(await followed(browser, posted))).toContain(
      'Toks slug jau užimtas.',
    );
    expect(await count('select count(*)::int as n from tournaments')).toBe(1);
  });

  it('lists every refused field, as Laravel does', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/tournaments/save',
      formOf({ ...NEW, name: '', slug: 'Bad Slug', end_date: '2020-01-01' }),
    );
    const text = said(await followed(browser, posted));
    expect(text).toContain('Pavadinimas: privalomas laukas');
    expect(text).toContain('Slug (URL): leidžiamos tik mažosios raidės');
    expect(text).toContain('Pabaiga: pabaigos data negali būti ankstesnė');
    expect(await count('select count(*)::int as n from tournaments')).toBe(1);
  });

  it('offers a stored tournament for editing, and 404 for one that is none', async () => {
    const browser = await admin('superadmin');
    const page = await browser.get('/admin/tournaments/41/edit');
    expect(page.html).toContain('value="Euroleague 2026/27"');
    expect((await browser.get('/admin/tournaments/9999/edit')).status).toBe(
      404,
    );
    expect((await browser.get('/admin/tournaments/abc/edit')).status).toBe(404);
  });

  it('updates the name and dates', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/tournaments/41',
      formOf({
        ...NEW,
        name: 'Euroleague 2026/27 (nauja)',
        slug: 'euroleague-2026-27',
      }),
    );
    expect(posted.location).toBe('/admin/tournaments');
    expect(said(await followed(browser, posted))).toContain(
      'Turnyras atnaujintas.',
    );
    expect(
      await count(
        "select count(*)::int as n from tournaments where name = 'Euroleague 2026/27 (nauja)' and ends_on = '2029-05-30'",
      ),
    ).toBe(1);
  });

  it('R-110: a finished tournament keeps its end date, survival and deadline round, and still takes a new name', async () => {
    const browser = await admin('superadmin');
    await finishTournament41();
    const same = {
      ...NEW,
      slug: 'euroleague-2026-27',
      end_date: '2020-01-01',
      start_date: '2019-10-01',
      survival_game: '1',
    };
    const refused = await browser.post(
      '/admin/tournaments/41',
      formOf({ ...same, end_date: '2021-01-01' }),
    );
    expect(said(await followed(browser, refused))).toContain(
      'Turnyras baigtas - keisti negalima.',
    );
    const renamed = await browser.post(
      '/admin/tournaments/41',
      formOf({ ...same, name: 'Pervadinta' }),
    );
    expect(said(await followed(browser, renamed))).toContain(
      'Turnyras atnaujintas.',
    );
  });

  it('"Dirbti šiame turnyre" stores the choice with the account and names it on the dashboard', async () => {
    const browser = await admin('superadmin');
    await browser.post('/admin/tournaments/save', formOf(NEW));
    const id = await count(
      "select id as n from tournaments where slug = 'euroleague-2028-29'",
    );
    const posted = await browser.post(
      `/admin/tournaments/${String(id)}/context`,
      formOf({}),
    );
    expect(posted.location).toBe('/admin/index');
    expect(said(await followed(browser, posted))).toContain(
      'Turnyro kontekstas: Euroleague 2028/29',
    );
    expect(
      await count(
        'select admin_tournament_id as n from player_settings where player_id = 1',
      ),
    ).toBe(id);
    expect(said(await browser.get('/admin/events'))).toContain(
      'Turnyras: Euroleague 2028/29',
    );
    expect(
      (await browser.post('/admin/tournaments/9999/context', formOf({})))
        .status,
    ).toBe(404);
  });
});

describe('/admin/events (insertEvent, updateEvent)', () => {
  const ROUND = {
    event: '6 turas',
    eventDay: '6',
    stage: 'regular',
    rate: '1',
  };

  it("lists the working tournament's rounds under its name", async () => {
    const page = await (await admin('superadmin')).get('/admin/events');
    const text = said(page);
    expect(text).toContain('Turnyras: Euroleague 2026/27');
    expect(page.html).toContain('value="1 turas"');
    expect(page.html).toContain('value="5 turas"');
  });

  it('adds a round', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post('/admin/eventInsert', formOf(ROUND));
    expect(posted.location).toBe('/admin/events');
    expect(said(await followed(browser, posted))).toContain('Turas pridėtas.');
    expect(
      await count(
        'select count(*)::int as n from rounds where tournament_id = 41',
      ),
    ).toBe(3);
  });

  it('refuses a day the tournament already has, and lists a refused form field by field', async () => {
    const browser = await admin('superadmin');
    const duplicate = await browser.post(
      '/admin/eventInsert',
      formOf({ ...ROUND, eventDay: '5' }),
    );
    expect(said(await followed(browser, duplicate))).toContain(
      'Turas su tokia diena šiame turnyre jau yra.',
    );
    const invalid = await browser.post(
      '/admin/eventInsert',
      formOf({ event: '', eventDay: 'x', stage: 'regular', rate: '' }),
    );
    const text = said(await followed(browser, invalid));
    expect(text).toContain('Turo pavadinimas: privalomas laukas');
    expect(text).toContain('Turo diena: turi būti sveikasis skaičius');
    expect(text).toContain('Koeficientas: privalomas laukas');
    expect(
      await count(
        'select count(*)::int as n from rounds where tournament_id = 41',
      ),
    ).toBe(2);
  });

  it("changes a round's rate, which recalculates", async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/events/save',
      formOf({
        eventID: String(SOONER_ROUND_1),
        event: '1 turas',
        eventDay: '1',
        stage: 'play-offs',
        rate: '2',
      }),
    );
    expect(said(await followed(browser, posted))).toContain(
      'Turas atnaujintas.',
    );
    expect(
      await count(
        `select rate as n from rounds where id = ${String(SOONER_ROUND_1)}`,
      ),
    ).toBe(2);
  });

  it('deletes a round with no game, keeps one with games, and says so', async () => {
    const browser = await admin('superadmin');
    await browser.post('/admin/eventInsert', formOf(ROUND));
    const fresh = await count(
      "select id as n from rounds where tournament_id = 41 and name = '6 turas'",
    );
    const deleted = await browser.post(
      '/admin/events/save',
      formOf({ eventID: String(fresh), delete: '1' }),
    );
    expect(said(await followed(browser, deleted))).toContain(
      'Turas ištrintas.',
    );
    const kept = await browser.post(
      '/admin/events/save',
      formOf({ eventID: String(SOONER_ROUND_5), delete: '1' }),
    );
    expect(said(await followed(browser, kept))).toContain(
      'Turo, kuriame yra rungtynių, ištrinti negalima.',
    );
    expect(
      await count(
        'select count(*)::int as n from rounds where tournament_id = 41',
      ),
    ).toBe(2);
  });

  it('answers 404 for a round id that is unreadable, and says so for one of another tournament', async () => {
    const browser = await admin('superadmin');
    await saveTournamentWithGames(db, LATER);
    expect(
      (await browser.post('/admin/events/save', formOf({ eventID: 'x' })))
        .status,
    ).toBe(404);
    const other = await browser.post(
      '/admin/events/save',
      formOf({ eventID: '421', ...ROUND }),
    );
    expect(said(await followed(browser, other))).toContain(
      'Tokio turo šiame turnyre nėra.',
    );
  });

  it('with no tournament to work on, says so and writes nothing', async () => {
    await saveTournamentWithGames(db, SOONER);
    const browser = await signedInBrowser(db, baseUrl, ZUKAUSKAS_ACCOUNT, {
      role: 'superadmin',
      ip: '192.0.2.63',
    });
    expect(said(await browser.get('/admin/events'))).toContain(
      'Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.',
    );
    const posted = await browser.post('/admin/eventInsert', formOf(ROUND));
    expect(said(await followed(browser, posted))).toContain(
      'Nepasirinktas turnyras.',
    );
    expect(await count('select count(*)::int as n from rounds')).toBe(2);
  });

  it('R-110: a finished tournament takes no round', async () => {
    const browser = await admin('superadmin');
    await finishTournament41();
    const posted = await browser.post('/admin/eventInsert', formOf(ROUND));
    expect(said(await followed(browser, posted))).toContain(
      'Turnyras baigtas - keisti negalima.',
    );
  });
});

describe('/admin/games (insertGame, updateGame)', () => {
  const GAME = {
    gameDateTime: '2026-12-01T20:00',
    homeTeamID: '412',
    awayTeamID: '411',
    eventID: String(SOONER_ROUND_1),
  };

  it("lists the working tournament's games with their team names", async () => {
    const page = await (await admin('superadmin')).get('/admin/games');
    const text = said(page);
    expect(text).toContain('Turnyras: Euroleague 2026/27');
    expect(text).toContain('Home 41');
    expect(text).toContain('Away 41');
  });

  it('adds a game at the typed Vilnius time, saved as UTC, and gives every player a blank row; no odds row is made', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post('/admin/insertGame', formOf(GAME));
    expect(posted.location).toBe('/admin/games');
    const id = await count(
      'select max(id) as n from games where tournament_id = 41',
    );
    expect(said(await followed(browser, posted))).toContain(
      `Žaidimas #${String(id)} pridėtas.`,
    );
    expect(
      await count(
        "select count(*)::int as n from games where id = $1 and tip_off = '2026-12-01T18:00:00Z'",
        id,
      ),
    ).toBe(1);
    expect(
      await count(
        'select count(*)::int as n from match_predictions where game_id = $1 and player_id = 1',
        id,
      ),
    ).toBe(1);
    expect(
      await count(
        'select count(*)::int as n from game_odds where game_id = $1',
        id,
      ),
    ).toBe(0);
  });

  it.each([
    [
      '2027-03-28T03:30',
      'Šis laikas Vilniuje neegzistuoja (laikrodžio persukimas).',
    ],
    [
      '2026-10-25T03:30',
      'Šis laikas Vilniuje dviprasmiškas (laikrodžio persukimas).',
    ],
  ])(
    'R-91: %s is refused in words, and nothing is written',
    async (time, text) => {
      const browser = await admin('superadmin');
      const posted = await browser.post(
        '/admin/insertGame',
        formOf({ ...GAME, gameDateTime: time }),
      );
      expect(said(await followed(browser, posted))).toContain(text);
      expect(
        await count(
          'select count(*)::int as n from games where tournament_id = 41',
        ),
      ).toBe(2);
    },
  );

  it('refuses one team on both sides, a pair the round has, and a team of another tournament', async () => {
    const browser = await admin('superadmin');
    await saveTournamentWithGames(db, LATER);
    const cases = [
      [
        { homeTeamID: '411', awayTeamID: '411' },
        'Šeimininkai ir svečiai turi būti skirtingos komandos.',
      ],
      [
        { homeTeamID: '411', awayTeamID: '412' },
        'Šiame ture šios komandos jau žaidžia viena su kita.',
      ],
      [
        { homeTeamID: '421', awayTeamID: '411' },
        'Komanda ir turas priklauso skirtingiems turnyrams.',
      ],
    ] as const;
    for (const [teams, text] of cases) {
      const posted = await browser.post(
        '/admin/insertGame',
        formOf({ ...GAME, ...teams }),
      );
      expect(said(await followed(browser, posted))).toContain(text);
    }
    expect(
      await count(
        'select count(*)::int as n from games where tournament_id = 41',
      ),
    ).toBe(2);
  });

  it('lists the refused fields of a form, the ids first', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post('/admin/insertGame', formOf({}));
    const text = said(await followed(browser, posted));
    expect(text).toContain('Šeimininkai: privalomas laukas');
    expect(text).toContain('Svečiai: privalomas laukas');
    expect(text).toContain('Etapas: privalomas laukas');
    expect(text).toContain('Data ir laikas: privalomas laukas');
  });

  it('moves a game: its time is rewritten, and the message names it', async () => {
    const browser = await admin('superadmin');
    const posted = await browser.post(
      '/admin/updateGame',
      formOf({
        gameID: String(SOONER_GAME_1),
        ...GAME,
        homeTeamID: '411',
        awayTeamID: '412',
        gameDateTime: '2026-07-01T20:00',
      }),
    );
    expect(said(await followed(browser, posted))).toContain(
      `Žaidimas #${String(SOONER_GAME_1)} atnaujintas.`,
    );
    expect(
      await count(
        `select count(*)::int as n from games where id = ${String(SOONER_GAME_1)} and tip_off = '2026-07-01T17:00:00Z'`,
      ),
    ).toBe(1);
  });

  it('answers 404 for a game that is unreadable or none', async () => {
    const browser = await admin('superadmin');
    for (const gameID of ['x', '99999']) {
      const page = await browser.post(
        '/admin/updateGame',
        formOf({ gameID, ...GAME }),
      );
      expect(page.status).toBe(404);
    }
  });

  it('R-90: a started game with a real prediction keeps its two teams', async () => {
    const browser = await admin('superadmin');
    await savePlaying(db, client, CLOSED);
    await client.query(
      'update match_predictions set home = 80, away = 70 where player_id = 1 and game_id = $1',
      [CLOSED_GAME_1],
    );
    const posted = await browser.post(
      '/admin/updateGame',
      formOf({
        gameID: String(CLOSED_GAME_1),
        gameDateTime: '2026-07-01T20:00',
        homeTeamID: '432',
        awayTeamID: '431',
        eventID: '431',
      }),
    );
    expect(said(await followed(browser, posted))).toContain(
      'Pradėtų rungtynių, kurias jau spėjo žaidėjai, komandų keisti negalima.',
    );
  });

  it('R-110: a finished tournament takes no game', async () => {
    const browser = await admin('superadmin');
    await finishTournament41();
    const posted = await browser.post('/admin/insertGame', formOf(GAME));
    expect(said(await followed(browser, posted))).toContain(
      'Turnyras baigtas - keisti negalima.',
    );
  });
});

describe('/admin/teams, /admin/teaminsert and /admin/updateTeamDetails', () => {
  const FACTS = {
    teamID: ['411', '412'],
    place: ['1', '2'],
    finalPlace: ['', ''],
  };

  const final = async () =>
    count(
      'select standings_table_final::int as n from tournaments where id = 41',
    );

  it('a results manager sees the facts form and no rename buttons; a superadmin sees both', async () => {
    const manager = await (await admin('results-manager')).get('/admin/teams');
    expect(manager.html).toContain('data-testid="facts-form"');
    expect(manager.html).not.toContain('Redaguoti komandą');
    const superadmin = await (await admin('superadmin')).get('/admin/teams');
    expect(superadmin.html).toContain('Redaguoti komandą Home 41');
  });

  it('saves the facts, and a results manager may mark the table final once it is complete (R-92)', async () => {
    const browser = await admin('results-manager');
    const posted = await browser.post(
      '/admin/teams/save',
      formOf({ ...FACTS, playOffs: ['0'], final: '1' }),
    );
    expect(posted.location).toBe('/admin/teams');
    expect(said(await followed(browser, posted))).toContain(
      'Komandos atnaujintos.',
    );
    expect(await final()).toBe(1);
    expect(
      await count(
        'select count(*)::int as n from team_outcomes where team_id = 411 and place = 1 and play_offs',
      ),
    ).toBe(1);
  });

  it('R-92: an incomplete table is not marked final, and the message says how many places it needs', async () => {
    const browser = await admin('results-manager');
    const posted = await browser.post(
      '/admin/teams/save',
      formOf({ ...FACTS, place: ['1', ''], final: '1' }),
    );
    expect(said(await followed(browser, posted))).toContain(
      'Galutinė lentelė galima tik užpildžius visas vietas 1..2 be pasikartojimų.',
    );
    expect(await final()).toBe(0);
  });

  it('R-92: only a superadmin takes the mark off, and the results manager is told', async () => {
    const manager = await admin('results-manager');
    await manager.post('/admin/teams/save', formOf({ ...FACTS, final: '1' }));
    const refused = await manager.post('/admin/teams/save', formOf(FACTS));
    expect(said(await followed(manager, refused))).toContain(
      'Galutinės lentelės žymą gali nuimti tik superadministratorius.',
    );
    expect(await final()).toBe(1);
    const boss = await admin('superadmin');
    const done = await boss.post('/admin/teams/save', formOf(FACTS));
    expect(said(await followed(boss, done))).toContain('Komandos atnaujintos.');
    expect(await final()).toBe(0);
  });

  it('refuses two teams at one place, and lists a refused row with its number', async () => {
    const browser = await admin('results-manager');
    const same = await browser.post(
      '/admin/teams/save',
      formOf({ ...FACTS, place: ['1', '1'] }),
    );
    expect(said(await followed(browser, same))).toContain(
      'Dvi komandos negali turėti tos pačios vietos.',
    );
    const bad = await browser.post(
      '/admin/teams/save',
      formOf({ ...FACTS, place: ['x', '2'] }),
    );
    expect(said(await followed(browser, bad))).toContain(
      'Eilutė 1: Vieta: turi būti sveikasis skaičius nuo 1',
    );
  });

  it('renames a team of the working tournament, and lists a refused form; a results manager is sent home', async () => {
    const boss = await admin('superadmin');
    const posted = await boss.post(
      '/admin/updateTeamDetails',
      formOf({ teamID: '411', teamName: 'Žalgiris' }),
    );
    expect(said(await followed(boss, posted))).toContain('Komanda atnaujinta');
    expect(
      await count(
        "select count(*)::int as n from teams where id = 411 and name = 'Žalgiris'",
      ),
    ).toBe(1);
    const empty = await boss.post('/admin/updateTeamDetails', formOf({}));
    const text = said(await followed(boss, empty));
    expect(text).toContain('Komanda: privalomas laukas');
    expect(text).toContain('Pavadinimas: privalomas laukas');
    const manager = await (
      await admin('results-manager')
    ).post(
      '/admin/updateTeamDetails',
      formOf({ teamID: '412', teamName: 'Kita' }),
    );
    expect(manager.location).toBe('/');
    expect(
      await count("select count(*)::int as n from teams where name = 'Kita'"),
    ).toBe(0);
  });

  it('refuses a team of another tournament (issue 273)', async () => {
    const boss = await admin('superadmin');
    await saveTournamentWithGames(db, LATER);
    const posted = await boss.post(
      '/admin/updateTeamDetails',
      formOf({ teamID: '421', teamName: 'Kita' }),
    );
    expect(said(await followed(boss, posted))).toContain(
      'Tokios komandos šiame turnyre nėra.',
    );
  });

  it('a new tournament has no team: /admin/teams is the placeholder form, and teamCount makes team1 ... teamN once', async () => {
    const boss = await admin('superadmin');
    await boss.post(
      '/admin/tournaments/save',
      formOf({
        name: 'Tuščias',
        slug: 'tuscias',
        status: 'upcoming',
        standings_deadline_round: '',
        start_date: '',
        end_date: '',
        description: '',
        is_public: '1',
      }),
    );
    const id = await count(
      "select id as n from tournaments where slug = 'tuscias'",
    );
    await boss.post(`/admin/tournaments/${String(id)}/context`, formOf({}));
    expect(said(await boss.get('/admin/teams'))).toContain(
      'Įveskite komandų kiekį:',
    );
    const few = await boss.post(
      '/admin/teaminsert/save',
      formOf({ teamCount: '1' }),
    );
    expect(few.location).toBe('/admin/teaminsert');
    expect(said(await followed(boss, few))).toContain(
      'Komandų kiekis: per maža reikšmė',
    );
    const posted = await boss.post(
      '/admin/teaminsert/save',
      formOf({ teamCount: '3' }),
    );
    expect(posted.location).toBe('/admin/teams');
    expect(said(await followed(boss, posted))).toContain('Pridėta komandų: 3.');
    expect(
      await count(
        "select count(*)::int as n from teams where tournament_id = $1 and name in ('team1','team2','team3')",
        id,
      ),
    ).toBe(3);
    const again = await boss.post(
      '/admin/teaminsert/save',
      formOf({ teamCount: '3' }),
    );
    expect(said(await followed(boss, again))).toContain(
      'Šiame turnyre komandos jau yra.',
    );
  });
});

describe('the write throttle (adminWriteLimits: 60 accepted writes a minute)', () => {
  it('past 60 accepted writes in a minute, nothing is written and the page says for how long; a refused form costs nothing', async () => {
    const browser = await admin('superadmin');
    for (let n = 0; n < 3; n += 1) {
      await browser.post('/admin/eventInsert', formOf({}));
    }
    for (let n = 0; n < 60; n += 1) {
      await browser.post(
        '/admin/eventInsert',
        formOf({
          event: `T${String(n)}`,
          eventDay: String(100 + n),
          stage: 'regular',
          rate: '1',
        }),
      );
    }
    const past = await browser.post(
      '/admin/eventInsert',
      formOf({
        event: 'Per daug',
        eventDay: '200',
        stage: 'regular',
        rate: '1',
      }),
    );
    expect(said(await followed(browser, past))).toContain('Per daug bandymų.');
    expect(
      await count(
        "select count(*)::int as n from rounds where name = 'Per daug'",
      ),
    ).toBe(0);
    expect(
      await count("select count(*)::int as n from rounds where name like 'T%'"),
    ).toBe(60);
  });
});
