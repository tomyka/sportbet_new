import type {
  LeagueId,
  PlayerId,
  Result,
  TransferRefusal,
} from '@sportbet/domain';
import type { LeagueMessage } from '../flash';
import { asLeague, asPlayer, readIdField } from './id-field';
import {
  answerLeagueAction,
  backWith,
  idAnswer,
  toLeagues,
  type LeagueWorld,
} from './league-action';

export interface TransferWorld extends LeagueWorld {
  readonly handOver: (hand: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly to: PlayerId;
  }) => Promise<Result<void, TransferRefusal | 'no-such-league'>>;
}

const REFUSALS: Readonly<Record<TransferRefusal, LeagueMessage>> = {
  public: 'transfer-public',
  'not-owner': 'transfer-not-owner',
  'not-a-member': 'transfer-not-a-member',
  'already-owner': 'transfer-already-owner',
};

/**
 * `/leagues/transfer` (R-23, R-119): the owner hands the league to another
 * member, posted as `leagueID` and `memberID` (the member's player id; 422
 * or 404 as every posted id). A league that is not there is a 404; each of
 * the four refusals is an error message back to the page the form came
 * from; done, the league page says so.
 */
export function answerTransfer(
  request: Request,
  world: TransferWorld,
): Promise<Response> {
  return answerLeagueAction(request, world, async ({ player, form }) => {
    const league = readIdField(form.get('leagueID'), 'leagueID');
    if (league.kind !== 'id') return idAnswer(league);
    const member = readIdField(form.get('memberID'), 'memberID');
    if (member.kind !== 'id') return idAnswer(member);
    const handed = await world.handOver({
      actor: player,
      league: asLeague(league.id),
      to: asPlayer(member.id),
    });
    if (handed.ok) return toLeagues('league-handed-over');
    return handed.refusal === 'no-such-league'
      ? { kind: 'not-found' }
      : backWith(REFUSALS[handed.refusal]);
  });
}
