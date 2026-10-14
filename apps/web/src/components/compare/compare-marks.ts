// The comparison's marks: the larger side of a pair is the winner in the
// accent colour (.cmp-winner, .cmp-stat-win), the smaller the loser in the
// muted one (.cmp-loser, .cmp-stat-lose), and a tie marks neither. The
// domain decides which side wins (markOf); this only draws it.
import type { Mark } from '@sportbet/domain';

/** The text colour of a mark: accent for a win, muted for a loss, none for a tie. */
export const markClass = (mark: Mark): string => {
  if (mark === 'win') return 'text-accent';
  return mark === 'lose' ? 'text-muted' : '';
};
