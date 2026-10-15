// Slice 15: the euroleague-import command, over the fixture feed: a dry run
// writes nothing, an apply reports, and every refusal exits 1.

import {
  ruledRules,
  seasonCodeSchema,
  type EuroleagueFeed,
  type FeedFailure,
} from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  planText,
  printable,
  runEuroleagueImportCommand,
} from '../src/import/command';
import { fixtureEuroleagueFeed } from '../src/import/feed';
import { useTestDatabase } from '../src/testing';
import {
  BEFORE_SEASON,
  FIXTURE_PATH,
  saveEmptyTournament,
} from './import-support';
import { TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

async function run(
  argv: string[],
  feed: EuroleagueFeed = fixtureEuroleagueFeed(FIXTURE_PATH),
) {
  const lines: string[] = [];
  const code = await runEuroleagueImportCommand(argv, {
    db,
    feed,
    now: BEFORE_SEASON,
    rules: ruledRules,
    out: (line) => lines.push(line),
    clock: () => Promise.resolve(BEFORE_SEASON),
  });
  return { code, text: lines.join('\n') };
}

const gamesWritten = async () =>
  z
    .array(z.object({ n: z.number() }))
    .parse((await client.query('select count(*)::int as n from games')).rows)[0]
    ?.n;

const failing = (failure: FeedFailure): EuroleagueFeed => ({
  games: () => Promise.resolve({ ok: false, refusal: failure }),
});

describe('euroleague-import', () => {
  it("prints sportbet's table and writes nothing on --dry-run", async () => {
    await saveEmptyTournament(db);
    const { code, text } = await run(['euroleague-2026-27', '--dry-run']);
    expect(code).toBe(0);
    expect(text).toMatch(/Teams to create\s+20/u);
    expect(text).toMatch(/Events to create\s+2\n/u);
    expect(text).toMatch(/Games to create\s+20/u);
    expect(text).toMatch(/Games to reschedule\s+0/u);
    expect(text).toMatch(/Games unchanged\s+0/u);
    expect(text).toMatch(/Locked, reschedule refused\s+0/u);
    expect(text).toMatch(/Players affected\s+3/u);
    expect(text).toMatch(/Post-season left out\s+0/u);
    expect(text).toMatch(/Dropped from the feed\s+0/u);
    expect(text).toMatch(/Teams without a crest\s+0/u);
    expect(text.endsWith('Dry run: nothing was written.')).toBe(true);
    expect(await gamesWritten()).toBe(0);
  });

  it('applies the plan it just printed and reports the counts', async () => {
    await saveEmptyTournament(db);
    const { code, text } = await run(['euroleague-2026-27']);
    expect(code).toBe(0);
    expect(text).toContain(
      'Imported 20 teams, 2 events, 20 games (0 rescheduled, 0 locked and left alone); seeded 3 players.',
    );
    expect(await gamesWritten()).toBe(20);
    const again = await run(['euroleague-2026-27']);
    expect(again.text).toContain('Imported 0 teams, 0 events, 0 games');
    expect(await gamesWritten()).toBe(20);
  });

  it('finds the tournament by slug and by id', async () => {
    await saveEmptyTournament(db);
    expect((await run([TOURNAMENT.slug, '--dry-run'])).code).toBe(0);
    expect((await run([String(TOURNAMENT.id), '--dry-run'])).code).toBe(0);
  });

  it('takes the season as --season=E2026 or --season E2026', async () => {
    await saveEmptyTournament(db);
    expect(
      (await run([TOURNAMENT.slug, '--season=E2026', '--dry-run'])).code,
    ).toBe(0);
    expect(
      (await run([TOURNAMENT.slug, '--dry-run', '--season', 'E2026'])).code,
    ).toBe(0);
  });

  it('lists the games the feed dropped', async () => {
    await saveEmptyTournament(db);
    await run([TOURNAMENT.slug]);
    const answer = await fixtureEuroleagueFeed(FIXTURE_PATH).games(
      seasonCodeSchema.parse('E2026'),
    );
    const data = z
      .object({ data: z.array(z.unknown()) })
      .parse(answer.ok ? answer.value : null).data;
    const without: EuroleagueFeed = {
      games: () =>
        Promise.resolve({ ok: true, value: { data: data.slice(1) } }),
    };
    const { text } = await run([TOURNAMENT.slug, '--dry-run'], without);
    expect(text).toMatch(/Dropped from the feed\s+1\n/u);
    expect(text).toContain('Dropped from the feed: 1: ');
    expect(text).not.toContain('Teams without a crest:');
  });

  it('exits 1 for an unknown tournament', async () => {
    await saveEmptyTournament(db);
    expect(await run(['no-such-tournament'])).toEqual({
      code: 1,
      text: 'No tournament matches "no-such-tournament".',
    });
    expect((await run(['99'])).code).toBe(1);
    expect((await run(['99999999999'])).code).toBe(1);
  });

  it('never prints a control character, whatever string it echoes', async () => {
    await saveEmptyTournament(db);
    expect(await run(['evil\u001b[31m-name\u009b'])).toEqual({
      code: 1,
      text: 'No tournament matches "evil[31m-name".',
    });
    expect(printable('a\u001b[2Jb\u007fc\u0085d')).toBe('a[2Jbcd');
  });

  it('refuses a feed whose club name carries an escape, printing nothing raw', async () => {
    await saveEmptyTournament(db);
    const answer = await fixtureEuroleagueFeed(FIXTURE_PATH).games(
      seasonCodeSchema.parse('E2026'),
    );
    if (!answer.ok) throw new Error('the fixture feed failed');
    const text = JSON.stringify(answer.value).replace(
      'Hapoel IBI Tel Aviv',
      'Hapoel\\u001b[31m',
    );
    const parsed: unknown = JSON.parse(text);
    const feed: EuroleagueFeed = {
      games: () => Promise.resolve({ ok: true, value: parsed }),
    };
    const ran = await run(['euroleague-2026-27'], feed);
    expect(ran.code).toBe(1);
    expect(ran.text).toBe(
      'Euroleague atsakymas netinkamas: rungtynėse nr. 1 trūksta lauko local.club.name.',
    );
    expect(await gamesWritten()).toBe(0);
  });

  it.each([
    [{ kind: 'tournament-finished' }, 'Turnyras baigtas - keisti negalima.'],
    [
      { kind: 'duplicate-team-names', team: 'Zalgiris' },
      'Turnyre yra dvi vienodai vadinamos komandos: Zalgiris. Pervadinkite vieną iš jų ir bandykite dar kartą.',
    ],
    [
      { kind: 'unmatched-teams', teams: ['Ada', 'Ben'] },
      'Šios komandos yra tvarkaraštyje, bet ne turnyre: Ada, Ben. Pervadinkite jas turnyre taip pat, kaip vadinasi tvarkaraštyje, ir bandykite dar kartą. Niekas nebuvo importuota.',
    ],
    [
      { kind: 'round-not-regular', round: 7 },
      'Turas 7 jau yra ir nėra reguliariojo sezono.',
    ],
    [
      { kind: 'duplicate-fixture', round: 3, home: 'A', away: 'B' },
      'Euroleague atsakyme rungtynės kartojasi: 3 turas, A - B.',
    ],
    [
      { kind: 'plan-changed' },
      'Tvarkaraštis arba turnyras pasikeitė po peržiūros - peržiūrėkite dar kartą.',
    ],
    [{ kind: 'no-tournament' }, 'Turnyro nebėra.'],
  ] as const)('words the refusal %j in Lithuanian', (refusal, text) => {
    expect(planText(refusal)).toBe(text);
  });

  it('exits 1 for a bad season code, before the feed is read', async () => {
    await saveEmptyTournament(db);
    const feed: EuroleagueFeed = {
      games: () => Promise.reject(new Error('the feed must not be read')),
    };
    expect(await run([TOURNAMENT.slug, '--season', 'e26'], feed)).toEqual({
      code: 1,
      text: 'Netinkamas sezono kodas.',
    });
  });

  it('exits 1 with usage for no tournament, an unknown option or two tournaments', async () => {
    for (const argv of [[], ['--season', 'E2026'], ['a', 'b'], ['a', '--x']]) {
      const { code, text } = await run(argv);
      expect(code).toBe(1);
      expect(text).toContain('Usage: euroleague-import');
    }
  });

  it('exits 1 with sportbet words for a feed failure, and writes nothing', async () => {
    await saveEmptyTournament(db);
    expect(
      await run([TOURNAMENT.slug], failing({ kind: 'unreachable' })),
    ).toEqual({
      code: 1,
      text: 'Nepavyko pasiekti Euroleague serverio. Bandykite dar kartą po kelių minučių.',
    });
    expect(
      (
        await run(
          [TOURNAMENT.slug],
          failing({ kind: 'http-error', status: 404 }),
        )
      ).text,
    ).toBe(
      'Euroleague serveris grąžino klaidą (404). Patikrinkite sezono kodą E2026.',
    );
    expect(
      (await run([TOURNAMENT.slug], failing({ kind: 'not-json' }))).text,
    ).toBe('Euroleague atsakymo nepavyko perskaityti.');
    expect(await gamesWritten()).toBe(0);
  });

  it('exits 1 for a payload with no games or a malformed one', async () => {
    await saveEmptyTournament(db);
    const answering = (value: unknown): EuroleagueFeed => ({
      games: () => Promise.resolve({ ok: true, value }),
    });
    expect((await run([TOURNAMENT.slug], answering({ data: [] }))).text).toBe(
      'Euroleague atsakyme nėra rungtynių. Patikrinkite sezono kodą.',
    );
    expect((await run([TOURNAMENT.slug], answering({ data: [{}] }))).text).toBe(
      'Euroleague atsakymas netinkamas: rungtynėse nr. 1 trūksta lauko round.',
    );
  });

  it('exits 1 on a refusal of the plan, naming it', async () => {
    await saveEmptyTournament(db);
    await client.query(
      "insert into teams (tournament_id, name) values (3, 'Zalgiris')",
    );
    const { code, text } = await run([TOURNAMENT.slug]);
    expect(code).toBe(1);
    expect(text).toContain('Šios komandos yra tvarkaraštyje, bet ne turnyre:');
    expect(await gamesWritten()).toBe(0);
  });
});
