// The result write path against sportbet's golden scenario (design
// decision 12): every golden result entered one by one through saveResult
// must leave exactly the ruled points the domain's golden master holds.

import { ruledRules } from '@sportbet/domain';
import {
  at,
  GOLDEN,
  GOLDEN_POINTS_RULED,
  goldenInputs,
  score,
  scriptedDice,
  snapshotOf,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadTournamentPoints, saveResult } from '../src';
import { saveGames } from '../src/season/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db, client } = useTestDatabase();

beforeEach(() => saveGolden(db));

/** `iso` plus `hours`, as an instant. */
const hoursAfter = (iso: string, hours: number) =>
  at(
    new Date(Date.parse(iso) + hours * 3600 * 1000)
      .toISOString()
      .replace('.000Z', 'Z'),
  );

describe('the result write path against the golden scenario', () => {
  it('replay (ruled): entering the golden results one by one through saveResult reproduces GOLDEN_POINTS_RULED', async () => {
    // Every game unscored, then each result entered as an admin would, in
    // tip-off order, three hours after its tip-off. The scenario holds no
    // blank row, so no fill-in is made: the dice must never be rolled.
    const inputs = goldenInputs({}, IDS);
    await saveGames(
      db,
      GOLDEN_EL,
      inputs.season.games.map((game) => game.withoutResult()),
    );
    for (const spec of GOLDEN.games) {
      const result = await saveResult(
        db,
        {
          game: IDS.game(spec.id),
          entry: {
            kind: 'score',
            score: score(spec.result[0], spec.result[1]),
          },
          now: hoursAfter(spec.tipOff, 3),
          rules: ruledRules,
          by: IDS.player(GOLDEN.players[0]),
          dice: scriptedDice([]),
        },
        // Before every tip-off, so each save is judged at the `now` given.
        () => Promise.resolve(at('2026-06-01T00:00:00Z')),
      );
      expect(result).toEqual({ ok: true, value: null });
    }
    expect(
      snapshotOf(await loadTournamentPoints(db, GOLDEN_EL, 'ruled'), IDS),
    ).toEqual(GOLDEN_POINTS_RULED);
  });

  it("replay (ruled): a blank row is filled in at its game's result with the dice's score, counted, and scored (FI-1, FI-2, R-7)", async () => {
    const inputs = goldenInputs({}, IDS);
    await saveGames(
      db,
      GOLDEN_EL,
      inputs.season.games.map((game) => game.withoutResult()),
    );
    const [first] = GOLDEN.games;
    const [blankPlayer] = GOLDEN.players;
    const playerKey = Number(IDS.player(blankPlayer));
    const gameKey = IDS.game(first.id);
    await client.query(
      'update match_predictions set home = null, away = null where player_id = $1 and game_id = $2',
      [playerKey, gameKey],
    );
    for (const spec of GOLDEN.games) {
      const result = await saveResult(
        db,
        {
          game: IDS.game(spec.id),
          entry: {
            kind: 'score',
            score: score(spec.result[0], spec.result[1]),
          },
          now: hoursAfter(spec.tipOff, 3),
          rules: ruledRules,
          by: IDS.player(GOLDEN.players[0]),
          // The one fill-in: home 55+10+10+10, away 55+5+5+5 (FI-2).
          dice:
            spec.id === first.id
              ? scriptedDice([10, 10, 10, 5, 5, 5])
              : scriptedDice([]),
        },
        () => Promise.resolve(at('2026-06-01T00:00:00Z')),
      );
      expect(result).toEqual({ ok: true, value: null });
    }
    const filled = await client.query(
      'select home, away, origin from match_predictions where player_id = $1 and game_id = $2',
      [playerKey, gameKey],
    );
    expect(filled.rows).toEqual([{ home: 85, away: 70, origin: 'fill-in' }]);
    const count = await client.query(
      'select fill_ins, switched_off from tournament_players where player_id = $1 and tournament_id = $2',
      [playerKey, GOLDEN_EL.id],
    );
    expect(count.rows).toEqual([{ fill_ins: 1, switched_off: false }]);
    const scored = (
      await loadTournamentPoints(db, GOLDEN_EL, 'ruled')
    ).matches.filter(
      ({ player: who, game }) =>
        who === IDS.player(blankPlayer) && game === gameKey,
    );
    expect(scored).toHaveLength(1);
  });
});
