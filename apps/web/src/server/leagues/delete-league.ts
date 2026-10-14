import type {
  DeleteRefusal,
  LeagueId,
  PlayerId,
  Result,
} from '@sportbet/domain';
import { asLeague, readIdField } from './id-field';
import {
  answerLeagueAction,
  idAnswer,
  toLeagues,
  type LeagueWorld,
} from './league-action';

export interface DeleteWorld extends LeagueWorld {
  readonly remove: (remove: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  }) => Promise<Result<void, DeleteRefusal | 'no-such-league'>>;
}

/**
 * LeagueController::deleteLeague: `leagueID` (422, or 404 for an integer no
 * league has); a league that is not there is a 404, one the player does not
 * own a 403 (the public league has no owner, so it is a 403 too); the
 * owner's league goes, its selecting members moved to the public league.
 */
export function answerDelete(
  request: Request,
  world: DeleteWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const field = readIdField(form.get('leagueID'), 'leagueID');
    if (field.kind !== 'id') return idAnswer(field);
    const removed = await world.remove({
      actor: player,
      league: asLeague(field.id),
    });
    if (removed.ok) return toLeagues('league-deleted');
    return removed.refusal === 'no-such-league'
      ? { kind: 'not-found' }
      : { kind: 'forbidden' };
  });
}
