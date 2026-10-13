import type { ResultsSummaryData } from '@sportbet/db';
import type {
  ChartLine,
  CompareSide,
  Comparison,
  PlayerId,
  PointsChart,
  ResultsSummary,
  StandingsBadge,
  StandingsCell,
  StandingsSummary,
  StandingsVerdict,
  SummaryCell,
  SummaryColumn,
  SummaryGame,
  SummaryRound,
  TeamId,
} from '@sportbet/domain';
import { gameNo, player, roundNo, team } from '@sportbet/domain/testing';

// Summary pages for the component tests. What each page shows - verdicts,
// sums, order, the popovers' numbers - is the domain's (its own tests);
// here each state is written out so every mark and line the views draw can
// be named.

const TEAM_NAMES: ReadonlyMap<TeamId, string> = new Map([
  [team('1'), 'Olympiacos'],
  [team('2'), 'Zalgiris'],
  [team('3'), 'Real Madrid'],
  [team('4'), 'Fenerbahce'],
]);

export const JONAS = player('1');
export const ZUKAUSKAS = player('2');

export const column = (id: PlayerId, username: string): SummaryColumn => ({
  player: id,
  username,
});

export const cell = (
  score: { home: number; away: number } | null,
  verdict: SummaryCell['verdict'],
  points: SummaryCell['points'] = null,
): SummaryCell => ({ score, verdict, points });

export const scored = (
  totalCents: number,
  over: Partial<NonNullable<SummaryCell['points']>> = {},
): NonNullable<SummaryCell['points']> => ({
  totalCents,
  winnerCents: 0,
  marginCents: 0,
  bingoCents: 0,
  serijaCents: 0,
  ...over,
});

export const summaryGame = (
  id: number,
  [home, away]: readonly [home: number, away: number],
  result: SummaryGame['result'],
  cells: readonly (readonly [PlayerId, SummaryCell])[] = [],
): SummaryGame => ({
  game: gameNo(id),
  home: team(String(home)),
  away: team(String(away)),
  result,
  cells: new Map(cells),
});

export const summaryRound = (
  [round, name]: readonly [round: number, name: string],
  open: boolean,
  games: readonly SummaryGame[],
  totals: readonly (readonly [PlayerId, number])[] = [],
): SummaryRound => ({
  round: roundNo(round),
  name,
  open,
  totalCents: new Map(totals),
  games,
});

export const resultsData = (
  columns: ResultsSummary['columns'],
  rounds: readonly SummaryRound[],
  totals: readonly (readonly [PlayerId, number])[] = [],
): ResultsSummaryData => ({
  summary: { columns, rounds, totalCents: new Map(totals) },
  teamNames: TEAM_NAMES,
});

export const badge = (
  shown: string,
  verdict: StandingsVerdict,
  popover: StandingsBadge['popover'] = null,
): StandingsBadge => ({ shown, verdict, popover });

export const standingsCell = (
  over: Partial<StandingsCell> = {},
): StandingsCell => ({
  place: badge('3', 'pending'),
  playOffs: badge('-', 'none'),
  finalFour: badge('-', 'none'),
  final: badge('-', 'none'),
  totalCents: 0,
  totalLines: [],
  ...over,
});

export const standingsData = (
  columns: StandingsSummary['columns'],
  teams: readonly (readonly [
    number,
    string,
    readonly (readonly [PlayerId, StandingsCell])[],
  ])[],
): StandingsSummary => ({
  columns,
  teams: teams.map(([id, name, cells]) => ({
    team: team(String(id)),
    name,
    cells: new Map(cells),
  })),
});

export const chartLine = (
  id: PlayerId,
  username: string,
  series: number,
  totalsCents: readonly number[],
): ChartLine => ({ player: id, username, series, totalsCents });

export const chartData = (
  lines: readonly ChartLine[],
  labels: readonly string[],
  over: Partial<Omit<PointsChart, 'lines' | 'games'>> = {},
): PointsChart => ({
  games: labels.map((label, index) => ({ game: gameNo(index + 1), label })),
  count:
    labels.length === 1 ? '1 rungtynės' : `${String(labels.length)} rungtynių`,
  drawPoints: true,
  lines,
  ...over,
});

export const side = (
  id: PlayerId,
  username: string,
  over: Partial<Omit<CompareSide, 'player' | 'username'>> = {},
): CompareSide => ({
  player: id,
  username,
  rank: 1,
  totalCents: 0,
  matchCents: 0,
  standingsCents: 0,
  survivalCents: 0,
  serijaCents: 0,
  bingo: 0,
  ...over,
});

export const comparison = (
  me: CompareSide,
  them: CompareSide,
  over: Partial<Omit<Comparison, 'me' | 'them'>> = {},
): Comparison => ({ me, them, record: null, rounds: [], ...over });
