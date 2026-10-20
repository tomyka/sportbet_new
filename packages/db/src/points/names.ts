// The names of the points tables and of whose points a row holds, apart from
// the schema, so a caller that only needs the names does not load the tables
// (#36).

/**
 * Whose points a row holds. Every row the app writes and reads is
 * `ruled` (LIVE_SOURCE); the `production` and `sportbet` rows in the live
 * database are retired history that no code reads or writes, kept because
 * dropping an enum value is a migration the owner has not asked for.
 */
export const POINTS_SOURCES = ['production', 'sportbet', 'ruled'] as const;

export type PointsSource = (typeof POINTS_SOURCES)[number];

/**
 * The one source every points row is saved and read under. A query always
 * filters on it - never on a default - so an unfiltered query can never sum
 * the retired rows into a total.
 */
export const LIVE_SOURCE = 'ruled' as const satisfies PointsSource;

/** The four points tables. */
export const POINTS_TABLES = [
  'game_odds',
  'match_points',
  'standings_points',
  'survival_points',
] as const;

export type PointsTable = (typeof POINTS_TABLES)[number];
