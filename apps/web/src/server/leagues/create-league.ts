import type {
  CreateRefusal,
  LeagueEntry,
  LeagueId,
  PlayerId,
  Result,
  Tournament,
} from '@sportbet/domain';
import {
  answerLeagueAction,
  toLeagues,
  type LeagueWorld,
} from './league-action';
import { readLeagueForm } from './league-form';

/** What creating a league needs besides the session: the request's tournament and the write. */
export interface CreateWorld extends LeagueWorld {
  readonly tournament: () => Promise<Tournament | null>;
  readonly found: (found: {
    readonly player: PlayerId;
    readonly entry: LeagueEntry;
    readonly tournament: Tournament | null;
  }) => Promise<Result<{ league: LeagueId }, CreateRefusal>>;
}

/**
 * LeagueController::create: the form is validated first (422, every field),
 * then the league founded in the request's tournament; without one (issue
 * 272) the page says so, as an error. Both end at the league page.
 */
export function answerCreate(
  request: Request,
  world: CreateWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const read = readLeagueForm(form, 'create');
    if (!read.ok) return { kind: 'invalid', body: read.body };
    const founded = await world.found({
      player,
      entry: read.entry,
      tournament: await world.tournament(),
    });
    return toLeagues(founded.ok ? 'league-created' : 'no-tournament');
  });
}
