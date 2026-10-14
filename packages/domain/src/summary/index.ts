// The summaries' public exports, re-exported by the package's index.
export {
  predictionVerdict,
  standingsVerdict,
  type PredictionVerdict,
  type StandingsVerdict,
} from './verdict';
export {
  resultsSummary,
  type ResultsSummary,
  type StartedPrediction,
  type SummaryCell,
  type SummaryColumn,
  type SummaryGame,
  type SummaryRound,
} from './results-summary';
export {
  EUROLEAGUE_STAGE_NAMES,
  STANDINGS_LINE_KEYS,
  standingsSummary,
  type PointsBreakdown,
  type StageBreakdown,
  type StandingsBadge,
  type StandingsCell,
  type StandingsLineKey,
  type StandingsSummary,
} from './standings-summary';
export {
  pointsChart,
  type ChartGame,
  type ChartLine,
  type PointsChart,
} from './points-chart';
export {
  comparePlayers,
  type CompareRefusal,
  type CompareRound,
  type CompareSide,
  type Comparison,
} from './compare';
export {
  compareStats,
  earnedStages,
  isEarned,
  markOf,
  shownSum,
  type CompareStat,
  type CompareStatKind,
  type Mark,
} from './display';
