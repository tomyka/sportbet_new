import { describe, expect, it } from 'vitest';
import { isOpenForRegistrationWindowAt } from '../joining/joining';
import { Game } from '../round/game';
import type { RegistrationWindow } from '../round/season';
import { ruledRules, sportbetRules } from '../rules/rule-set';
import { at, gameNo, roundNo, score, team, unwrap } from '../testing';
import {
  canSeeTournament,
  cardAction,
  hubGroup,
  isAccepted,
  nextOpenGames,
  orderHub,
  registrationFormStep,
  registrationSubmitStep,
  tournamentPageAction,
  widgetsShown,
  type HubGroup,
} from './hub';

// sportbet's Tournament::effectiveStatus and orderByEffectiveStatus,
// hub.blade.php's buttons and widgets, show.blade.php's header button and
// TournamentController::registerForm, with R-50, R-53 and R-55.

const NOW = at('2026-10-06T12:00:00Z');

/** Two games, neither scored; no end date; closes at the first game (sportbet) or round 5 (ruled). */
function window(over: Partial<RegistrationWindow> = {}): RegistrationWindow {
  return {
    endsAt: null,
    games: 2,
    allScored: false,
    firstTipOff: at('2026-10-02T18:00:00Z'),
    standingsDeadline: at('2026-11-01T18:00:00Z'),
    ...over,
  };
}

const group = (
  status: 'upcoming' | 'active' | 'finished',
  startsOn: string | null,
  over: Partial<RegistrationWindow>,
  rules = sportbetRules,
): HubGroup =>
  hubGroup({
    profile: { status, startsOn },
    window: window(over),
    now: NOW,
    rules,
  });

describe('hubGroup (both sets)', () => {
  it.each([sportbetRules, ruledRules])(
    'hub ($name): active while the admin says active and no date says otherwise',
    (rules) => {
      expect(group('active', null, {}, rules)).toBe('active');
      expect(group('active', '2026-10-06', {}, rules)).toBe('active');
    },
  );

  it.each([sportbetRules, ruledRules])(
    'hub ($name): upcoming when the admin says so, or its start date is after today in UTC',
    (rules) => {
      expect(group('upcoming', null, {}, rules)).toBe('upcoming');
      expect(group('active', '2026-10-07', {}, rules)).toBe('upcoming');
    },
  );
});

describe('hubGroup (sportbet): Tournament::effectiveStatus', () => {
  it('hub (sportbet): finished when the admin marks it finished', () => {
    expect(group('finished', null, {})).toBe('finished');
  });

  it('hub (sportbet): finished when it has games and every one is scored', () => {
    expect(group('active', null, { allScored: true })).toBe('finished');
  });

  it('hub (sportbet): a tournament with no games has not finished them', () => {
    expect(group('active', null, { games: 0, allScored: true })).toBe('active');
  });

  it('hub (sportbet): finished from the day after its end date (end_date < today), not on it', () => {
    expect(group('active', null, { endsAt: at('2026-10-06T00:00:00Z') })).toBe(
      'finished',
    );
    expect(group('active', null, { endsAt: at('2026-10-07T00:00:00Z') })).toBe(
      'active',
    );
  });

  it('hub (sportbet): finished wins over upcoming', () => {
    expect(group('upcoming', '2026-12-01', { allScored: true })).toBe(
      'finished',
    );
  });
});

describe('hubGroup (ruled): R-55 follows R-21', () => {
  it('hub (ruled, R-55): an admin marking it finished does not finish it', () => {
    expect(group('finished', null, {}, ruledRules)).toBe('active');
  });

  it('hub (ruled, R-55): every game scored without an end date does not finish it', () => {
    expect(group('active', null, { allScored: true }, ruledRules)).toBe(
      'active',
    );
  });

  it('hub (ruled, R-55): an end date passed with a game unscored does not finish it', () => {
    expect(
      group('active', null, { endsAt: at('2026-10-06T00:00:00Z') }, ruledRules),
    ).toBe('active');
  });

  it('hub (ruled, R-55): finished once its end date has passed and every game is scored', () => {
    expect(
      group(
        'active',
        null,
        { endsAt: at('2026-10-06T00:00:00Z'), allScored: true },
        ruledRules,
      ),
    ).toBe('finished');
  });
});

