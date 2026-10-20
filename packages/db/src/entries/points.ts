// Narrow entry `@sportbet/db/points` (#36): The names of the points tables, the sources and the live one.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  LIVE_SOURCE,
  POINTS_SOURCES,
  POINTS_TABLES,
  type PointsSource,
  type PointsTable,
} from '../points/names';
