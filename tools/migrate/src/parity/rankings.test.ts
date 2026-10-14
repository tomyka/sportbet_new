import {
  PlayerStatus,
  recalculateTournament,
  sportbetRules,
  tournamentId,
  type League,
  type LeagueMember,
  type PlayerId,
  type TournamentId,
} from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  leagueNo,
  NAME_IDS,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  compareLeaderboard,
  compareRankings,
  GUEST_LEVELS,
  type GuestLevel,
  type LeaderboardInput,
  type OldAppBoardRank,
  type OldAppRank,
  type RankingsInput,
} from './rankings';

const { totals } = unwrap(
  recalculateTournament(
    goldenInputs({
      game_odds: GOLDEN_POINTS.game_odds,
      point_survivals: GOLDEN_POINTS.point_survivals,
    }),
    sportbetRules,
  ),
);
const who = (name: (typeof GOLDEN.players)[number]) => NAME_IDS.player(name);

const GOLDEN_EL = unwrap(tournamentId('2'));
const OTHER = unwrap(tournamentId('1'));

/** A player's status, switched off in `off` (sportbetRules: one lifetime switch). */
const statusOf = (off: readonly TournamentId[]) =>
  unwrap(
    PlayerStatus.stored(
      { switchedOffIn: new Set(off), adminHidden: false, fillIns: new Map() },
      sportbetRules,
    ),
  );

/** dan is switched off, as in the synthetic dump: sportbet lists him nowhere. */
const STATUSES: ReadonlyMap<PlayerId, PlayerStatus> = new Map(
  GOLDEN.players.map((name) => [
    who(name),
    statusOf(name === 'dan' ? [GOLDEN_EL] : []),
  ]),
);

/**
 * sportbet's own leaderboard of the golden league: 1934.00, 978.50, 427.50,
 * at both levels, as nobody in it is a guest.
 */
const SPORTBET: readonly OldAppRank[] = GUEST_LEVELS.flatMap((level) => [
  { league: 2, level, player: who('ada'), rank: 1, totalCents: 193_400 },
  { league: 2, level, player: who('ben'), rank: 2, totalCents: 97_850 },
  { league: 2, level, player: who('cai'), rank: 3, totalCents: 42_750 },
]);

type Name = (typeof GOLDEN.players)[number];

/** The golden league, with `guests` among its members flagged as guests. */
const goldenLeague = (guests: readonly Name[]) => ({
  league: {
    id: leagueNo(2),
    tournament: GOLDEN_EL,
    name: 'Golden league',
    description: null,
    kind: { public: true },
    fee: { base: null, penaltyStep: null, reward: null },
    payment: { beneficiary: null, iban: null, note: null },
    createdAt: null,
  } satisfies League,
  members: GOLDEN.players.map((name, index): LeagueMember => ({
    id: index + 1,
    league: leagueNo(2),
    player: who(name),
    isAdmin: false,
    isGuest: guests.includes(name),
    paid: null,
    joinedAt: null,
  })),
});

const input = (
  oldApp: readonly OldAppRank[],
  statuses: ReadonlyMap<PlayerId, PlayerStatus> = STATUSES,
  guests: readonly Name[] = [],
): RankingsInput => ({
  tournament: GOLDEN_EL,
  leagues: [goldenLeague(guests)],
  totals,
  statuses,
  usernames: new Map<PlayerId, string>(
    GOLDEN.players.map((name) => [who(name), name]),
  ),
  oldApp,
});

/** The comparison at one level. */
const at = (rankings: ReturnType<typeof compareRankings>, level: GuestLevel) =>
  rankings.find((each) => each.level === level);

