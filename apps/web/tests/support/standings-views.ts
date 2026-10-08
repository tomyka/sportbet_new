import {
  StandingsTable,
  type StandingsCloses,
  type Instant,
  type StandingsDeadline,
  type StandingsView,
  type TeamPick,
} from '@sportbet/domain';
import { at, team } from '@sportbet/domain/testing';

// Standings pages for the component tests, built as the server builds
// them: through the domain's StandingsTable.at, so each row's boxes, the
// counters, the totals and R-79's and R-80's states are the table's, never
// written by hand.

/** A row as stored: its team, name and columns. */
export interface FixtureRow extends TeamPick {
  readonly name: string;
}

export const fixtureRow = (
  id: number,
  name: string,
  over: Partial<Omit<FixtureRow, 'team' | 'name'>> = {},
): FixtureRow => ({
  team: team(String(id)),
  name,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
  ...over,
});

/** Three teams, nothing saved. */
export const FIXTURE_ROWS: readonly FixtureRow[] = [
  fixtureRow(1, 'Olympiacos'),
  fixtureRow(2, 'Zalgiris'),
  fixtureRow(3, 'Real Madrid'),
];

const DEADLINE = at('2026-11-06T18:00:00Z');
const NOW = at('2026-10-08T12:00:00Z');

/** A season saying only what R-80 shows: open until a deadline, closed, or never closing. */
const seasonFor = (
  closes: StandingsCloses['state'],
  deadline: Instant,
): StandingsDeadline => ({
  standingsDeadline: () => (closes === 'never' ? null : deadline),
  isStandingsOpenAt: () => closes !== 'closed',
});

/**
 * The page for `rows`, as the server builds it (StandingsTable.at, the
 * tournament's teams being these rows' teams) and shown in the order
 * given; open until `deadline` (6 November) unless `closes` says closed
 * or never.
 */
export function standingsView(
  over: {
    readonly rows?: readonly FixtureRow[];
    readonly closes?: StandingsCloses['state'];
    readonly deadline?: Instant;
  } = {},
): StandingsView {
  const rows = over.rows ?? FIXTURE_ROWS;
  return StandingsTable.at({
    teams: rows.map(({ team: id, name }) => ({ id, name })),
    rows,
    season: seasonFor(over.closes ?? 'open', over.deadline ?? DEADLINE),
    now: NOW,
  })
    .withOrder(rows.map((row) => row.team))
    .view();
}

/** Every row's place saved, in the order given. */
export const savedRows = (
  rows: readonly FixtureRow[] = FIXTURE_ROWS,
): FixtureRow[] => rows.map((row, index) => ({ ...row, place: index + 1 }));
