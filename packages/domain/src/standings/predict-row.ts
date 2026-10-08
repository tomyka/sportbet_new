import type { StandingsDeadline } from '../round/season';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  finalFourWithoutPlayOffs,
  finalPlaceWithoutFinalFour,
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
 * place within the table (the rules' `min:1|max:positionMax`),
 * StandingsRules::rowConflicts against the player's other rows in the
 * tournament (the Euroleague format enforces them), the stage chain
 * (R-78), and the season's deadline at `now`, the moment this save is
 * judged at (ST-2). Accepted: the row to store, as posted - a blank place
 * or final place null, a posted tick as posted, a tick not posted null.
 */
export function predictStandingsRow(input: {
  readonly entry: StandingsEntry;
  readonly target: StandingsTarget | null;
  readonly now: Instant;
}): Result<TeamPick, StandingsRowRefusal> {
  const { entry, target, now } = input;
  if (!target?.teams.includes(entry.team)) return refuse('not-yours');
  if (
    entry.place !== null &&
    (entry.place < 1 || entry.place > target.teams.length)
  ) {
    return refuse('place-out-of-table');
  }
  const others = target.rows.filter((row) => row.team !== entry.team);
  if (entry.place !== null && others.some((row) => row.place === entry.place)) {
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
