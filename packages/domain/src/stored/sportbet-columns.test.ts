import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { Points } from '../points/points';
import { Game } from '../round/game';
import { Round } from '../round/round';
import { MatchPrediction } from '../prediction/match-prediction';
import { refuse } from '../shared/result';
import { StandingsPrediction } from '../standings/standings-prediction';
import { TeamOutcomes } from '../standings/team-outcomes';
import { SurvivalRun } from '../survival/survival-run';
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

describe('sportbet columns: point_results', () => {
  const row = {
    player: player('ada'),
    game: gameNo(2),
    winner_points: '0.00',
    difference_points: '-45.00',
    bingo_points: '0.00',
    odds: '1.59',
    full_points: '-45.00',
    streak_bonus: '0.00',
  };

  it('stored rows: a point_results row reads back exactly, a negative margin included', () => {
    const stored = unwrap(sportbetColumns.matchPointsRow(row));
    expect(stored.player).toBe(player('ada'));
    expect(stored.game).toBe(gameNo(2));
    expect(stored.points.margin.toString()).toBe('-45.00');
    expect(stored.points.full.toString()).toBe('-45.00');
    expect(stored.points.odds.toString()).toBe('1.59');
    expect(stored.points).not.toHaveProperty('oddsPoints');
    expect(stored.serija.equals(Points.ZERO)).toBe(true);
    expect(stored.points).not.toHaveProperty('extendsSerija');
  });

  it.each([
    [
      'a points column with three places',
      { full_points: '1.005' },
      'bad-points',
    ],
    [
      'a points column that is not a number',
      { winner_points: 'x' },
      'bad-points',
    ],
    ['negative odds', { odds: '-0.59' }, 'bad-odds'],
    ['odds with three places', { odds: '0.591' }, 'bad-odds'],
  ] as const)(
    'stored rows: a point_results row with %s is refused',
    (_, changes, refusal) => {
      expect(sportbetColumns.matchPointsRow({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});

describe('sportbet columns: point_standings', () => {
  const row = {
    player: player('ada'),
    team: team('ZAL'),
    group_position_points: '631.161',
    group_position_odds: '1',
    quarterfinal_points: '0',
    quarterfinal_odds: null,
    semifinal_points: null,
    semifinal_odds: null,
    final_points: null,
    final_odds: null,
    last16_points: null,
    last16_odds: null,
    last32_points: null,
    last32_odds: null,
  };

  it("stored rows: a point_standings row reads each double's text as four places, keeping null apart from 0", () => {
    const stored = unwrap(sportbetColumns.standingsPointsRow(row));
    expect(stored.place.points?.toString()).toBe('631.1610');
    expect(stored.place.odds?.toString()).toBe('1.0000');
    expect(stored.playOffs.points?.toString()).toBe('0.0000');
    expect(stored.playOffs.odds).toBeNull();
    expect(stored.finalFour).toEqual({ points: null, odds: null });
    expect(stored.final).toEqual({ points: null, odds: null });
  });

  it.each([
    ['last16_points', { last16_points: '0' }],
    ['last32_odds', { last32_odds: '1' }],
  ] as const)(
    "stored rows: a Euroleague row with football's %s set is refused",
    (_, changes) => {
      expect(
        sportbetColumns.standingsPointsRow({ ...row, ...changes }),
      ).toEqual(refuse('football-column-set'));
    },
  );

  it.each([
    ['a value needing a fifth place', { group_position_points: '0.12345' }],
    ['an exponent', { quarterfinal_points: '1e-05' }],
    ['negative odds', { group_position_odds: '-1' }],
  ] as const)(
    'stored rows: a point_standings row with %s is refused',
    (_, changes) => {
      expect(
        sportbetColumns.standingsPointsRow({ ...row, ...changes }),
      ).toEqual(refuse('bad-standings-points'));
    },
  );
});

describe('sportbet columns: prediction_survivals', () => {
  it("stored rows: a pick reads back as its event's round and its team, through SurvivalRun.stored", () => {
    const pick = unwrap(
      sportbetColumns.survivalPick({ team: team('FEN'), event_day: 1 }),
    );
    expect(pick).toEqual({ round: roundNo(1), team: team('FEN') });
    expect(unwrap(SurvivalRun.stored([pick])).picks).toEqual([pick]);
  });

  it('stored rows: a pick in an event with no positive event_day is refused', () => {
    expect(
      sportbetColumns.survivalPick({ team: team('FEN'), event_day: 0 }),
    ).toEqual(refuse('not-a-positive-integer'));
  });
});

describe('sportbet columns: users', () => {
  const row = {
    id: 7,
    username: 'ada',
    name: 'Ada',
    surname: 'Žukauskaitė',
    email: 'žukauskaitė@example.lt',
  };

  it('stored rows: a user reads back as its id, as text, its username, its address as stored, its name and surname', () => {
    expect(unwrap(sportbetColumns.player(row))).toEqual({
      id: player('7'),
      username: 'ada',
      email: 'žukauskaitė@example.lt',
      name: 'Ada',
      surname: 'Žukauskaitė',
    });
  });

  it('stored rows: an empty name and surname, as a Google sign-up stores them, are kept', () => {
    expect(
      unwrap(sportbetColumns.player({ ...row, name: '', surname: '' })),
    ).toMatchObject({ name: '', surname: '' });
  });

  it.each([
    ['blank', '  '],
    ['longer than 255 characters', 'a'.repeat(256)],
  ])('stored rows: a username that is %s is refused', (_, username) => {
    expect(sportbetColumns.player({ ...row, username })).toEqual(
      refuse('bad-username'),
    );
  });

  // Sign-in looks an address up normalized (#41), so an account whose
  // stored address is not could never sign in: refused, counted, never fixed.
  it.each([
    ['not lower case', 'Ada@example.lt'],
    ['not lower case outside ASCII', 'Žukauskaitė@example.lt'],
    ['not trimmed', 'ada@example.lt '],
  ])(
    'stored rows: an address that is %s is refused as unnormalized-email, never fixed',
    (_, email) => {
      expect(sportbetColumns.player({ ...row, email })).toEqual(
        refuse('unnormalized-email'),
      );
    },
  );

  it('stored rows: a normalized value that is no address is refused as bad-email', () => {
    expect(sportbetColumns.player({ ...row, email: 'ada' })).toEqual(
      refuse('bad-email'),
    );
  });

  it('stored rows: a name or surname past 255 characters is refused', () => {
    expect(sportbetColumns.player({ ...row, name: 'a'.repeat(256) })).toEqual(
      refuse('bad-name'),
    );
    expect(
      sportbetColumns.player({ ...row, surname: 'a'.repeat(256) }),
    ).toEqual(refuse('bad-name'));
  });

  it.each([
    ['0', 0],
    ['negative', -7],
    ['a fraction', 7.5],
  ])('stored rows: a user whose id is %s is refused as a bad id', (_, id) => {
    expect(sportbetColumns.player({ ...row, id })).toEqual(refuse('bad-id'));
  });
});

describe('sportbet columns: user_settings admin and locale', () => {
  it("stored rows: a user's settings read back as their role and locale, with no last tournament (sportbet kept it in the session)", () => {
    expect(
      unwrap(
        sportbetColumns.settings({
          player: player('7'),
          admin: 9,
          locale: 'en',
        }),
      ),
    ).toEqual({
      player: player('7'),
      locale: 'en',
      role: 'superadmin',
      lastTournament: null,
    });
  });

  it.each([
    [0, 'player'],
    [5, 'results-manager'],
    [9, 'superadmin'],
  ] as const)(
    "settings: sportbet's admin %i is read as a %s (R-26 amended)",
    (admin, role) => {
      expect(
        sportbetColumns.settings({ player: player('7'), admin, locale: 'lt' }),
      ).toEqual({
        ok: true,
        value: {
          player: player('7'),
          locale: 'lt',
          role,
          lastTournament: null,
        },
      });
    },
  );

  it('stored rows: a negative admin level or an unknown locale is refused', () => {
    expect(
      sportbetColumns.settings({
        player: player('7'),
        admin: -1,
        locale: 'lt',
      }),
    ).toEqual(refuse('bad-admin-level'));
    expect(
      sportbetColumns.settings({ player: player('7'), admin: 0, locale: 'de' }),
    ).toEqual(refuse('bad-locale'));
  });
});

describe('sportbet columns: tournaments', () => {
  const row = {
    id: 3,
    slug: 'euroleague-2026-27',
    name: 'Euroleague 2026/27',
    standings_format: 'euroleague',
    standings_deadline_round: null,
    end_date: '2027-05-23',
    survival_game: 1,
  };

  it('stored rows: a Euroleague tournament reads back with its end date, survival on and its table not final', () => {
    expect(unwrap(sportbetColumns.tournament(row))).toEqual({
      id: 3,
      slug: 'euroleague-2026-27',
      name: 'Euroleague 2026/27',
      format: 'euroleague',
      endsOn: '2027-05-23',
      standingsDeadlineRound: null,
      survival: true,
      standingsTableFinal: false,
    });
  });

  it("stored rows: an admin's deadline round is kept, and survival_game is read with (bool)", () => {
    const tournament = unwrap(
      sportbetColumns.tournament({
        ...row,
        standings_deadline_round: 6,
        survival_game: 0,
      }),
    );
    expect(tournament.standingsDeadlineRound).toBe(roundNo(6));
    expect(tournament.survival).toBe(false);
  });

  it('stored rows: a tournament with no end date reads back with none, as sportbet leaves it optional (R-21)', () => {
    expect(
      unwrap(sportbetColumns.tournament({ ...row, end_date: null })).endsOn,
    ).toBeNull();
  });

  it.each([
    [
      'a football tournament',
      { standings_format: 'football' },
      'format-not-ported',
    ],
    ['an impossible end date', { end_date: '2027-02-30' }, 'bad-end-date'],
    ['an uppercase slug', { slug: 'Euroleague' }, 'bad-slug'],
    ['a blank name', { name: ' ' }, 'bad-name'],
    [
      'a deadline round of 0',
      { standings_deadline_round: 0 },
      'bad-deadline-round',
    ],
    ['an id of 0', { id: 0 }, 'bad-id'],
    ['a negative id', { id: -3 }, 'bad-id'],
    ['a fractional id', { id: 3.5 }, 'bad-id'],
  ] as const)(
    'stored rows: a tournament with %s is refused',
    (_, changes, refusal) => {
      expect(sportbetColumns.tournament({ ...row, ...changes })).toEqual(
        refuse(refusal),
      );
    },
  );
});

describe('sportbet columns: tournament profiles', () => {
  const ROW = {
    status: 'active',
    start_date: '2026-09-30',
    sport: 'basketball',
    description: 'Eurolygos sezonas',
    is_public: 1,
  };

  it("columns: a tournament's status, start date, sport, description and public switch, as sportbet stores them", () => {
    expect(unwrap(sportbetColumns.tournamentProfile(ROW))).toEqual({
      status: 'active',
      startsOn: '2026-09-30',
      sport: 'basketball',
      description: 'Eurolygos sezonas',
      isPublic: true,
    });
  });

  it('columns: is_public 0 is not public; no start date and no description are none', () => {
    expect(
      unwrap(
        sportbetColumns.tournamentProfile({
          ...ROW,
          is_public: 0,
          start_date: null,
          description: null,
        }),
      ),
    ).toEqual({
      status: 'active',
      startsOn: null,
      sport: 'basketball',
      description: null,
      isPublic: false,
    });
  });

  it.each([
    ['bad-status', { ...ROW, status: 'paused' }],
    ['bad-start-date', { ...ROW, start_date: '2026-13-01' }],
  ] as const)('columns: refuses a profile with %s', (refusal, row) => {
    expect(sportbetColumns.tournamentProfile(row)).toEqual(refuse(refusal));
  });
});