describe('orderHub: Tournament::orderByEffectiveStatus', () => {
  it('hub: active, then upcoming, then finished; by start date with none first; then by id', () => {
    const places = [
      { id: 1, group: 'finished', startsOn: null },
      { id: 2, group: 'upcoming', startsOn: '2027-10-01' },
      { id: 3, group: 'active', startsOn: '2026-10-01' },
      { id: 4, group: 'active', startsOn: null },
      { id: 5, group: 'upcoming', startsOn: '2026-12-01' },
      { id: 6, group: 'active', startsOn: '2026-10-01' },
    ] as const;
    expect(orderHub(places).map(({ id }) => id)).toEqual([4, 3, 6, 5, 2, 1]);
  });
});

describe('canSeeTournament: R-50', () => {
  const seen = (
    isPublic: boolean,
    member: boolean,
    isAdmin: boolean,
    rules = ruledRules,
  ) => canSeeTournament({ isPublic, member, isAdmin, rules });

  it('hub (sportbet): every tournament is listed, public or not', () => {
    expect(seen(false, false, false, sportbetRules)).toBe(true);
  });

  it('hub (ruled, R-50): a non-public tournament is seen by its players and admins only', () => {
    expect(seen(true, false, false)).toBe(true);
    expect(seen(false, false, false)).toBe(false);
    expect(seen(false, true, false)).toBe(true);
    expect(seen(false, false, true)).toBe(true);
  });
});

describe("cardAction: hub.blade.php's button", () => {
  it.each(
    (
      [
        ['active', true, true, false, 'play'],
        ['upcoming', true, true, false, 'join'],
        ['finished', true, true, false, 'view'],
        ['active', true, false, true, 'register'],
        ['upcoming', true, false, true, 'register'],
        ['active', true, false, false, null],
        ['upcoming', true, false, false, null],
        ['finished', true, false, true, 'view-results'],
        ['active', false, false, true, null],
        ['upcoming', false, false, true, null],
        ['finished', false, false, false, 'view-results'],
      ] as const
    ).map(([group, signedIn, member, registrationOpen, action]) => ({
      group,
      signedIn,
      member,
      registrationOpen,
      action,
    })),
  )(
    'hub: $group, signed in $signedIn, member $member, registration open $registrationOpen -> $action',
    ({ group, signedIn, member, registrationOpen, action }) => {
      expect(cardAction({ group, signedIn, member, registrationOpen })).toBe(
        action,
      );
    },
  );
});

describe("widgetsShown: hub.blade.php's widgets", () => {
  it('hub: an upcoming card explains the game and lists its next games, to everyone', () => {
    for (const signedIn of [true, false]) {
      expect(widgetsShown('upcoming', signedIn)).toEqual({
        howItWorks: true,
        upcomingGames: true,
        guestPanels: false,
      });
    }
  });

  it('hub: an active card shows a guest the leaders, medals, next games and stats, and a player nothing', () => {
    expect(widgetsShown('active', false)).toEqual({
      howItWorks: false,
      upcomingGames: true,
      guestPanels: true,
    });
    expect(widgetsShown('active', true)).toEqual({
      howItWorks: false,
      upcomingGames: false,
      guestPanels: false,
    });
  });

  it('hub: a finished card shows nothing', () => {
    expect(widgetsShown('finished', false)).toEqual({
      howItWorks: false,
      upcomingGames: false,
      guestPanels: false,
    });
  });
});

describe("tournamentPageAction: show.blade.php's header button", () => {
  it.each([
    [false, false, true, 'sign-in'],
    [true, false, true, 'register'],
    [true, false, false, 'create-league'],
    [true, true, true, 'create-league'],
  ] as const)(
    'tournament page: signed in %s, member %s, open %s -> %s',
    (signedIn, member, registrationOpen, action) => {
      expect(tournamentPageAction({ signedIn, member, registrationOpen })).toBe(
        action,
      );
    },
  );
});

