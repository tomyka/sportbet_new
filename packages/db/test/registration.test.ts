// RegisteredUserController::createAccount and PostRegisterController: the
// taken checks as sportbet's collation compares, one transaction for the
// player, the settings and the join, rolled back whole on any failure.

import {
  emailAddress,
  Game,
  Round,
  ruledRules,
  sportbetRules,
  type RuleSet,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  rate,
  roundNo,
  seededDice,
  team,
  testPlayer,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  advanceIdentitySequences,
  createAccount,
  isEmailRegistered,
  savePlayers,
  type NewAccount,
} from '../src';
import { saveGames, saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { OLY, OTHER, REA, saveWorld, TOURNAMENT } from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const email = (typed: string) => unwrap(emailAddress(typed));

const RUTA: NewAccount = {
  username: 'naujoke',
  name: 'Rūta',
  surname: 'Naujokė',
  email: email('ruta.naujoke@example.lt'),
  tournament: null,
};

const create = (
  account: NewAccount = RUTA,
  rules: RuleSet = ruledRules,
  now = NOW,
) => createAccount(db, account, { now, rules, dice: seededDice(3) });

const count = async (table: string) =>
  z
    .array(z.object({ rows: z.int() }))
    .parse(
      (await client.query(`select count(*)::int as rows from ${table}`)).rows,
    )[0]?.rows;

/** TOURNAMENT's game 11 on 12-01, OTHER's game 21 on 12-20: both open. */
beforeEach(async () => {
  await saveWorld(db);
  await saveGames(db, TOURNAMENT, [
    unwrap(
      Game.schedule({
        id: gameNo(11),
        round: roundNo(1),
        home: REA,
        away: OLY,
        tipOff: at('2026-12-01T18:00:00Z'),
      }),
    ),
  ]);
  await saveTournament(db, OTHER);
  await saveTeams(db, OTHER, [
    { id: team('31'), name: 'Paris' },
    { id: team('32'), name: 'Monaco' },
  ]);
  await saveRounds(db, OTHER, [
    {
      id: 41,
      name: '1 turas',
      round: Round.stored({
        number: roundNo(1),
        stage: 'regular',
        rate: rate(1),
        survival: true,
        knockout: false,
      }),
    },
  ]);
  await saveGames(db, OTHER, [
    unwrap(
      Game.schedule({
        id: gameNo(21),
        round: roundNo(1),
        home: team('31'),
        away: team('32'),
        tipOff: at('2026-12-20T18:00:00Z'),
      }),
    ),
  ]);
  // ada, ben and cai hold ids 1 to 3: a new account takes the next one.
  await advanceIdentitySequences(db);
});

describe('isEmailRegistered (unique:users under utf8mb4_unicode_ci)', () => {
  it('registration: the address, and a second spelling of it once accents are dropped, are registered; another is not', async () => {
    expect(await isEmailRegistered(db, email('ada@example.test'))).toBe(true);
    expect(await isEmailRegistered(db, email('adà@example.test'))).toBe(true);
    expect(await isEmailRegistered(db, email('ada2@example.test'))).toBe(false);
  });
});

describe('createAccount', () => {
  it('registration: creates the player and their settings (admin level 0, lt), and joins the open tournament whose next game is soonest (R-27)', async () => {
    expect(await create()).toEqual({
      ok: true,
      value: { player: player('4'), tournament: TOURNAMENT },
    });
    expect(
      (
        await client.query(
          'select id, username, name, surname, email from players where id = 4',
        )
      ).rows,
    ).toEqual([
      {
        id: 4,
        username: 'naujoke',
        name: 'Rūta',
        surname: 'Naujokė',
        email: 'ruta.naujoke@example.lt',
      },
    ]);
    expect((await client.query('select * from player_settings')).rows).toEqual([
      { player_id: 4, locale: 'lt', admin_level: 0, last_tournament_id: null },
    ]);
    expect(
      (
        await client.query(
          'select tournament_id, player_id from tournament_players',
        )
      ).rows,
    ).toEqual([{ tournament_id: TOURNAMENT.id, player_id: 4 }]);
    expect(await count('match_predictions')).toBe(1);
    expect(await count('standings_predictions')).toBe(4);
  });

  it('registration: joins the ?tournament= one when it takes players', async () => {
    const created = await create({ ...RUTA, tournament: OTHER.slug });
    expect(created.ok && created.value.tournament).toEqual(OTHER);
  });

  it('registration: an unknown slug falls back to R-27', async () => {
    const created = await create({ ...RUTA, tournament: 'no-such-tournament' });
    expect(created.ok && created.value.tournament).toEqual(TOURNAMENT);
  });

  it('registration: with no tournament taking players, the account joins none', async () => {
    const created = await create(
      RUTA,
      sportbetRules,
      at('2027-01-05T12:00:00Z'),
    );
    expect(created).toEqual({
      ok: true,
      value: { player: player('4'), tournament: null },
    });
    expect(await count('player_settings')).toBe(1);
    expect(await count('tournament_players')).toBe(0);
  });

  it.each([
    ['the address', 'ada@example.test'],
    ['a second spelling of the address', 'adà@example.test'],
  ])(
    'registration: %s taken answers taken, and writes nothing',
    async (_label, typed) => {
      expect(await create({ ...RUTA, email: email(typed) })).toEqual({
        ok: false,
        refusal: 'taken',
      });
      expect(await count('players')).toBe(3);
      expect(await count('player_settings')).toBe(0);
    },
  );

  it.each(['ada', 'ADA', 'Adà', 'ada '])(
    "registration: the username %s is taken, as sportbet's collation compares it",
    async (username) => {
      expect(await create({ ...RUTA, username })).toEqual({
        ok: false,
        refusal: 'taken',
      });
      expect(await count('players')).toBe(3);
    },
  );

  it('registration: a failure partway rolls the whole account back (#270)', async () => {
    await client.query(`
      create function refuse_standings() returns trigger language plpgsql
        as $$ begin raise exception 'simulated failure writing a standings row'; end $$;
      create trigger refuse_standings before insert on standings_predictions
        for each row execute function refuse_standings();
    `);
    try {
      await expect(create()).rejects.toThrow();
      expect(await count('players')).toBe(3);
      expect(await count('player_settings')).toBe(0);
      expect(await count('tournament_players')).toBe(0);
      expect(await count('match_predictions')).toBe(0);
    } finally {
      await client.query(`
        drop trigger refuse_standings on standings_predictions;
        drop function refuse_standings();
      `);
    }
  });

  it('registration: a collision that is no naming one is thrown, never answered as taken (#270)', async () => {
    // Saved under its own id after the sequence moved: the next generated
    // id collides with it on the primary key.
    await savePlayers(db, [testPlayer(player('4'), 'dan')]);
    await expect(create()).rejects.toThrow();
    expect(await count('players')).toBe(4);
  });
});
