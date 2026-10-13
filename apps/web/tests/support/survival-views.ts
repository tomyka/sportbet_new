import type { SurvivalPickPageData, SurvivalSummaryData } from '@sportbet/db';
import {
  Points,
  type LedgerRound,
  type SummaryRow,
  type SummaryTile,
  type SurvivalCard,
  type SurvivalPickPage,
  type TeamId,
} from '@sportbet/domain';
import { player, roundNo, team, unwrap } from '@sportbet/domain/testing';

// Survival pages for the component tests. The page's rules - which card is
// selectable, the run, the stake - are the domain's (survivalPickPage, its
// own tests); here each state is written out so every mark and line the
// view draws can be named.

export const points = (whole: number): Points => unwrap(Points.whole(whole));

/** The round's teams: id, name. */
export const TEAM_NAMES: ReadonlyMap<TeamId, string> = new Map([
  [team('1'), 'Olympiacos'],
  [team('2'), 'Zalgiris'],
  [team('3'), 'Real Madrid'],
  [team('4'), 'Fenerbahce'],
]);

export const card = (
  id: number,
  opponent: number,
  over: Partial<Omit<SurvivalCard, 'team' | 'opponent'>> = {},
): SurvivalCard => ({
  team: team(String(id)),
  opponent: team(String(opponent)),
  ground: 'home',
  state: { kind: 'open' },
  selectable: true,
  picked: false,
  ...over,
});

/** Two games: 1 v 2 and 3 v 4, every card open. */
const OPEN_CARDS: readonly SurvivalCard[] = [
  card(1, 2, { ground: 'home' }),
  card(2, 1, { ground: 'away' }),
  card(3, 4, { ground: 'home' }),
  card(4, 3, { ground: 'away' }),
];

export const ledger = (
  round: number,
  id: number,
  state: LedgerRound['state'],
  total: number | null,
): LedgerRound => ({
  round: roundNo(round),
  team: team(String(id)),
  state,
  points: total === null ? null : points(total),
  provisional: false,
});

type OpenPage = Extract<SurvivalPickPage, { kind: 'open' }>;

/** Round 3, nothing picked, an empty run: every card open. */
export const openPage = (
  over: Partial<Omit<OpenPage, 'kind'>> = {},
): OpenPage => ({
  kind: 'open',
  round: roundNo(3),
  picked: null,
  verdict: null,
  pickLocked: false,
  choosing: true,
  cards: OPEN_CARDS,
  free: 4,
  used: 0,
  run: [],
  streak: 0,
  runPoints: Points.ZERO,
  stake: { home: 10, away: 12 },
  ...over,
});

export const pageData = (
  page: SurvivalPickPage = openPage(),
  roundName: string | null = '3 turas',
): SurvivalPickPageData => ({ page, teamNames: TEAM_NAMES, roundName });

export const tile = (
  round: number,
  state: SummaryTile['state'],
  over: Partial<Omit<SummaryTile, 'round' | 'state'>> = {},
): SummaryTile => ({
  round: roundNo(round),
  state,
  team: null,
  hidden: false,
  points: null,
  ...over,
});

export const summaryRow = (
  id: string,
  username: string,
  over: Partial<Omit<SummaryRow, 'player' | 'username'>> = {},
): SummaryRow => ({
  rank: 1,
  player: player(id),
  username,
  initials: username.slice(0, 1).toUpperCase(),
  me: false,
  tiles: [tile(1, 'none'), tile(2, 'none')],
  streak: 0,
  total: Points.ZERO,
  provisional: false,
  ...over,
});

/** Rounds 1 and 2: round 1 named "Pirmas turas", round 2 left without a name. */
export const summaryData = (
  rows: readonly SummaryRow[],
  rounds: readonly number[] = [1, 2],
): SurvivalSummaryData => ({
  summary: { rounds: rounds.map(roundNo), rows },
  teamNames: TEAM_NAMES,
  roundNames: new Map([[roundNo(1), 'Pirmas turas']]),
});
