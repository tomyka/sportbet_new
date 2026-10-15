import type {
  DetailsEntry,
  LeagueId,
  PaymentsRefusal,
  PlayerId,
  Result,
} from '@sportbet/domain';
import { asLeague } from './id-field';
import {
  answerLeagueAction,
  blockedAnswer,
  type Blocked,
  type LeagueAnswer,
  type ExistingLeagueWorld,
} from './league-action';
import { readLeagueSegment } from './league-segment';
import { readDetailsForm } from './payments-field';
import { PLAYER_PAYMENTS_DOOR, type PaymentsDoor } from './payments-door';

export interface DetailsWorld extends ExistingLeagueWorld {
  readonly save: (save: {
    readonly actor: PlayerId;
    readonly league: LeagueId;
    readonly entry: DetailsEntry;
  }) => Promise<Result<void, PaymentsRefusal | 'no-such-league'> | Blocked>;
}

/**
 * LeaguePaymentController::updateDetails: the league segment (404 when it
 * is no league), then the form - a length rule is Laravel's 422, the IBAN's
 * checksum and the both-or-neither rule a 303 back to the payments page
 * with the error message - then the writer's decision: 403 for the public
 * league and a plain member. Done: a 303 to the payments page, saved.
 */
export function answerDetailsSave(
  request: Request,
  world: DetailsWorld,
  segment: string,
  door: PaymentsDoor = PLAYER_PAYMENTS_DOOR,
): Promise<Response> {
  return answerLeagueAction(
    request,
    world,
    async ({ player, form }): Promise<LeagueAnswer> => {
      const found = readLeagueSegment(segment);
      if (found === null) return { kind: 'not-found' };
      const league = asLeague(found);
      const to = door.page(found);
      const read = readDetailsForm(form);
      if (read.kind !== 'ok') {
        if (!(await world.leagueExists(league))) return { kind: 'not-found' };
        return read.kind === 'invalid'
          ? { kind: 'invalid', body: read.body }
          : { kind: 'redirect', to, message: read.message };
      }
      const saved = await world.save({
        actor: player,
        league,
        entry: read.entry,
      });
      if ('status' in saved) return blockedAnswer(saved);
      if (saved.ok) return { kind: 'redirect', to, message: 'details-saved' };
      return saved.refusal === 'no-such-league'
        ? { kind: 'not-found' }
        : { kind: 'forbidden' };
    },
    door.refusedAt === undefined ? {} : { refusedAt: door.refusedAt },
  );
}
