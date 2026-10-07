import type { SingleGame } from '@sportbet/db';
import { vilniusStamp } from '../format/vilnius-time';
import type { SingleGameText } from './single-game-view';

const side = (score: number | null): string =>
  score === null ? '' : String(score);

/**
 * showSingleGame's game as game-single.blade.php prints it: the tip-off
 * `Y-m-d H:i` in Vilnius, the player's row as the boxes hold it (a blank
 * side empty; no row, null).
 */
export function singleGameText(
  single: SingleGame,
  game: number,
): SingleGameText {
  return {
    game,
    home: single.home,
    away: single.away,
    stamp: vilniusStamp(single.tipOff),
    locked: single.locked,
    prediction:
      single.prediction === null
        ? null
        : {
            home: side(single.prediction.home),
            away: side(single.prediction.away),
          },
  };
}
