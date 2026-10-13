import {
  idFromText,
  roundNumber,
  teamIdFromText,
  type RoundNumber,
  type TeamId,
} from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';

/** A survival pick as posted: the team and the round the page showed. */
export interface SurvivalPickEntry {
  readonly team: TeamId;
  /** Null when the page did not say (sportbet's `?int $shownRoundID`). */
  readonly shownRound: RoundNumber | null;
}

/** "Nepasirinkta komanda.", "Ši komanda nepasiekiama.", "Turas pasikeitė - ...". */
export type SurvivalFormRefusal = 'no-team' | 'bad-team' | 'bad-round';

/**
 * updatePredictionSurvivalUser's validation on the trimmed fields: one
 * refusal, in its match(true) order. A team id is read by idFromText, so
 * 0 is refused here where Laravel's `integer` passed it on to "Ši komanda
 * nepasiekiama." - the same text. An empty round means the page did not
 * say.
 */
export function survivalPickFormEntry(posted: {
  readonly teamID: string | null;
  readonly round: string | null;
}): Result<SurvivalPickEntry, SurvivalFormRefusal> {
  if (posted.teamID === null || posted.teamID === '') {
    return refuse('no-team');
  }
  const team = teamIdFromText(posted.teamID);
  if (!team.ok) return refuse('bad-team');
  const shownRound = shownRoundOf(posted.round);
  return shownRound === 'refused'
    ? refuse('bad-round')
    : ok({ team: team.value, shownRound });
}

function shownRoundOf(text: string | null): RoundNumber | null | 'refused' {
  if (text === null || text === '') return null;
  const id = idFromText(text);
  const round = id.ok ? roundNumber(id.value) : id;
  return round.ok ? round.value : 'refused';
}
