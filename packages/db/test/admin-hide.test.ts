// Slice 14 (R-19, R-39, R-115): setAdminHidden - an admin's hide, in the
// admin's one tournament, leaving the switch-off alone.

import { ruledRules, type PlayerId, type Role } from '@sportbet/domain';
import { player, testPlayer } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoster, savePlayers, savePlayerSettings } from '../src';
import { setAdminHidden } from '../src/player/admin-hide';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  OTHER,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
} from './world';

const { db, client } = useTestDatabase();
const DAN = player('4');

const ROLES_OF: Readonly<Record<string, Role>> = {
  '1': 'superadmin',
  '2': 'player',
  '3': 'results-manager',
  '4': 'player',
};

/** ADA is the superadmin; BEN plays both tournaments, CAI and DAN the first only. */
beforeEach(async () => {
  await saveWorld(db);
  await saveTournament(db, OTHER);
  await savePlayers(db, [testPlayer(DAN, 'dan')]);
  await savePlayerSettings(
    db,
    Object.entries(ROLES_OF).map(([id, role]) => ({
      player: player(id),
      locale: 'lt',
      role,
      lastTournament: null,
    })),
  );
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await savePlaying(db, OTHER, BEN);
});

const hide = (who: PlayerId, actor: PlayerId = ADA) =>
  setAdminHidden(db, { actor, tournament: TOURNAMENT, player: who });

const rows = async () =>
  rowsOf(
    await client.query(
      `select tournament_id, player_id, switched_off, admin_hidden, fill_ins
         from tournament_players order by tournament_id, player_id`,
    ),
  );

const switchAndCount = (row: Record<string, unknown>) => [
  row['switched_off'],
  row['fill_ins'],
];

const listed = async () =>
  [
    ...(await loadRoster(db, TOURNAMENT, 'whole-tournament', ruledRules)),
  ].sort();

describe('setAdminHidden', () => {
  it('hides a player in the admin tournament only, and they leave the tables', async () => {
    expect(await listed()).toEqual([ADA, BEN, CAI]);
    expect(await hide(BEN)).toEqual({ ok: true, value: { hidden: true } });
    expect(
      (await rows()).map((row) => [
        row['tournament_id'],
        row['player_id'],
        row['admin_hidden'],
      ]),
    ).toEqual([
      [3, 1, false],
      [3, 2, true],
      [3, 3, false],
      [4, 2, false],
    ]);
    expect(await listed()).toEqual([ADA, CAI]);
    expect([
      ...(await loadRoster(db, OTHER, 'whole-tournament', ruledRules)),
    ]).toEqual([BEN]);
  });

  it('the same button un-hides, and the player is listed again', async () => {
    await hide(BEN);
    expect(await hide(BEN)).toEqual({ ok: true, value: { hidden: false } });
    expect(await listed()).toEqual([ADA, BEN, CAI]);
  });

  it('leaves the switch-off and the fill-in count alone, hiding or un-hiding (R-19, R-39)', async () => {
    await client.query(
      'update tournament_players set switched_off = true, fill_ins = 21 where player_id = 3',
    );
    const before = await rows();
    await hide(CAI);
    const hidden = await rows();
    expect(hidden.map(switchAndCount)).toEqual(before.map(switchAndCount));
    await hide(CAI);
    expect(await rows()).toEqual(before);
    expect(before.find((row) => row['player_id'] === 3)).toMatchObject({
      switched_off: true,
      fill_ins: 21,
    });
  });

  it('refuses a player who does not play the tournament, and one who does not exist', async () => {
    expect(await hide(DAN)).toEqual({ ok: false, refusal: 'not-player' });
    expect(await hide(player('99'))).toEqual({
      ok: false,
      refusal: 'not-player',
    });
    // BEN plays the other tournament only as far as that one goes
    expect(
      await setAdminHidden(db, {
        actor: ADA,
        tournament: OTHER,
        player: CAI,
      }),
    ).toEqual({ ok: false, refusal: 'not-player' });
  });

  it.each([
    ['a results manager', CAI],
    ['a player', BEN],
    ['no account', player('99')],
  ])('refuses %s as the actor, and writes nothing', async (_label, actor) => {
    const before = await rows();
    expect(await hide(DAN, actor)).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await hide(BEN, actor)).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await rows()).toEqual(before);
  });

  it('an actor demoted meanwhile is refused', async () => {
    const holder = await client.connect();
    let running: ReturnType<typeof hide>;
    try {
      await holder.query('begin');
      await holder.query(
        "update player_settings set role = 'player' where player_id = 1",
      );
      running = hide(BEN);
      await new Promise((done) => setTimeout(done, 300));
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await running).toEqual({
      ok: false,
      refusal: 'actor-not-superadmin',
    });
    expect(await listed()).toEqual([ADA, BEN, CAI]);
  });
});
