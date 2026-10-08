import type { StandingsDeadline } from '../round/season';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  finalFourWithoutPlayOffs,
  finalPlaceWithoutFinalFour,
  keptChain,
  stageFull,
} from './chain';
import type {
  EnteredFinalPlace,
  StandingsStage,
  TeamPick,
} from './standings-prediction';

export type StandingsRowRefusal =
  | 'not-yours'
  | 'place-out-of-table'
  | 'place-taken'
  | 'play-offs-full'
  | 'final-four-full'
  | 'final-place-taken'
  | 'final-four-without-play-offs'
  | 'final-place-without-final-four'
  | 'closed';

/** A posted row: a TeamPick whose final place is one an entry may name. */
export interface StandingsEntry extends Omit<TeamPick, 'finalPlace'> {
  readonly finalPlace: EnteredFinalPlace | null;
}

/**
 * The tournament a row is saved in: its teams, the player's rows there and
 * its season, whose deadline closes standings (ST-2).
 */
export interface StandingsTarget {
  readonly teams: readonly TeamId[];
  readonly rows: readonly TeamPick[];
  readonly season: StandingsDeadline;
}

/**
 * updatePredictionStandingsUser once the form has passed. A row with no
 * target - the team not stored, or the player not one of its tournament's -
 * is not the player's, and sportbet checks no conflict for it. Then the
 * place within the table (the rules' `min:1|max:positionMax`) and not
 * another row's - judged only when it changes: the page posts a row's
 * place back as last saved, and stored places are sportbet's (a place 0,
 * two rows sharing one, a place past a table since shrunk), kept as they
 * are until a reorder rewrites them all. Then StandingsRules::rowConflicts'
 * stages and final place against the player's other rows in the
 * tournament, each mended to R-78's chain as the page shows it (the
 * Euroleague format enforces them), the stage chain (R-78), and the
 * season's deadline at `now`, the moment this save is judged at (ST-2). Accepted: the row to store, as posted - a blank place
 * or final place null, a posted tick as posted, a tick not posted null.
 */
export function predictStandingsRow(input: {
  readonly entry: StandingsEntry;
  readonly target: StandingsTarget | null;
  readonly now: Instant;
}): Result<TeamPick, StandingsRowRefusal> {
  const { entry, target, now } = input;
  if (!target?.teams.includes(entry.team)) return refuse('not-yours');
  const stored = target.rows.find((row) => row.team === entry.team);
  const placeChanged = entry.place !== null && entry.place !== stored?.place;
  if (placeChanged && (entry.place < 1 || entry.place > target.teams.length)) {
    return refuse('place-out-of-table');
  }
  // The other rows as the page shows them: a stored row breaking R-78's
  // chain is mended (keptChain), so it fills no stage and takes no final
  // place the page offers.
  const others = target.rows
    .filter((row) => row.team !== entry.team)
    .map(keptChain);
  if (placeChanged && others.some((row) => row.place === entry.place)) {
    return refuse('place-taken');
  }
  const full = (stage: StandingsStage) =>
    entry[stage] === true && stageFull(others, stage);
  if (full('playOffs')) return refuse('play-offs-full');
  if (full('finalFour')) return refuse('final-four-full');
  if (
    entry.finalPlace !== null &&
    others.some((row) => row.finalPlace === entry.finalPlace)
  ) {
    return refuse('final-place-taken');
  }
  if (finalFourWithoutPlayOffs(entry)) {
    return refuse('final-four-without-play-offs');
  }
  if (finalPlaceWithoutFinalFour(entry)) {
    return refuse('final-place-without-final-four');
  }
  if (!target.season.isStandingsOpenAt(now)) return refuse('closed');
  return ok(entry);
}
