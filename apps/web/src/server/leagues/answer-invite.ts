import type {
  AcceptRefusal,
  LeagueId,
  PlayerId,
  Result,
} from '@sportbet/domain';
import { readIdField } from './id-field';
import {
  answerLeagueAction,
  idAnswer,
  toLeagues,
  type LeagueWorld,
} from './league-action';

export interface AcceptWorld extends LeagueWorld {
  readonly join: (join: {
    readonly actor: PlayerId;
    readonly invite: number;
  }) => Promise<Result<{ league: LeagueId }, AcceptRefusal>>;
}

export interface DeclineWorld extends LeagueWorld {
  readonly drop: (drop: {
    readonly actor: PlayerId;
    readonly invite: number;
  }) => Promise<Result<void, 'not-your-invite'>>;
}

/**
 * LeagueController::acceptInvite: the posted `inviteID` (422, or 404 for an
 * integer no invite has); another player's invite is a 404; a player who is
 * not in the invite's tournament (R-20) is told to join it first and the
 * invite stays; otherwise they are a member, not selected. All end at the
 * league page.
 */
export function answerAccept(
  request: Request,
  world: AcceptWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const field = readIdField(form.get('inviteID'), 'inviteID');
    if (field.kind !== 'id') return idAnswer(field);
    const joined = await world.join({ actor: player, invite: field.id });
    if (joined.ok) return toLeagues('league-joined');
    return joined.refusal === 'not-your-invite'
      ? { kind: 'not-found' }
      : toLeagues('join-tournament-first');
  });
}

/** LeagueController::declineInvite: the player's own invite goes; another's is a 404. */
export function answerDecline(
  request: Request,
  world: DeclineWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const field = readIdField(form.get('inviteID'), 'inviteID');
    if (field.kind !== 'id') return idAnswer(field);
    const dropped = await world.drop({ actor: player, invite: field.id });
    return dropped.ok ? toLeagues('invite-declined') : { kind: 'not-found' };
  });
}
