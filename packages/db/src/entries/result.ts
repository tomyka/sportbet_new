// Narrow entry `@sportbet/db/result` (#36): The results page.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  loadResultsPage,
  type ResultsPage,
  type ResultsPageGame,
  type ResultsPageRound,
} from '../result/page';