describe('registrationFormStep: TournamentController::registerForm, R-53', () => {
  it('registration form (R-53): a member is taken in, open or closed', () => {
    expect(registrationFormStep({ member: true, registrationOpen: true })).toBe(
      'member',
    );
    expect(
      registrationFormStep({ member: true, registrationOpen: false }),
    ).toBe('member');
  });

  it('registration form: anyone else gets the form while registration is open, else "closed"', () => {
    expect(
      registrationFormStep({ member: false, registrationOpen: true }),
    ).toBe('open');
    expect(
      registrationFormStep({ member: false, registrationOpen: false }),
    ).toBe('closed');
  });
});

describe('nextOpenGames: "Artėjančios rungtynės" on the hub', () => {
  const game = (
    id: number,
    tipOff: string,
    over: Partial<{
      result: ReturnType<typeof score>;
      lockedSince: ReturnType<typeof at>;
      postponed: boolean;
    }> = {},
  ) =>
    unwrap(
      Game.stored({
        id: gameNo(id),
        round: roundNo(1),
        home: team('ZAL'),
        away: team('OLY'),
        tipOff: at(tipOff),
        result: over.result ?? null,
        recordedWinner: null,
        lockedSince: over.lockedSince ?? null,
        postponed: over.postponed ?? false,
      }),
    );

  it('hub: the next three games open for predictions (Game.isOpenAt), by tip-off then id', () => {
    const games = [
      game(5, '2026-10-20T18:00:00Z'),
      game(4, '2026-10-12T18:00:00Z'),
      game(3, '2026-10-12T18:00:00Z'),
      game(2, '2026-10-30T18:00:00Z'),
      game(1, '2026-10-25T18:00:00Z'),
    ];
    expect(nextOpenGames(games, NOW).map(({ id }) => id)).toEqual([3, 4, 5]);
  });

  it('hub: leaves out a scored, a locked, a postponed and a started game', () => {
    const games = [
      game(1, '2026-10-12T18:00:00Z', { result: score(80, 70) }),
      game(2, '2026-10-12T18:00:00Z', {
        lockedSince: at('2026-10-05T10:00:00Z'),
      }),
      game(3, '2026-10-12T18:00:00Z', { postponed: true }),
      game(4, '2026-10-06T12:00:00Z'),
      game(5, '2026-10-06T12:00:01Z'),
    ];
    expect(nextOpenGames(games, NOW).map(({ id }) => id)).toEqual([5]);
  });
});

describe('registrationSubmitStep: TournamentController::register, R-53', () => {
  const step = (
    confirmed: boolean,
    member: boolean,
    registrationOpen: boolean,
  ) => registrationSubmitStep({ confirmed, member, registrationOpen });

  it('registration submit: an unconfirmed form is sent back first, member or not, open or closed', () => {
    for (const member of [true, false]) {
      for (const open of [true, false]) {
        expect(step(false, member, open)).toBe('confirm-required');
      }
    }
  });

  it('registration submit (R-53): a member is taken in, before and after registration closes', () => {
    expect(step(true, true, true)).toBe('take-in');
    expect(step(true, true, false)).toBe('take-in');
  });

  it('registration submit: a newcomer joins while registration is open, else it is closed', () => {
    expect(step(true, false, true)).toBe('join');
    expect(step(true, false, false)).toBe('closed');
  });

  it.each([
    ['sportbet', sportbetRules, 'closed'],
    ['ruled', ruledRules, 'join'],
  ] as const)(
    'registration submit (%s): a newcomer after the first game, before the standings deadline (PL-2, R-8) -> %s',
    (_name, rules, expected) => {
      const registrationOpen = isOpenForRegistrationWindowAt(
        window(),
        NOW,
        rules,
      );
      expect(
        registrationSubmitStep({
          confirmed: true,
          member: false,
          registrationOpen,
        }),
      ).toBe(expected);
    },
  );
});

describe("isAccepted: Laravel's accepted rule", () => {
  it.each(['1', 'on', 'yes', 'true'])(
    'registration submit: %s confirms',
    (value) => {
      expect(isAccepted(value)).toBe(true);
    },
  );

  it.each([
    null,
    '',
    '0',
    'off',
    'no',
    'false',
    'YES',
    'True',
    ' 1',
    'checked',
  ])('registration submit: %s does not confirm', (value) => {
    expect(isAccepted(value)).toBe(false);
  });
});
