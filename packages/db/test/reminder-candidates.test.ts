// The reminder run's reads (SendPredictionReminders::unremindedGamesByPlayer,
// issue 230) and the setting that opts a player in (R-97).

import { Game, type PlayerId, type Score } from '@sportbet/domain';
import {
  at,
  gameNo,
  player,
  roundNo,
  score,
  team,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadReminderCandidates,
  loadReminderRecipients,
  savePlayerSettings,
  setReceiveReminders,
} from '../src';
import { saveGames, saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import {
  ADA,
  BEN,
  CAI,
  OLY,
  OTHER,
  REA,
  FEN,
  ROUNDS,
  rowsOf,
  savePlaying,
  saveWorld,
  TOURNAMENT,
  ZAL,
} from './world';

const { db, client } = useTestDatabase();

const NOW = at('2026-10-10T12:00:00Z');

/** Distinct pairings: a round holds a pairing once. */
const PAIRS = [
  { home: ZAL, away: OLY },
  { home: ZAL, away: REA },
  { home: ZAL, away: FEN },
  { home: OLY, away: REA },
  { home: OLY, away: FEN },
  { home: REA, away: FEN },
] as const;

const game = (
  id: number,
  tipOff: string,
  state: Partial<{
    result: Score;
    postponed: boolean;
    lockedSince: string;
  }> = {},
) =>
  unwrap(
    Game.stored({
      id: gameNo(id),
      round: roundNo(1),
      ...(PAIRS[id % PAIRS.length] ?? PAIRS[0]),
      tipOff: at(tipOff),
      result: state.result ?? null,
      recordedWinner: null,
      lockedSince:
        state.lockedSince === undefined ? null : at(state.lockedSince),
      postponed: state.postponed ?? false,
    }),
  );

/** A blank real prediction row (null score) for the player and game. */
async function blankRow(who: number, id: number) {
  await client.query(
    "insert into match_predictions (player_id, game_id, home, away, origin) values ($1, $2, null, null, 'real')",
    [who, id],
  );
}

const candidates = async () =>
  (await loadReminderCandidates(db, { now: NOW })).map(
    ({ player: who, game: id }) => `${who}:${String(id)}`,
  );

beforeEach(async () => {
  await saveWorld(db);
  await savePlaying(db, TOURNAMENT, ADA, BEN, CAI);
  await savePlayerSettings(
    db,
    [ADA, BEN, CAI].map((who) => ({
      player: who,
      locale: 'lt',
      role: 'player',
      lastTournament: null,
    })),
  );
  await setReceiveReminders(db, { player: ADA, on: true });
  await setReceiveReminders(db, { player: BEN, on: true });
});

describe('setReceiveReminders', () => {
  const stored = async () =>
    rowsOf(
      await client.query(
        'select player_id, receive_reminders from player_settings order by player_id',
      ),
    );

  it('is off for every account until it is turned on', async () => {
    expect(await stored()).toEqual([
      { player_id: 1, receive_reminders: true },
      { player_id: 2, receive_reminders: true },
      { player_id: 3, receive_reminders: false },
    ]);
  });

  it('turns it on and off for that player only', async () => {
    expect(await setReceiveReminders(db, { player: CAI, on: true })).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await stored())[2]).toEqual({
      player_id: 3,
      receive_reminders: true,
    });
    await setReceiveReminders(db, { player: ADA, on: false });
    expect(await stored()).toEqual([
      { player_id: 1, receive_reminders: false },
      { player_id: 2, receive_reminders: true },
      { player_id: 3, receive_reminders: true },
    ]);
  });

  it('succeeds again when it is already off', async () => {
    await setReceiveReminders(db, { player: CAI, on: false });
    expect(await setReceiveReminders(db, { player: CAI, on: false })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('refuses a player with no account', async () => {
    expect(
      await setReceiveReminders(db, { player: player('99'), on: true }),
    ).toEqual({ ok: false, refusal: 'unknown-player' });
  });
});

describe('loadReminderCandidates', () => {
  it('lists an opted-in player unanswered, open game, earliest first', async () => {
    await saveGames(db, TOURNAMENT, [
      game(21, '2026-10-10T18:00:00Z'),
      game(20, '2026-10-10T17:00:00Z'),
    ]);
    await blankRow(1, 21);
    await blankRow(1, 20);
    expect(await loadReminderCandidates(db, { now: NOW })).toEqual([
      { player: ADA, game: gameNo(20), tipOff: at('2026-10-10T17:00:00Z') },
      { player: ADA, game: gameNo(21), tipOff: at('2026-10-10T18:00:00Z') },
    ]);
  });

  it('leaves out a player who has not opted in', async () => {
    await saveGames(db, TOURNAMENT, [game(20, '2026-10-10T17:00:00Z')]);
    await blankRow(3, 20);
    expect(await candidates()).toEqual([]);
  });

  it('leaves out a player who opted out again', async () => {
    await saveGames(db, TOURNAMENT, [game(20, '2026-10-10T17:00:00Z')]);
    await blankRow(1, 20);
    await setReceiveReminders(db, { player: ADA, on: false });
    expect(await candidates()).toEqual([]);
  });

  it('leaves out a game already reminded, for that player only', async () => {
    await saveGames(db, TOURNAMENT, [game(20, '2026-10-10T17:00:00Z')]);
    await blankRow(1, 20);
    await blankRow(2, 20);
    await client.query(
      'update match_predictions set reminded_at = now() where player_id = 1',
    );
    expect(await candidates()).toEqual(['2:20']);
  });

  it('leaves out an answered game and keeps a half-typed one', async () => {
    await saveGames(db, TOURNAMENT, [
      game(20, '2026-10-10T17:00:00Z'),
      game(21, '2026-10-10T18:00:00Z'),
      game(22, '2026-10-10T19:00:00Z'),
    ]);
    await client.query(
      "insert into match_predictions (player_id, game_id, home, away, origin) values (1, 20, 80, 70, 'real'), (1, 21, 80, null, 'real'), (1, 22, null, 70, 'real')",
    );
    expect(await candidates()).toEqual(['1:21', '1:22']);
  });

  it('leaves out a game that started, one with a result and one past 48 hours', async () => {
    await saveGames(db, TOURNAMENT, [
      game(20, '2026-10-10T11:59:59Z'),
      game(21, '2026-10-10T12:00:00Z'),
      game(22, '2026-10-10T18:00:00Z', {
        result: score(80, 70),
      }),
      game(23, '2026-10-12T12:00:00Z'),
      game(24, '2026-10-12T11:59:00Z'),
    ]);
    for (const id of [20, 21, 22, 23, 24]) await blankRow(1, id);
    expect(await candidates()).toEqual(['1:24']);
  });

  it('leaves out a postponed game and one locked since a move', async () => {
    await saveGames(db, TOURNAMENT, [
      game(20, '2026-10-10T17:00:00Z', { postponed: true }),
      game(21, '2026-10-11T17:00:00Z', { lockedSince: '2026-10-09T17:00:00Z' }),
      game(22, '2026-10-10T19:00:00Z'),
    ]);
    for (const id of [20, 21, 22]) await blankRow(1, id);
    expect(await candidates()).toEqual(['1:22']);
  });

  it("includes another tournament's games and an inactive player", async () => {
    await saveTournament(db, OTHER);
    await saveTeams(db, OTHER, [
      { id: team('31'), name: 'Baskonia' },
      { id: team('32'), name: 'Monaco' },
    ]);
    await saveRounds(db, OTHER, [
      { ...ROUNDS[0], id: 31, round: ROUNDS[0].round },
    ]);
    await saveGames(db, OTHER, [
      unwrap(
        Game.stored({
          id: gameNo(30),
          round: roundNo(1),
          home: team('31'),
          away: team('32'),
          tipOff: at('2026-10-10T19:00:00Z'),
          result: null,
          recordedWinner: null,
          lockedSince: null,
          postponed: false,
        }),
      ),
    ]);
    await client.query(
      'update tournament_players set switched_off = true where player_id = 1',
    );
    await blankRow(1, 30);
    expect(await candidates()).toEqual(['1:30']);
  });

  it('lists nothing when there are no rows', async () => {
    expect(await candidates()).toEqual([]);
  });
});

describe('loadReminderRecipients', () => {
  it('gives the address and the games with team names and tip-offs, by tip-off then id', async () => {
    await saveGames(db, TOURNAMENT, [
      game(21, '2026-10-10T18:00:00Z'),
      game(20, '2026-10-10T18:00:00Z'),
    ]);
    const due = [
      {
        player: ADA,
        games: [
          { player: ADA, game: gameNo(21), tipOff: at('2026-10-10T18:00:00Z') },
          { player: ADA, game: gameNo(20), tipOff: at('2026-10-10T18:00:00Z') },
        ],
      },
    ];
    expect(await loadReminderRecipients(db, due)).toEqual([
      {
        player: ADA,
        email: 'ada@example.test',
        games: [
          {
            game: gameNo(20),
            home: 'Zalgiris',
            away: 'Fenerbahce',
            tipOff: at('2026-10-10T18:00:00Z'),
          },
          {
            game: gameNo(21),
            home: 'Olympiacos',
            away: 'Real',
            tipOff: at('2026-10-10T18:00:00Z'),
          },
        ],
      },
    ]);
  });

  it('leaves out a player deleted since, and keeps the others in order', async () => {
    await saveGames(db, TOURNAMENT, [game(20, '2026-10-10T18:00:00Z')]);
    const listed = (who: PlayerId) => ({
      player: who,
      games: [
        { player: who, game: gameNo(20), tipOff: at('2026-10-10T18:00:00Z') },
      ],
    });
    const recipients = await loadReminderRecipients(db, [
      listed(player('99')),
      listed(CAI),
      listed(BEN),
    ]);
    expect(recipients.map(({ player: who }) => who)).toEqual([CAI, BEN]);
  });

  it('leaves out a game that is gone, and a player none of whose games remain', async () => {
    await saveGames(db, TOURNAMENT, [game(20, '2026-10-10T18:00:00Z')]);
    const gone = {
      player: BEN,
      game: gameNo(99),
      tipOff: at('2026-10-10T18:00:00Z'),
    };
    const kept = { ...gone, player: ADA, game: gameNo(20) };
    const recipients = await loadReminderRecipients(db, [
      { player: ADA, games: [gone, kept] },
      { player: BEN, games: [gone] },
    ]);
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.games.map(({ game: id }) => id)).toEqual([
      gameNo(20),
    ]);
  });

  it('reads nothing for no reminders', async () => {
    expect(await loadReminderRecipients(db, [])).toEqual([]);
  });
});
