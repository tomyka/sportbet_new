import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { Points } from '../points/points';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { MatchPrediction } from '../prediction/match-prediction';
import { refuse } from '../shared/result';
import { StandingsPrediction } from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { sportbetRules } from '../rules/rule-set';
import {
  at,
  gameNo,
  player,
  roundNo,
  score,
  team,
  tournamentKey,
  unwrap,
} from '../testing';
import { sportbetColumns } from './sportbet-columns';

describe('sportbet columns: prediction_results', () => {
  const row = (generated: string | null) => ({
    player: player('ada'),
    game: gameNo(1),
    home_team_score: 85,
    away_team_score: 80,
    generated,
  });

  it("stored rows: a generated blob of '1' is a fill-in", () => {
    const stored = unwrap(sportbetColumns.prediction(row('1')));
    expect(stored.origin).toBe('fill-in');
    // sportbet keeps no fill-in time (FI-4).
    expect(stored.filledInAt).toBeNull();
    expect(unwrap(MatchPrediction.stored(stored)).origin).toBe('fill-in');
  });

  it.each([
    ["'0'", '0'],
    ['NULL', null],
  ] as const)(
    'stored rows: a generated blob of %s is a real prediction',
    (_, generated) => {
      expect(unwrap(sportbetColumns.prediction(row(generated)))).toEqual({
        player: player('ada'),
        game: gameNo(1),
        home: 85,
        away: 80,
        origin: 'real',
        filledInAt: null,
      });
    },
  );
});

describe('sportbet columns: prediction_results.generated', () => {
  it.each([
    ["'2'", '2'],
    ["'01'", '01'],
    ['an empty blob', ''],
    ['the byte 0x01', ''],
  ] as const)(
    'stored rows: a generated blob of %s is refused, not guessed',
    (_, generated) => {
      expect(
        sportbetColumns.prediction({
          player: player('ada'),
          game: gameNo(1),
          home_team_score: 85,
          away_team_score: 80,
          generated,
        }),
      ).toEqual(refuse('bad-generated'));
    },
  );
});

