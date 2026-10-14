import type {
  LeagueId,
  LeaveRefusal,
  PlayerId,
  Result,
  RuleSet,
} from '@sportbet/domain';
import type { LeagueMessage } from '../flash';
import { asLeague, readIdField } from './id-field';
import {
  answerLeagueAction,
  backWith,
  idAnswer,
  toLeagues,
  type LeagueWorld,
} from './league-action';

export interface LeaveWorld extends LeagueWorld {
  readonly rules: RuleSet;
  readonly exit: (exit: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly rules: RuleSet;
  }) => Promise<
    Result<{ selected: LeagueId | null }, LeaveRefusal | 'no-such-league'>
  >;
}

const REFUSALS: Readonly<
  Record<'public' | 'owner' | 'only-league', LeagueMessage>
> = {
  public: 'leave-public',
  owner: 'leave-owner',
  'only-league': 'leave-only-league',
};

/**
 * LeagueController::leaveLeague: `leagueID` (422, or 404 for an integer no
 * league has); the public league, the owner and the player's only league
 * (R-29: counted as the rule set says) are error messages back to the page
 * the form came from; a league that is not there or the player is no
 * member of is a 404; otherwise they have left (the exit moved their
 * selection to the public league when it was this one).
 */
export function answerLeave(
  request: Request,
  world: LeaveWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const field = readIdField(form.get('leagueID'), 'leagueID');
    if (field.kind !== 'id') return idAnswer(field);
    const left = await world.exit({
      actor: player,
      league: asLeague(field.id),
      rules: world.rules,
    });
    if (left.ok) return toLeagues('league-left');
    if (left.refusal === 'not-a-member' || left.refusal === 'no-such-league') {
      return { kind: 'not-found' };
    }
    return backWith(REFUSALS[left.refusal]);
  });
}
