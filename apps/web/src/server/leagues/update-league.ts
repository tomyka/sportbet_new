import type {
  LeagueEntry,
  LeagueId,
  PlayerId,
  Result,
  UpdateRefusal,
} from '@sportbet/domain';
import { asLeague, readIdField } from './id-field';
import {
  answerLeagueAction,
  idAnswer,
  toLeagues,
  type LeagueWorld,
} from './league-action';
import { readLeagueForm } from './league-form';

export interface UpdateWorld extends LeagueWorld {
  readonly isAdmin: (check: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  }) => Promise<boolean>;
  readonly edit: (edit: {
    readonly player: PlayerId;
    readonly league: LeagueId;
    readonly entry: LeagueEntry;
  }) => Promise<Result<void, UpdateRefusal | 'no-such-league'>>;
}

/**
 * LeagueController::update: the posted `leagueID`, then the admin gate (a
 * league that is not there and one the player does not administer are both
 * a 404, before the form is looked at), then the form (422), then the edit.
 */
export function answerUpdate(
  request: Request,
  world: UpdateWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const field = readIdField(form.get('leagueID'), 'leagueID');
    if (field.kind !== 'id') return idAnswer(field);
    const league = asLeague(field.id);
    if (!(await world.isAdmin({ actor: player, league }))) {
      return { kind: 'not-found' };
    }
    const read = readLeagueForm(form, 'update');
    if (!read.ok) return { kind: 'invalid', body: read.body };
    const edited = await world.edit({
      player,
      league,
      entry: read.entry,
    });
    return edited.ok ? toLeagues('league-updated') : { kind: 'not-found' };
  });
}
