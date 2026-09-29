import { describe, expect, it } from 'vitest';
import { fillIns } from '../fill-in/fill-in';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import { MatchPrediction } from '../prediction/match-prediction';
import { rankPlayers } from '../ranking/league-table';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { at, gameNo, makeGame, player, seededDice, unwrap } from '../testing';
import { PlayerStatus } from './player-status';

const EUROLEAGUE = 'euroleague-2026-27';

const missed = (
  status: PlayerStatus,
  times: number,
  rules: RuleSet,
  tournament = EUROLEAGUE,
  origin: 'fill-in' | 'late-fill-in' = 'fill-in',
): PlayerStatus =>
  Array.from({ length: times }).reduce<PlayerStatus>(
    (current) => current.afterFillIn(tournament, origin, rules),
    status,
  );

describe('PL-1', () => {
  it('player (sportbet): 5 fill-ins across tournaments switch a player off', () => {
    // Missed 3 games at Euro 2024, then 2 in the Euroleague.
    const euro = missed(PlayerStatus.NEW, 3, sportbetRules, 'euro-2024');
    expect(missed(euro, 1, sportbetRules).switchedOff).toBe(false);
    const off = missed(euro, 2, sportbetRules);
    expect(off.switchedOff).toBe(true);

    // A save switches them back on without resetting the count, so the
    // next miss switches them off again.
    const back = off.afterRealPrediction(EUROLEAGUE, sportbetRules);
    expect(back.switchedOff).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, sportbetRules)).toBe(5);
    expect(missed(back, 1, sportbetRules).switchedOff).toBe(true);
  });

  it('player (ruled): 20 fill-ins in a tournament switch a player off', () => {
    expect(missed(PlayerStatus.NEW, 19, ruledRules).switchedOff).toBe(false);
    expect(missed(PlayerStatus.NEW, 20, ruledRules).switchedOff).toBe(true);
    // The count starts from zero in each tournament.
    const elsewhere = missed(PlayerStatus.NEW, 19, ruledRules, 'euro-2028');
    expect(missed(elsewhere, 1, ruledRules).switchedOff).toBe(false);
  });

  it('player (ruled): a real prediction resets the count', () => {
    const off = missed(PlayerStatus.NEW, 20, ruledRules);
    const back = off.afterRealPrediction(EUROLEAGUE, ruledRules);
    expect(back.switchedOff).toBe(false);
    expect(back.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
    expect(missed(back, 19, ruledRules).switchedOff).toBe(false);
    expect(missed(back, 20, ruledRules).switchedOff).toBe(true);
  });

  it("player (ruled): a late joiner's fill-ins do not count", () => {
    const late = missed(
      PlayerStatus.NEW,
      25,
      ruledRules,
      EUROLEAGUE,
      'late-fill-in',
    );
    expect(late.switchedOff).toBe(false);
    expect(late.fillInCount(EUROLEAGUE, ruledRules)).toBe(0);
  });
});

describe('FI-1 and R-32', () => {
  it('fill-in (ruled): a switched-off player gets no fill-in', () => {
    const tomas = missed(PlayerStatus.NEW, 20, ruledRules);
    const game = makeGame({
      id: 1,
      round: 13,
      home: 'ZAL',
      away: 'REA',
      tipOff: '2027-01-08T18:00:00Z',
      result: [88, 79],
    });
    const blank = unwrap(
      MatchPrediction.enter(
        { player: player('tomas'), game: gameNo(1), home: null, away: null },
        ruledRules,
      ),
    );
    expect(tomas.getsFillIns()).toBe(false);
    expect(
      fillIns(
        game,
        [{ prediction: blank, switchedOff: !tomas.getsFillIns() }],
        seededDice(1),
        at('2027-01-08T20:00:00Z'),
      ),
    ).toEqual([]);
  });
});

describe('RA-4', () => {
  const hidden = (rules: RuleSet) =>
    PlayerStatus.NEW.hiddenByAdmin(rules).afterRealPrediction(
      EUROLEAGUE,
      rules,
    );
  const table = (status: PlayerStatus, rules: RuleSet) =>
    rankPlayers(
      [
        {
          player: player('ada'),
          username: 'ada',
          match: Points.whole(1800),
          serija: Points.ZERO,
          standings: StandingsPoints.ZERO,
          survival: Points.ZERO,
          listed: status.isListed(),
        },
      ],
      'league-table',
      rules,
    ).map((row) => row.username);

  it('ranking (ruled): an admin-hidden player stays hidden after saving a prediction', () => {
    expect(hidden(ruledRules).isListed()).toBe(false);
    expect(table(hidden(ruledRules), ruledRules)).toEqual([]);
  });

  it('ranking (sportbet): saving a prediction brings an admin-hidden player back', () => {
    expect(PlayerStatus.NEW.hiddenByAdmin(sportbetRules).isListed()).toBe(
      false,
    );
    expect(table(hidden(sportbetRules), sportbetRules)).toEqual(['ada']);
  });

  it('ranking: a hidden player keeps their points for when they come back', () => {
    const off = missed(PlayerStatus.NEW, 20, ruledRules);
    expect(table(off, ruledRules)).toEqual([]);
    expect(
      table(off.afterRealPrediction(EUROLEAGUE, ruledRules), ruledRules),
    ).toEqual(['ada']);
  });
});
