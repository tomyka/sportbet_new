import {
  STANDINGS_COUNTS,
  type StandingsStage,
  type TeamPick,
} from './standings-prediction';

/** The columns the stage rules read of a row. */
type Ticks = Pick<TeamPick, 'playOffs' | 'finalFour' | 'finalPlace'>;

/**
 * Whether the rows already hold the stage's count of ticks (ST-1: 8
 * play-off teams, 4 Final Four teams). An unticked or never-saved box does
 * not count.
 */
export function stageFull(
  rows: readonly Ticks[],
  stage: StandingsStage,
): boolean {
  return (
    rows.filter((row) => row[stage] === true).length >= STANDINGS_COUNTS[stage]
  );
}

/** R-78: a Final Four tick needs a play-off tick. */
export const finalFourWithoutPlayOffs = (row: Ticks): boolean =>
  row.finalFour === true && row.playOffs !== true;

/** R-78: a final place may be named only for a Final Four team. */
export const finalPlaceOpen = (row: Ticks): boolean => row.finalFour === true;

/** R-78: a final place named for a team not ticked for the Final Four. */
export const finalPlaceWithoutFinalFour = (row: Ticks): boolean =>
  row.finalPlace !== null && !finalPlaceOpen(row);

/**
 * A row after one of its boxes changes (R-78): ticking the Final Four
 * ticks the play-offs; unticking the play-offs clears the Final Four and
 * the final place; unticking the Final Four clears the final place. A
 * never-saved Final Four stays blank.
 */
export function afterTick<T extends Ticks>(
  row: T,
  stage: StandingsStage,
  checked: boolean,
): T {
  if (stage === 'finalFour') {
    return checked
      ? { ...row, finalFour: true, playOffs: true }
      : { ...row, finalFour: false, finalPlace: null };
  }
  return checked
    ? { ...row, playOffs: true }
    : keptChain({ ...row, playOffs: false });
}

/**
 * A stored row made to keep R-78's chain, as sportbet's page cascades on
 * load (standings.blade.php's enforceAllLimits): a Final Four tick without
 * a play-off tick is unticked, then a final place without a Final Four
 * tick is cleared. A row that keeps the chain comes back as it is.
 */
export function keptChain<T extends Ticks>(row: T): T {
  const ticked = finalFourWithoutPlayOffs(row)
    ? { ...row, finalFour: false }
    : row;
  return finalPlaceWithoutFinalFour(ticked)
    ? { ...ticked, finalPlace: null }
    : ticked;
}

/**
 * Whether a row's stage box may change while standings are open: a ticked
 * box can always be unticked; an unticked one is closed once the other
 * rows fill its stage, and a Final Four box on a team off the play-offs
 * once the play-offs are full (ticking it would tick a ninth). `rows` may
 * hold the row itself: it is not counted against itself.
 */
export function tickOpen(
  rows: readonly TeamPick[],
  row: TeamPick,
  stage: StandingsStage,
): boolean {
  if (row[stage] === true) return true;
  const others = rows.filter((each) => each.team !== row.team);
  if (stageFull(others, stage)) return false;
  return !(
    stage === 'finalFour' &&
    row.playOffs !== true &&
    stageFull(others, 'playOffs')
  );
}