describe('compareRankings', () => {
  it("agrees with sportbet's leaderboard of the golden league at both levels: no difference, dan listed on neither", () => {
    expect(compareRankings(input(SPORTBET))).toEqual([
      { league: 2, level: 'every-member', players: 3, differences: [] },
      { league: 2, level: 'full-member', players: 3, differences: [] },
    ]);
  });

  it('lists each player whose rank differs, with both ranks', () => {
    const swapped = SPORTBET.map((row) =>
      row.player === who('ben')
        ? { ...row, rank: 3 }
        : row.player === who('cai')
          ? { ...row, rank: 2 }
          : row,
    );
    expect(
      at(compareRankings(input(swapped)), 'every-member')?.differences,
    ).toEqual([
      {
        player: who('ben'),
        username: 'ben',
        newCode: { rank: 2, totalCents: 97_850 },
        oldApp: { rank: 3, totalCents: 97_850 },
      },
      {
        player: who('cai'),
        username: 'cai',
        newCode: { rank: 3, totalCents: 42_750 },
        oldApp: { rank: 2, totalCents: 42_750 },
      },
    ]);
  });

  it('compares totals to the cent (12): 1934.00 and 1934.01 differ', () => {
    const off = SPORTBET.map((row) =>
      row.player === who('ada') ? { ...row, totalCents: 193_401 } : row,
    );
    expect(at(compareRankings(input(off)), 'full-member')?.differences).toEqual(
      [
        {
          player: who('ada'),
          username: 'ada',
          newCode: { rank: 1, totalCents: 193_400 },
          oldApp: { rank: 1, totalCents: 193_401 },
        },
      ],
    );
  });

  it('lists a player only one side ranks', () => {
    const withDan: OldAppRank[] = [
      ...SPORTBET,
      {
        league: 2,
        level: 'every-member',
        player: who('dan'),
        rank: 4,
        totalCents: 3_400,
      },
    ];
    expect(at(compareRankings(input(withDan)), 'every-member')).toEqual({
      league: 2,
      level: 'every-member',
      players: 4,
      differences: [
        {
          player: who('dan'),
          username: 'dan',
          newCode: null,
          oldApp: { rank: 4, totalCents: 3_400 },
        },
      ],
    });
  });

  it("ranks a league on its own tournament's totals only (11): another league's rows are not its", () => {
    const withOther: OldAppRank[] = [
      ...SPORTBET,
      {
        league: 1,
        level: 'every-member',
        player: who('ada'),
        rank: 1,
        totalCents: 8_000,
      },
    ];
    expect(
      compareRankings(input(withOther)).map((each) => each.differences),
    ).toEqual([[], []]);
  });

  it("asks the domain who is listed (RA-4): sportbet's one switch unlists a player switched off in another tournament", () => {
    const caiOffElsewhere = new Map(STATUSES).set(
      who('cai'),
      statusOf([OTHER]),
    );
    const rankings = compareRankings(input(SPORTBET, caiOffElsewhere));
    for (const level of GUEST_LEVELS) {
      expect(at(rankings, level)?.differences).toEqual([
        {
          player: who('cai'),
          username: 'cai',
          newCode: null,
          oldApp: { rank: 3, totalCents: 42_750 },
        },
      ]);
    }
  });

  describe('a guest member (R-87)', () => {
    /** ben is a guest: absent at full-member level, there cai is 2nd; at every-member level all three. */
    const BEN_A_GUEST = SPORTBET.filter(
      (row) => row.level === 'every-member' || row.player !== who('ben'),
    ).map((row) =>
      row.level === 'full-member' && row.player === who('cai')
        ? { ...row, rank: 2 }
        : row,
    );

    it('absent at level 0 on both sides is no difference, at either level', () => {
      expect(
        compareRankings(input(BEN_A_GUEST, STATUSES, ['ben'])).map(
          (each) => each.differences,
        ),
      ).toEqual([[], []]);
    });

    it('present on the new side only at full-member level is a difference, and ranks the others down', () => {
      const rankings = compareRankings(input(BEN_A_GUEST, STATUSES, []));
      expect(at(rankings, 'every-member')?.differences).toEqual([]);
      expect(
        at(rankings, 'full-member')?.differences.map(
          ({ username, newCode, oldApp }) => [username, newCode, oldApp],
        ),
      ).toEqual([
        ['ben', { rank: 2, totalCents: 97_850 }, null],
        [
          'cai',
          { rank: 3, totalCents: 42_750 },
          { rank: 2, totalCents: 42_750 },
        ],
      ]);
    });

    it('present on the old side only at full-member level is a difference', () => {
      const rankings = compareRankings(input(SPORTBET, STATUSES, ['ben']));
      expect(at(rankings, 'every-member')?.differences).toEqual([]);
      expect(
        at(rankings, 'full-member')?.differences.map(
          ({ username, newCode }) => [username, newCode],
        ),
      ).toEqual([
        ['cai', { rank: 2, totalCents: 42_750 }],
        ['ben', null],
      ]);
    });
  });
});

describe('compareLeaderboard', () => {
  const points = unwrap(
    recalculateTournament(
      goldenInputs({
        game_odds: GOLDEN_POINTS.game_odds,
        point_survivals: GOLDEN_POINTS.point_survivals,
      }),
      sportbetRules,
    ),
  );

  /** sportbet's /leaderboard of the golden scenario: match + serija, 427.50, 260.00, 186.50. */
  const BOARD: readonly OldAppBoardRank[] = [
    { player: who('cai'), rank: 1, totalCents: 42_750 },
    { player: who('ada'), rank: 2, totalCents: 26_000 },
    { player: who('ben'), rank: 3, totalCents: 18_650 },
  ];

  const boardInput = (
    oldApp: readonly OldAppBoardRank[],
    statuses: ReadonlyMap<PlayerId, PlayerStatus> = STATUSES,
  ): LeaderboardInput => ({
    tournaments: [{ tournament: GOLDEN_EL, points, statuses, isPublic: true }],
    usernames: new Map<PlayerId, string>(
      GOLDEN.players.map((name) => [who(name), name]),
    ),
    oldApp,
  });

  it("agrees with sportbet's /leaderboard of the golden scenario: match + serija, no difference", () => {
    expect(compareLeaderboard(boardInput(BOARD))).toEqual({
      players: 3,
      differences: [],
    });
  });

  it('lists each player whose rank or total differs, or whom one side lists only', () => {
    const differ = [
      { player: who('cai'), rank: 1, totalCents: 42_751 },
      { player: who('ada'), rank: 2, totalCents: 26_000 },
      { player: who('ben'), rank: 3, totalCents: 18_650 },
      { player: who('dan'), rank: 4, totalCents: 0 },
    ];
    expect(compareLeaderboard(boardInput(differ))).toEqual({
      players: 4,
      differences: [
        {
          player: who('cai'),
          username: 'cai',
          newCode: { rank: 1, totalCents: 42_750 },
          oldApp: { rank: 1, totalCents: 42_751 },
        },
        {
          player: who('dan'),
          username: 'dan',
          newCode: null,
          oldApp: { rank: 4, totalCents: 0 },
        },
      ],
    });
  });

  it("follows sportbet's one switch (R-77's sportbet side): a player switched off anywhere is not on it", () => {
    const caiOff = new Map(STATUSES).set(who('cai'), statusOf([OTHER]));
    expect(
      compareLeaderboard(boardInput(BOARD, caiOff)).differences.map(
        ({ username, newCode }) => [username, newCode],
      ),
    ).toEqual([
      ['ada', { rank: 1, totalCents: 26_000 }],
      ['ben', { rank: 2, totalCents: 18_650 }],
      ['cai', null],
    ]);
  });
});
