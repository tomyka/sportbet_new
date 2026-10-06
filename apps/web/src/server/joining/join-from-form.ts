import {
  findVisibleTournament,
  registerForTournament,
  setLastTournament,
  type Db,
  type PlayerViewer,
} from '@sportbet/db';
import {
  isAccepted,
  isOpenForRegistrationWindowAt,
  registrationSubmitStep,
  type FillInDice,
  type Instant,
  type RuleSet,
} from '@sportbet/domain';
import { PLAYER_HOME } from '../../components/shell/shell-paths';
import type { Flash } from '../flash';

/** What the submit answers: not found, or the one-time message and the page to send the player to. */
export type JoinFromFormOutcome =
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'answered';
      readonly flash: Flash;
      readonly location: string;
    };

/** The submit, parsed: who, which tournament, and the form's `confirm` (trimmed, as Laravel's TrimStrings does). */
export interface JoinFromForm {
  readonly viewer: PlayerViewer;
  readonly slug: string;
  readonly confirm: string | null;
  readonly now: Instant;
  readonly rules: RuleSet;
  readonly dice: FillInDice;
}

const answered = (flash: Flash, location: string): JoinFromFormOutcome => ({
  kind: 'answered',
  flash,
  location,
});

/**
 * TournamentController::register as a use case (decision 10): load the
 * tournament as the viewer may see it (R-50), let the domain decide the
 * step (registrationSubmitStep, isAccepted), then write - a newcomer
 * through registerForTournament, which checks the window again in its
 * transaction (closed meanwhile is "registration-closed"), and the
 * tournament made the one used last (R-28) - and answer with sportbet's
 * message and page.
 */
export async function joinFromForm(
  db: Db,
  submit: JoinFromForm,
): Promise<JoinFromFormOutcome> {
  const { viewer, slug, rules, now } = submit;
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return { kind: 'not-found' };
  const step = registrationSubmitStep({
    confirmed: isAccepted(submit.confirm),
    member: found.member,
    registrationOpen: isOpenForRegistrationWindowAt(found.window, now, rules),
  });
  const closed = answered({ kind: 'registration-closed' }, '/');
  switch (step) {
    case 'confirm-required':
      return answered(
        { kind: 'confirm-required' },
        `/tournament/${slug}/register`,
      );
    case 'closed':
      return closed;
    case 'join': {
      const joined = await registerForTournament(db, {
        player: viewer.player,
        tournament: found.tournament,
        rules,
        now,
        dice: submit.dice,
      });
      if (!joined.ok) return closed;
      break;
    }
    case 'take-in':
      break;
  }
  await setLastTournament(db, viewer.player, found.tournament.id);
  return answered(
    { kind: 'registered', tournament: found.tournament.name },
    PLAYER_HOME,
  );
}
