import type {
  Dashboard,
  DashboardMe,
  LeagueTable,
  LeagueTableRow,
} from '@sportbet/db';
import {
  gameId,
  playerId,
  roundNumber,
  type GameId,
  type HistoryEntry,
  type PlayerId,
  type RoundNumber,
} from '@sportbet/domain';

/** A player id for a component test. */
export function player(value: string): PlayerId {
  const id = playerId(value);
  if (!id.ok) throw new Error(`player: ${value} is not an id`);
  return id.value;
}

/** A game id for a component test. */
export function game(value: number): GameId {
  const id = gameId(value);
  if (!id.ok) throw new Error(`game: ${String(value)} is not an id`);
  return id.value;
}

/** A round number for a component test. */
export function round(value: number): RoundNumber {
  const number = roundNumber(value);
  if (!number.ok) throw new Error(`round: ${String(value)} is not a round`);
  return number.value;
}

/** A history of `ranks`, one scored game each, 10.0 gained at every game. */
export function historyOf(...ranks: readonly number[]): HistoryEntry[] {
  return ranks.map((rank, index) => ({
    game: game(index + 1),
    totalCents: (index + 1) * 1000,
    gainedCents: 1000,
    rank,
  }));
}

/** A league table row for `username`, ranked `rank`, with no history. */
export function tableRow(
  username: string,
  rank: number,
  overrides: Partial<LeagueTableRow> = {},
): LeagueTableRow {
  return {
    player: player(username),
    username,
    rank,
    totalCents: 10_000 - rank * 100,
    matchCents: 8_000,
    serijaCents: 0,
    standingsCents: 0,
    survivalCents: 0,
    bingo: 0,
    stages: { place: 0, playOffs: 0, finalFour: 0, final: 0 },
    history: [],
    ...overrides,
  };
}

/** A table of `count` players named p1, p2, ..., ranked in that order. */
export function tableOf(count: number, survival = false): LeagueTable {
  return {
    survival,
    rows: Array.from({ length: count }, (_, index) =>
      tableRow(`p${String(index + 1)}`, index + 1),
    ),
  };
}

/** Jonas's own place: third, up two over five games, two bingos, a run of four. */
export const ME: DashboardMe = {
  row: tableRow('jonas', 3, { totalCents: 7_890, history: historyOf(5, 4, 3) }),
  rankChange: 2,
  tiles: { bingo: 2, serija: 4 },
};

/** Jonas's game page: third of three, every panel drawn. */
export const DASHBOARD: Dashboard = {
  table: {
    survival: false,
    rows: [
      tableRow('ona', 1, { totalCents: 12_345 }),
      tableRow('petras', 2),
      ME.row,
    ],
  },
  me: ME,
  progress: { round: round(3), name: '3 turas', scored: 4, total: 9, today: 2 },
  medals: [
    {
      team: 'Žalgiris',
      first: 2,
      second: 1,
      third: 0,
      fourth: 0,
    },
  ],
  feed: {
    bingos: [
      {
        game: game(7),
        line: 'Žalgiris 88-79 Olympiacos',
        players: 'jonas, ona',
      },
    ],
    runs: [{ username: 'petras', length: 4 }],
  },
  games: null,
};
