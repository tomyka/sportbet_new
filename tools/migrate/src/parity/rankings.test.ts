import {
  PlayerStatus,
  recalculateTournament,
  sportbetRules,
  tournamentId,
  type PlayerId,
  type TournamentId,
} from '@sportbet/domain';
import {
  GOLDEN,
  GOLDEN_POINTS,
  goldenInputs,
  NAME_IDS,
  unwrap,
} from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  compareRankings,
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

/** sportbet's own leaderboard of the golden league: 1934.00, 978.50, 427.50. */
const SPORTBET: readonly OldAppRank[] = [
  { league: 2, player: who('ada'), rank: 1, totalCents: 193_400 },
  { league: 2, player: who('ben'), rank: 2, totalCents: 97_850 },
  { league: 2, player: who('cai'), rank: 3, totalCents: 42_750 },
];

const input = (
  oldApp: readonly OldAppRank[],
  statuses: ReadonlyMap<PlayerId, PlayerStatus> = STATUSES,
): RankingsInput => ({
  tournament: GOLDEN_EL,
  leagues: [{ id: 2, members: GOLDEN.players.map(who) }],
  totals,
  statuses,
  usernames: new Map<PlayerId, string>(
    GOLDEN.players.map((name) => [who(name), name]),
  ),
  oldApp,
});

describe('compareRankings', () => {
  it("agrees with sportbet's leaderboard of the golden league: no difference, dan listed on neither", () => {
    expect(compareRankings(input(SPORTBET))).toEqual([
      { league: 2, players: 3, differences: [] },
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
    expect(compareRankings(input(swapped))[0]?.differences).toEqual([
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
    expect(compareRankings(input(off))[0]?.differences).toEqual([
      {
        player: who('ada'),
        username: 'ada',
        newCode: { rank: 1, totalCents: 193_400 },
        oldApp: { rank: 1, totalCents: 193_401 },
      },
    ]);
  });

  it('lists a player only one side ranks', () => {
    const withDan = [
      ...SPORTBET,
      { league: 2, player: who('dan'), rank: 4, totalCents: 3_400 },
    ];
    expect(compareRankings(input(withDan))[0]).toEqual({
      league: 2,
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
    const withOther = [
      ...SPORTBET,
      { league: 1, player: who('ada'), rank: 1, totalCents: 8_000 },
    ];
    expect(compareRankings(input(withOther))).toEqual([
      { league: 2, players: 3, differences: [] },
    ]);
  });

  it("asks the domain who is listed (RA-4): sportbet's one switch unlists a player switched off in another tournament", () => {
    const caiOffElsewhere = new Map(STATUSES).set(
      who('cai'),
      statusOf([OTHER]),
    );
    const [league] = compareRankings(input(SPORTBET, caiOffElsewhere));
    expect(league?.differences).toEqual([
      {
        player: who('cai'),
        username: 'cai',
        newCode: null,
        oldApp: { rank: 3, totalCents: 42_750 },
      },
    ]);
  });
});
