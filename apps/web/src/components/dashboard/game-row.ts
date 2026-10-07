import type { DashboardGame } from '@sportbet/db';
import { shortDay, vilniusClock } from '../format/vilnius-time';
import {
  editorRowOf,
  oddsText,
  pointsText,
  predictedText,
} from '../predictions/line-text';
import type { LinePointsText } from '../predictions/points-breakdown';
import type { EditorRow } from '../predictions/prediction-editor';

/**
 * A game page line in strings, for "Artimiausios rungtynės" and "Visos
 * rungtynės": they are client components, and a line's points are
 * classes, which cannot cross to the client.
 */
export interface GameRow {
  readonly game: number;
  /** "Spa 20": `isoFormat('MMM D')` in Vilnius. */
  readonly day: string;
  /** "21:00" in Vilnius. */
  readonly time: string;
  readonly home: string;
  readonly away: string;
  /** Each side's predicted score, "?" when blank (the deck's cards). */
  readonly predictedHome: string;
  readonly predictedAway: string;
  /** "85:80", "?" for a blank side. */
  readonly predicted: string;
  /** "88:79" once played. */
  readonly result: string | null;
  /** A played row's points with their breakdown; null when it earned nothing. */
  readonly points: LinePointsText | null;
  /** The odds before the result, as the domain decides them (gameOdds, R-61); null otherwise. */
  readonly odds: EditorRow['panel'] | null;
  /** Open for a prediction: a click opens `editor` (R-74). */
  readonly open: boolean;
  /** The card offers "Spėti" (R-75). */
  readonly predict: boolean;
  readonly editor: EditorRow;
}

const sideText = (score: number | null): string =>
  score === null ? '?' : String(score);

export function gameRowOf(line: DashboardGame): GameRow {
  const time = vilniusClock(line.tipOff);
  const { home, away } = line.predicted;
  return {
    game: line.game,
    day: shortDay(line.tipOff),
    time,
    home: line.home,
    away: line.away,
    predictedHome: sideText(home),
    predictedAway: sideText(away),
    predicted: predictedText(line),
    result:
      line.result === null
        ? null
        : `${String(line.result.home)}:${String(line.result.away)}`,
    points: line.result === null ? null : pointsText(line),
    odds: line.odds === null ? null : oddsText(line.odds),
    open: line.state === 'open',
    predict: line.predict,
    editor: editorRowOf(line, time),
  };
}
