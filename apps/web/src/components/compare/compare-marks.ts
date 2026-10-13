// The comparison's marks: the larger side of a pair is the winner in the
// accent colour (.cmp-winner, .cmp-stat-win), the smaller the loser in the
// muted one (.cmp-loser, .cmp-stat-lose), and a tie marks neither.

/** The text colour of `mine` against `theirs`: accent when larger, muted when smaller, none when equal. */
export const markOf = (mine: number, theirs: number): string => {
  if (mine > theirs) return 'text-accent';
  return mine < theirs ? 'text-muted' : '';
};
