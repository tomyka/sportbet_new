import type { LeagueId, PlayerId, Result } from '@sportbet/domain';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import { readForm } from '../request/form-input';
import { validationBody } from '../request/laravel-answers';
import { referringPath } from '../request/referring-path';
import {
  notFound,
  refuseCrossSite,
  seeOther,
} from '../request/route-responses';
import { asLeague, readIdField } from './id-field';

/** What answering a switch needs of the world: the session, the write and the one-time message. */
export interface SwitchWorld {
  readonly signedIn: () => Promise<{ readonly player: PlayerId } | null>;
  readonly select: (select: {
    readonly player: PlayerId;
    readonly league: LeagueId;
  }) => Promise<Result<unknown, 'not-a-member'>>;
  /** Leaves "Lyga pakeista" for the next page. */
  readonly leaveMessage: () => Promise<void>;
}

/**
 * LeagueController::switchLeague: from this site only (#16); a guest goes
 * to sign in; the posted `leagueID` is read as Laravel validates it (a
 * refusal is its 422); a league the player is no member of, or that no
 * league has the id of, is not found. Otherwise the selection moves, and a
 * 303 goes back to the page the form came from - a path on this site, else
 * the game page - with the message (`redirect()->back()->with('info', ...)`).
 */
export async function answerSwitch(
  request: Request,
  world: SwitchWorld,
): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await world.signedIn();
  if (signedIn === null) return seeOther('/login');
  const form = await readForm(request);
  const field = readIdField(form.get('leagueID'), 'leagueID');
  if (field.kind === 'refused') {
    return Response.json(
      validationBody([{ field: field.field, message: field.message }]),
      { status: 422 },
    );
  }
  if (field.kind === 'no-such-row') return notFound();
  const switched = await world.select({
    player: signedIn.player,
    league: asLeague(field.id),
  });
  if (!switched.ok) return notFound();
  await world.leaveMessage();
  return seeOther(referringPath(request) ?? PLAYER_HOME);
}