describe('sportbet columns: games', () => {
  const row = {
    id: gameNo(1),
    round: roundNo(1),
    home: team('ZAL'),
    away: team('OLY'),
    tipOff: at('2026-10-02T18:00:00Z'),
    home_team_score: 88,
    away_team_score: 79,
    game_winner_id: null,
  };

  it('stored rows: a scored game reads back with its result, never locked or postponed', () => {
    const game = unwrap(Game.stored(unwrap(sportbetColumns.game(row))));
    expect(game.result).toEqual(score(88, 79));
    expect(game.lockedSince).toBeNull();
    expect(game.postponed).toBe(false);
  });

  it('stored rows: a game with neither score has no result', () => {
    const stored = unwrap(
      sportbetColumns.game({
        ...row,
        home_team_score: null,
        away_team_score: null,
      }),
    );
    expect(stored.result).toBeNull();
  });

  it('stored rows: game_winner_id is the recorded winner', () => {
    const stored = unwrap(
      sportbetColumns.game({
        ...row,
        home_team_score: 81,
        away_team_score: 81,
        game_winner_id: team('OLY'),
      }),
    );
    expect(stored.recordedWinner).toBe(team('OLY'));
  });

  it.each([
    ['one score only', { away_team_score: null }, 'half-scored'],
    ['a negative score', { home_team_score: -1 }, 'negative'],
  ] as const)(
    'stored rows: a game with %s is refused',
    (_, changes, refusal) => {
      expect(sportbetColumns.game({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});

describe('sportbet columns: prediction_standings', () => {
  const row = {
    team: team('T1'),
    group_position: null,
    quarterfinal: null,
    semifinal: null,
    final: null,
  };

  it('stored rows: a final of 0 is no final place', () => {
    expect(sportbetColumns.teamPick({ ...row, final: 0 }).finalPlace).toBe(
      null,
    );
  });

  it('stored rows: a group_position of 0 stays a place', () => {
    // sportbet scores a stored place 0 as a place (190 - 10 x the actual
    // place) and counts it among the players who placed the team.
    expect(sportbetColumns.teamPick({ ...row, group_position: 0 }).place).toBe(
      0,
    );
  });

  it('stored rows: the 0/1/NULL ticks are false, true and never saved', () => {
    const pick = sportbetColumns.teamPick({
      ...row,
      quarterfinal: 1,
      semifinal: 0,
    });
    expect([pick.playOffs, pick.finalFour]).toEqual([true, false]);
    expect(sportbetColumns.teamPick(row).playOffs).toBeNull();
  });

  it('stored rows: the mapped row reads back through StandingsPrediction.stored', () => {
    const prediction = unwrap(
      StandingsPrediction.stored(player('ada'), [
        sportbetColumns.teamPick({ ...row, group_position: 3, final: 4 }),
      ]),
    );
    expect(prediction.pick(team('T1'))).toEqual({
      team: team('T1'),
      place: 3,
      playOffs: null,
      finalFour: null,
      finalPlace: 4,
    });
  });
});

describe('sportbet columns: teams', () => {
  const row = {
    team: team('ZAL'),
    group_position: 1,
    quarterfinal: 1,
    semifinal: 0,
    final: 2,
  };

  it('stored rows: a team outcome maps its places and ticks', () => {
    expect(unwrap(sportbetColumns.teamOutcome(row))).toEqual({
      team: team('ZAL'),
      place: 1,
      playOffs: true,
      finalFour: false,
      finalPlace: 2,
    });
  });

  it('stored rows: a group_position or final of 0 is undecided', () => {
    // StandingScoringService scores a team place of 0 like NULL, and a
    // final is live only once a team's final is above 0 (activeStages).
    const outcome = unwrap(
      sportbetColumns.teamOutcome({ ...row, group_position: 0, final: 0 }),
    );
    expect([outcome.place, outcome.finalPlace]).toEqual([null, null]);
    const outcomes = unwrap(TeamOutcomes.stored([outcome], false));
    expect(outcomes.finalDecided()).toBe(false);
  });

  it.each([
    ['5', 5],
    ['-1', -1],
    ['1.5', 1.5],
  ] as const)('stored rows: a team final of %s is refused', (_, final) => {
    expect(sportbetColumns.teamOutcome({ ...row, final })).toEqual(
      refuse('bad-final-place'),
    );
  });
});

describe('sportbet columns: user_settings', () => {
  const euroleague = tournamentKey('euroleague-2026-27');
  const euro = tournamentKey('euro-2028');

  it('stored rows: an inactive player is switched off in every tournament', () => {
    const status = unwrap(
      PlayerStatus.stored(
        sportbetColumns.status({
          tournament: euroleague,
          active: false,
          fillIns: 5,
        }),
        sportbetRules,
      ),
    );
    expect(status.isSwitchedOffIn(euro, sportbetRules)).toBe(true);
    expect(status.fillInCount(euro, sportbetRules)).toBe(5);
    expect(status.adminHidden).toBe(false);
  });

  it('stored rows: an active player is switched off nowhere', () => {
    const status = unwrap(
      PlayerStatus.stored(
        sportbetColumns.status({
          tournament: euroleague,
          active: true,
          fillIns: 2,
        }),
        sportbetRules,
      ),
    );
    expect(status.isListedIn(euroleague, sportbetRules)).toBe(true);
  });
});

describe('sportbet columns: game_odds', () => {
  const row = {
    game: gameNo(1),
    home_odds: '0.59',
    away_odds: '1.59',
    draw_odds: '2.59',
  };

  it('stored rows: a game_odds row reads back as the stored odds of its game', () => {
    const { game, odds } = unwrap(sportbetColumns.gameOdds(row));
    expect(game).toBe(gameNo(1));
    expect(odds.source).toBe('stored');
    expect([odds.home, odds.away, odds.draw].map(String)).toEqual([
      '0.59',
      '1.59',
      '2.59',
    ]);
  });

  it("stored rows: the blank row sportbet inserts with each game scores at odds 0, not CO-5's 1.0", () => {
    // (float) NULL is 0 (ScoringService::getGameOdds); only a game with no
    // row at all is scored at 1.0.
    const { odds } = unwrap(
      sportbetColumns.gameOdds({
        game: gameNo(1),
        home_odds: null,
        away_odds: null,
        draw_odds: null,
      }),
    );
    expect([odds.home, odds.away, odds.draw].map(String)).toEqual([
      '0.00',
      '0.00',
      '0.00',
    ]);
    expect(odds.source).toBe('stored');
  });

  it.each([
    ['a negative value', '-0.50'],
    ['three decimals', '0.585'],
    ['no number', 'x'],
  ] as const)('stored rows: odds with %s are refused', (_, home_odds) => {
    expect(sportbetColumns.gameOdds({ ...row, home_odds })).toEqual(
      refuse('bad-odds'),
    );
  });
});

describe('sportbet columns: point_survivals', () => {
  it("stored rows: a point_survivals row reads back with its event's event_day as its round", () => {
    expect(
      unwrap(
        sportbetColumns.survivalRow({
          id: 7,
          player: player('asta'),
          event_day: 3,
          team: team('FEN'),
          survival_points: 22,
        }),
      ),
    ).toEqual({
      id: 7,
      player: player('asta'),
      round: roundNo(3),
      team: team('FEN'),
      storedPoints: unwrap(Points.whole(22)),
    });
  });

  it('stored rows: a point_survivals row with no positive event_day is refused', () => {
    expect(
      sportbetColumns.survivalRow({
        id: 7,
        player: player('asta'),
        event_day: 0,
        team: team('FEN'),
        survival_points: 22,
      }),
    ).toEqual(refuse('not-a-positive-integer'));
  });
});

describe('sportbet columns: events', () => {
  const row = {
    event_day: 2,
    rate: 1,
    is_knockout: 1,
    event_survival: 1,
    stage: 'regular',
  } as const;

  it('stored rows: an event reads back as its round, through Round.stored', () => {
    const round = Round.stored(unwrap(sportbetColumns.round(row)));
    expect(round.number).toBe(roundNo(2));
    expect(round.rate.value).toBe(1);
    expect(round.knockout).toBe(true);
    expect(round.survival).toBe(true);
    expect(round.stage).toBe('regular');
  });

  it('stored rows: is_knockout is PHP truthy, event_survival only 1', () => {
    // PointResultController casts is_knockout with (bool); NavVisibility
    // shows survival only when event_survival == 1.
    const round = unwrap(
      sportbetColumns.round({ ...row, is_knockout: 0, event_survival: 2 }),
    );
    expect([round.knockout, round.survival]).toEqual([false, false]);
  });

  it.each([
    ['a rate of 0', { rate: 0 }, 'not-a-positive-integer'],
    ['an event_day of 0', { event_day: 0 }, 'not-a-positive-integer'],
  ] as const)(
    'stored rows: an event with %s is refused',
    (_, changes, refusal) => {
      // UpdateEventRequest allows rate 0; production holds none (P16), and the
      // domain has no rate 0 to score it with.
      expect(sportbetColumns.round({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});
