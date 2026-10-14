import type {
  InviteRefusal,
  LeagueId,
  PlayerId,
  Result,
} from '@sportbet/domain';
import type { LeagueMessage } from '../flash';
import { asLeague, asPlayer, readIdField } from './id-field';
import {
  answerLeagueAction,
  backWith,
  idAnswer,
  type LeagueAnswer,
  type LeagueWorld,
} from './league-action';

export interface InviteWorld extends LeagueWorld {
  readonly isAdmin: (check: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
  }) => Promise<boolean>;
  readonly invite: (send: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly invitee: PlayerId;
  }) => Promise<Result<void, InviteRefusal | 'no-such-league'>>;
}

const REFUSALS: Readonly<
  Record<Exclude<InviteRefusal, 'not-an-admin'>, LeagueMessage>
> = {
  'already-member-or-invited': 'already-member-or-invited',
  'not-in-tournament': 'invitee-not-in-tournament',
};

function answerOf(
  sent: Result<void, InviteRefusal | 'no-such-league'>,
): LeagueAnswer {
  if (sent.ok) return backWith('invite-sent');
  if (sent.refusal === 'not-an-admin' || sent.refusal === 'no-such-league') {
    return { kind: 'not-found' };
  }
  return backWith(REFUSALS[sent.refusal]);
}

/**
 * LeagueController::invite: `leagueID`, then the admin gate (a league that is
 * not there and one the player does not administer are a 404, before the
 * rest is looked at), then `invitedUserID` (422, or 404 for an integer no
 * account has), then the invite; the other
 * refusals (already a member or invited; R-20) are error messages, and an
 * invite sent answers likewise - all back to the page the form came from.
 */
export function answerInvite(
  request: Request,
  world: InviteWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const leagueField = readIdField(form.get('leagueID'), 'leagueID');
    if (leagueField.kind !== 'id') return idAnswer(leagueField);
    const league = asLeague(leagueField.id);
    if (!(await world.isAdmin({ actor: player, league }))) {
      return { kind: 'not-found' };
    }
    const invitee = readIdField(form.get('invitedUserID'), 'invitedUserID');
    if (invitee.kind !== 'id') return idAnswer(invitee);
    return answerOf(
      await world.invite({
        actor: player,
        league,
        invitee: asPlayer(invitee.id),
      }),
    );
  });
}
