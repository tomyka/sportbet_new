import { RULE_SET_NAMES } from '@sportbet/domain';

// The names of the points tables and of whose points a row holds, apart from
// the schema, so a caller that only needs the names (the reader's report)
// does not load the tables (#36).

/**
 * Whose points a row holds: production's own, as the reader read them (the
 * parity oracle, and an input: sportbet's full recalculation reads its
 * stored odds and refolds its stored survival rows), or what
 * recalculateTournament derives under one rule set. Built from the domain's
 * rule set names, so the enum and the type cannot drift.
 */
export const POINTS_SOURCES = ['production', ...RULE_SET_NAMES] as const;

export type PointsSource = (typeof POINTS_SOURCES)[number];

/** The four points tables, as the load report counts them. */
export const POINTS_TABLES = [
  'game_odds',
  'match_points',
  'standings_points',
  'survival_points',
] as const;

export type PointsTable = (typeof POINTS_TABLES)[number];
