// Narrow entry `@sportbet/db/prediction` (#36): Match predictions: reading and saving them.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  loadMatchPredictions,
  loadMissingResultPredictions,
  loadPlayerPredictions,
  loadStartedPredictions,
} from '../prediction/repository';
export {
  savePrediction,
  type PredictionSave,
  type PredictionSaved,
} from '../prediction/save';
