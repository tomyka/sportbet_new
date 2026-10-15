import {
  StandingsTable,
  type StandingsCloses,
  type StandingsSeason,
  type StandingsView,
  type TeamPick,
} from '@sportbet/domain';
import { team } from '@sportbet/domain/testing';

// Standings pages for the component tests, built as the server builds
// them: through the domain's StandingsTable.of, so each row's boxes, the
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

/** A season saying only what R-80 shows: open, closed, or never closing. */
const seasonFor = (closes: StandingsCloses['state']): StandingsSeason => ({
  standingsCloses: () => ({ state: closes }),
  isStandingsOpen: () => closes !== 'closed',
});

/**
 * The page for `rows`, as the server builds it (StandingsTable.of, the
 * tournament's teams being these rows' teams) and shown in the order
 * given; open unless `closes` says closed or never.
 */
export function standingsView(
  over: {
    readonly rows?: readonly FixtureRow[];
    readonly closes?: StandingsCloses['state'];
  } = {},
): StandingsView {
  const rows = over.rows ?? FIXTURE_ROWS;
  return StandingsTable.of({
    teams: rows.map(({ team: id, name }) => ({ id, name })),
    rows,
    season: seasonFor(over.closes ?? 'open'),
  })
    .withOrder(rows.map((row) => row.team))
    .view();
}

/** Every row's place saved, in the order given. */
export const savedRows = (
  rows: readonly FixtureRow[] = FIXTURE_ROWS,
): FixtureRow[] => rows.map((row, index) => ({ ...row, place: index + 1 }));
