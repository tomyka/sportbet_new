// Narrow entry `@sportbet/db/points` (#36): The names of the points tables, and the sources.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  POINTS_SOURCES,
  POINTS_TABLES,
  type PointsSource,
  type PointsTable,
} from '../points/names';
