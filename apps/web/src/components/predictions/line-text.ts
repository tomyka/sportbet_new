import type { PredictionLine } from '@sportbet/db';
import { onePlace, type OddsPanel } from '@sportbet/domain';
import type { LinePointsText } from './points-breakdown';
import type { EditorRow } from './prediction-editor';
import type { ScoredLineText } from './scored-line';

// A predictions page line in the strings its rows draw: the predictions
// page and the game page's "Visos rungtynės" (R-74) build their rows here.

const side = (score: number | null): string =>
  score === null ? '' : String(score);

/** "85:80", with "?" for a blank side (`{{ $g->p_home_team_score ?? '?' }}`). */
export function predictedText(line: PredictionLine): string {
  const { home, away } = line.predicted;
  return `${home === null ? '?' : String(home)}:${away === null ? '?' : String(away)}`;
}

/**
 * A scored row's points as strings: full + serija for the total
 * (results.blade.php's $totalPts). A row that earned nothing is drawn as
 * sportbet draws it (upt-empty: "0.0", faint, no breakdown), so null.
 */
export function pointsText(line: PredictionLine): LinePointsText | null {
  const { points } = line;
  if (points === null) return null;
  const total = points.full.hundredths + points.serija.hundredths;
  if (total <= 0) return null;
  return {
    total: onePlace(total),
    winner: onePlace(points.winner.hundredths),
    margin: onePlace(points.margin.hundredths),
    bingo: onePlace(points.bingo.hundredths),
    serija: points.serija.isPositive()
      ? onePlace(points.serija.hundredths)
      : null,
  };
}

/** A scored line as ScoredLine draws it, `time` its Vilnius clock. */
export function scoredLineOf(
  line: PredictionLine & { readonly result: { home: number; away: number } },
  time: string,
): ScoredLineText {
  return {
    game: line.game,
    time,
    home: line.home,
    away: line.away,
    result: `${String(line.result.home)}:${String(line.result.away)}`,
    predicted: predictedText(line),
    points: pointsText(line),
  };
}

/** An odds panel's "+X pt" per side; "0.0" without one. */
export function oddsText(panel: OddsPanel | null): EditorRow['panel'] {
  return {
    home: panel === null ? '0.0' : onePlace(panel.home.hundredths),
    away: panel === null ? '0.0' : onePlace(panel.away.hundredths),
  };
}

/** An open or locked line as PredictionEditor draws it, `time` its Vilnius clock. */
export function editorRowOf(line: PredictionLine, time: string): EditorRow {
  return {
    game: line.game,
    time,
    home: line.home,
    away: line.away,
    predictedHome: side(line.predicted.home),
    predictedAway: side(line.predicted.away),
    locked: line.state === 'locked',
    panel: oddsText(line.panel),
  };
}
