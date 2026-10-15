import {
  type LeagueId,
  type PaymentsEntry,
  type PaymentsRefusal,
  type PaymentTotals,
  type PlayerId,
  type Result,
} from '@sportbet/domain';
import { leaguePaymentsPath } from '../../components/leagues/league-paths';
import { asLeague } from './id-field';
import {
  answerLeagueAction,
  expectsJson,
  type LeagueAnswer,
  type ExistingLeagueWorld,
} from './league-action';
import { readLeagueSegment } from './league-segment';
import { readPaymentsForm } from './payments-field';

export interface PaymentsWorld extends ExistingLeagueWorld {
  readonly save: (save: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly entry: PaymentsEntry;
  }) => Promise<
    Result<PaymentTotals, PaymentsRefusal | 'unknown-member' | 'no-such-league'>
  >;
}

/** The autosave's JSON: the cents the page's meter is drawn from. */
const totalsBody = (totals: PaymentTotals) => ({
  saved: true,
  collectedCents: totals.collected,
  expectedCents: totals.expected,
  paidCount: totals.paidCount,
  memberCount: totals.memberCount,
});

/**
 * LeaguePaymentController::update: the league segment (404 when it is no
 * league), then the form (422, after a 404 for a league that is not there),
 * then the writer's decision: 403 for the public league and a plain member,
 * 404 for a posted id that is no member of this league. Done: the totals as
 * JSON for a request that accepts it, else a 303 to the payments page.
 */
export function answerPaymentsSave(
  request: Request,
  world: PaymentsWorld,
  segment: string,
): Promise<Response> {
  return answerLeagueAction(
    request,
    world,
    async ({ player, form }): Promise<LeagueAnswer> => {
      const found = readLeagueSegment(segment);
      if (found === null) return { kind: 'not-found' };
      const league = asLeague(found);
      const read = readPaymentsForm(form);
      if (!read.ok) {
        return (await world.leagueExists(league))
          ? { kind: 'invalid', body: read.body }
          : { kind: 'not-found' };
      }
      const saved = await world.save({
        actor: player,
        league,
        entry: read.entry,
      });
      if (!saved.ok) {
        return saved.refusal === 'public-league' ||
          saved.refusal === 'not-an-admin'
          ? { kind: 'forbidden' }
          : { kind: 'not-found' };
      }
      return expectsJson(request)
        ? { kind: 'json', body: totalsBody(saved.value) }
        : {
            kind: 'redirect',
            to: leaguePaymentsPath(found),
            message: 'payments-saved',
          };
    },
    { unauthenticatedJson: true },
  );
}
