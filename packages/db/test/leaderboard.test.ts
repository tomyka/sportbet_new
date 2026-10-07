// /leaderboard (MainController::leaderboard, PlayerTotals::allTime) over
// two tournaments: sportbet's golden scenario and a one-game second one.

import {
  Game,
  MatchPrediction,
  Round,
  ruledRules,
  sportbetRules,
  type PlayerId,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import {
  at,
  gameNo,
  rate,
  roundNo,
  score,
  team,
  unwrap,
} from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anyLeaderboardEntry,
  loadLeaderboard,
  loadTournamentTotals,
  recalculateLocked,
} from '../src';
import { saveTournamentPlayers } from '../src/player/repository';
import { saveMatchPredictions } from '../src/prediction/repository';
import { saveGames, saveRounds } from '../src/season/repository';
import { saveTeams } from '../src/team/repository';
import { saveTournament } from '../src/tournament/repository';
import { useTestDatabase } from '../src/testing';
import { GOLDEN_EL, IDS, saveGolden } from './golden-world';

const { db } = useTestDatabase();

const ada = IDS.player('ada');
const ben = IDS.player('ben');
const cai = IDS.player('cai');

const SECOND: Tournament = {
  ...GOLDEN_EL,
  id: 5,
  slug: 'second-el',
  name: 'Second EL',
  endsOn: '2027-05-23',
};
const HOME = team('21');
const AWAY = team('22');

/** One scored game; ada names the winner, ben does not. */
async function saveSecond(): Promise<void> {
  await saveTournament(db, SECOND);
  await saveTeams(db, SECOND, [
    { id: HOME, name: 'Zalgiris' },
    { id: AWAY, name: 'Olympiacos' },
  ]);
  await saveRounds(db, SECOND, [
    {
      id: 31,
      name: '1 turas',
      round: Round.stored({
        number: roundNo(1),
        stage: 'regular',
        rate: rate(1),
        survival: false,
        knockout: false,
      }),
    },
  ]);
  await saveGames(db, SECOND, [
    unwrap(
      Game.stored({
        id: gameNo(41),
        round: roundNo(1),
        home: HOME,
        away: AWAY,
        tipOff: at('2026-10-02T18:00:00Z'),
        result: score(88, 79),
        recordedWinner: null,
        lockedSince: null,
        postponed: false,
      }),
    ),
  ]);
  await saveTournamentPlayers(
    db,
    SECOND,
    [ada, ben].map((player) => ({
      player,
      switchedOff: false,
      adminHidden: false,
      fillIns: 0,
    })),
  );
  await saveMatchPredictions(db, SECOND, [
    unwrap(
      MatchPrediction.enter({
        player: ada,
        game: gameNo(41),
        home: 85,
        away: 80,
      }),
    ),
    unwrap(
      MatchPrediction.enter({
        player: ben,
        game: gameNo(41),
        home: 79,
        away: 88,
      }),
    ),
  ]);
}

async function recalculateBoth(rules: RuleSet): Promise<void> {
  expect(await recalculateLocked(db, GOLDEN_EL, rules)).toBeNull();
  expect(await recalculateLocked(db, SECOND, rules)).toBeNull();
}

/** A player's stored total in one tournament, to the cent, as the rule set's Lyderiai adds it. */
async function centsIn(
  tournament: Tournament,
  player: PlayerId,
  rules: RuleSet,
): Promise<number> {
  const { totals } = await loadTournamentTotals(db, tournament, rules);
  const total = totals.find((each) => each.player === player);
  if (total === undefined) return 0;
  const full = rules.everyPageRanksByFullTotal
    ? total.standings.toCents() + total.survival.hundredths
    : 0;
  return total.match.hundredths + total.serija.hundredths + full;
}

describe('loadLeaderboard', () => {
  beforeEach(async () => {
    await saveGolden(db);
    await saveSecond();
  });

  for (const rules of [sportbetRules, ruledRules]) {
    it(`sums every tournament and ranks as Lyderiai (${rules.name}; R-18)`, async () => {
      await recalculateBoth(rules);
      const board = await loadLeaderboard(db, rules);
      const expected = await Promise.all(
        [ada, ben, cai].map(async (player) => ({
          player,
          totalCents:
            (await centsIn(GOLDEN_EL, player, rules)) +
            (await centsIn(SECOND, player, rules)),
        })),
      );
      expect(
        [...board]
          .map(({ player, totalCents }) => ({ player, totalCents }))
          .sort((a, b) => a.player.localeCompare(b.player)),
      ).toEqual(expected);
      expect(board.map(({ rank }) => rank)).toEqual([1, 2, 3]);
      const totals = board.map(({ totalCents }) => totalCents);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));
    });
  }

  it('under ruledRules ada leads on her standings (R-18); under sportbetRules cai on match points', async () => {
    await recalculateBoth(ruledRules);
    expect((await loadLeaderboard(db, ruledRules))[0]?.username).toBe('ada');
    await recalculateBoth(sportbetRules);
    expect((await loadLeaderboard(db, sportbetRules))[0]?.username).toBe('cai');
  });

  it('a player without a match points row (dan: survival only) is not on it', async () => {
    await recalculateBoth(ruledRules);
    expect(
      (await loadLeaderboard(db, ruledRules)).map(({ username }) => username),
    ).not.toContain('dan');
  });

  it("counts each player's exact scores, right winners and games", async () => {
    await recalculateBoth(ruledRules);
    const adaRow = (await loadLeaderboard(db, ruledRules)).find(
      ({ player }) => player === ada,
    );
    // Golden: h1 and h3 named the winner, h3 exact; the second: named it.
    expect(adaRow).toMatchObject({ exact: 1, winners: 3, games: 4 });
  });

  describe('a player switched off in one tournament (R-77)', () => {
    beforeEach(() =>
      saveTournamentPlayers(db, SECOND, [
        { player: ben, switchedOff: true, adminHidden: false, fillIns: 0 },
      ]),
    );

    it('ruled: only the tournaments where they are listed count', async () => {
      await recalculateBoth(ruledRules);
      const benRow = (await loadLeaderboard(db, ruledRules)).find(
        ({ player }) => player === ben,
      );
      expect(benRow).toMatchObject({
        totalCents: await centsIn(GOLDEN_EL, ben, ruledRules),
        games: 3,
      });
    });

    it('sportbet: one switch for the account, so they are not on it', async () => {
      await recalculateBoth(sportbetRules);
      expect(
        (await loadLeaderboard(db, sportbetRules)).map(({ player }) => player),
      ).not.toContain(ben);
    });
  });
});

describe('anyLeaderboardEntry (PlayerTotals::anyRecorded)', () => {
  it('is false on an empty database', async () => {
    expect(await anyLeaderboardEntry(db, ruledRules)).toBe(false);
  });

  it('is true once the rule set has a match points row, and reads only its own source', async () => {
    await saveGolden(db);
    // Only production's rows so far.
    expect(await anyLeaderboardEntry(db, ruledRules)).toBe(false);
    expect(await recalculateLocked(db, GOLDEN_EL, ruledRules)).toBeNull();
    expect(await anyLeaderboardEntry(db, ruledRules)).toBe(true);
    expect(await anyLeaderboardEntry(db, sportbetRules)).toBe(false);
  });
});
