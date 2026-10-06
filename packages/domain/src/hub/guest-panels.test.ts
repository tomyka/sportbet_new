import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { Points } from '../points/points';
import { StandingsPoints } from '../points/standings-points';
import type { TournamentTotal } from '../recalculation/recalculation';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import type { PlayerId } from '../shared/ids';
import { player, tournamentKey, unwrap } from '../testing';
import { guestPanels, type GuestPanelsInput } from './guest-panels';

// The hub's guest panels: PlayerTotals::forTournament(...)->limit(5),
// ranked (the players with a points row, listed, the first five), and
// MedalTally::forTournament (the listed players' final places by team).

const TOURNAMENT = tournamentKey('3');

const total = (who: PlayerId, match: number): TournamentTotal => ({
  player: who,
  match: unwrap(Points.ofHundredths(match * 100)),
  serija: Points.ZERO,
  standings: StandingsPoints.ZERO,
  survival: Points.ZERO,
});

const NAMES = ['ada', 'ben', 'cai', 'dan', 'eve', 'fay'] as const;
const IDS = new Map(
  NAMES.map((name, index) => [name, player(String(index + 1))]),
);
const id = (name: (typeof NAMES)[number]): PlayerId => {
  const found = IDS.get(name);
  if (found === undefined) throw new Error(name);
  return found;
};

const switchedOff = (rules: RuleSet) =>
  unwrap(
    PlayerStatus.stored(
      {
        switchedOffIn: new Set([TOURNAMENT]),
        adminHidden: false,
        fillIns: new Map(),
      },
      rules,
    ),
  );

const input = (
  rules: RuleSet,
  over: Partial<GuestPanelsInput> = {},
): GuestPanelsInput => ({
  tournament: TOURNAMENT,
  totals: NAMES.map((name, index) => total(id(name), 60 - index * 10)),
  scored: new Set(NAMES.map(id)),
  usernames: new Map(NAMES.map((name) => [id(name), name])),
  statuses: new Map(NAMES.map((name) => [id(name), PlayerStatus.NEW])),
  finalPlaces: [],
  rules,
  ...over,
});

describe.each([sportbetRules, ruledRules])('guestPanels ($name)', (rules) => {
  it('leaders: the first five scored, listed players by the Lyderiai order, with their rank and total', () => {
    const { leaders } = guestPanels(input(rules));
    expect(leaders).toEqual([
      { rank: 1, username: 'ada', totalCents: 6000 },
      { rank: 2, username: 'ben', totalCents: 5000 },
      { rank: 3, username: 'cai', totalCents: 4000 },
      { rank: 4, username: 'dan', totalCents: 3000 },
      { rank: 5, username: 'eve', totalCents: 2000 },
    ]);
  });

  it('leaders: a player with no match points row is left out, whatever their total (PlayerTotals::eligible)', () => {
    const { leaders } = guestPanels(
      input(rules, { scored: new Set([id('ben'), id('cai')]) }),
    );
    expect(leaders.map(({ username }) => username)).toEqual(['ben', 'cai']);
  });

  it('leaders and medals: a player switched off in the tournament is not listed (RA-4)', () => {
    const { leaders, medals } = guestPanels(
      input(rules, {
        statuses: new Map(
          NAMES.map((name) => [
            id(name),
            name === 'ada' ? switchedOff(rules) : PlayerStatus.NEW,
          ]),
        ),
        finalPlaces: [
          { player: id('ada'), team: 'Real', finalPlace: 1 },
          { player: id('ben'), team: 'Olympiacos', finalPlace: 1 },
        ],
      }),
    );
    expect(leaders[0]?.username).toBe('ben');
    expect(medals).toEqual([
      { team: 'Olympiacos', first: 1, second: 0, third: 0, fourth: 0 },
    ]);
  });

  it('leaders and medals: a player with no status is not listed', () => {
    const { leaders, medals } = guestPanels(
      input(rules, {
        statuses: new Map(),
        finalPlaces: [{ player: id('ada'), team: 'Real', finalPlace: 1 }],
      }),
    );
    expect(leaders).toEqual([]);
    expect(medals).toEqual([]);
  });

  it('medals: the listed players final places counted by team (tallyMedals)', () => {
    const { medals } = guestPanels(
      input(rules, {
        finalPlaces: [
          { player: id('ada'), team: 'Real', finalPlace: 1 },
          { player: id('ben'), team: 'Real', finalPlace: 2 },
          { player: id('cai'), team: 'Olympiacos', finalPlace: 1 },
          { player: id('dan'), team: 'Real', finalPlace: 1 },
        ],
      }),
    );
    expect(medals).toEqual([
      { team: 'Real', first: 2, second: 1, third: 0, fourth: 0 },
      { team: 'Olympiacos', first: 1, second: 0, third: 0, fourth: 0 },
    ]);
  });
});

describe('guestPanels: an impossible state', () => {
  it('a scored player without a username throws', () => {
    expect(() =>
      guestPanels(input(ruledRules, { usernames: new Map() })),
    ).toThrow('guestPanels: a scored player has no username');
  });
});
