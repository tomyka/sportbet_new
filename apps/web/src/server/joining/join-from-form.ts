import {
  findVisibleTournament,
  registerForTournament,
  setLastTournament,
  type Db,
  type PlayerViewer,
  type VisibleTournament,
} from '@sportbet/db';
import {
  isAccepted,
  isOpenForRegistrationWindowAt,
  joinSubmitLimits,
  registrationSubmitStep,
  type FillInDice,
  type Instant,
  type RuleSet,
} from '@sportbet/domain';
import { PLAYER_HOME, registerPath } from '../../components/shell/shell-paths';
import type { Flash } from '../flash';
import { throttle } from '../sign-in/throttle';

/** What the submit answers: not found, or the one-time message and the page to send the player to. */
export type JoinFromFormOutcome =
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'answered';
      readonly flash: Flash;
      readonly location: string;
      /** A place was written (a newcomer joined): the derived-points caches go stale. */
      readonly joined: boolean;
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

const answered = (
  flash: Flash,
  location: string,
  joined = false,
): JoinFromFormOutcome => ({
  kind: 'answered',
  flash,
  location,
  joined,
});

/**
 * TournamentController::register as a use case (decision 10), at most 60
 * submits a minute per account: load the tournament as the viewer may see
 * it (R-50), let the domain decide the step (registrationSubmitStep,
 * isAccepted), then write - a newcomer through registerForTournament,
 * which checks the window again in its transaction (closed meanwhile is
 * "registration-closed"), and the tournament made the one used last
 * (R-28) - and answer with sportbet's message and page.
 */
export async function joinFromForm(
  db: Db,
  submit: JoinFromForm,
): Promise<JoinFromFormOutcome> {
  const { viewer, slug, rules, now } = submit;
  // Sixty submits a minute per account (joinSubmitLimits): a join can
  // recalculate a tournament, so a loop is refused before it is read.
  const verdict = await throttle(db, joinSubmitLimits(viewer.player), now);
  if (!verdict.allowed) {
    return answered(
      { kind: 'throttled', minutes: verdict.minutes },
      registerPath(slug),
    );
  }
  const found = await findVisibleTournament(db, slug, viewer, rules);
  if (found === null) return { kind: 'not-found' };
  const step = registrationSubmitStep({
    confirmed: isAccepted(submit.confirm),
    member: found.member,
    registrationOpen: isOpenForRegistrationWindowAt(found.window, now, rules),
  });
  return refusedStep(step, slug) ?? admit(db, submit, found, step === 'join');
}

/** Registration closed: to the hub with sportbet's message. */
const CLOSED = answered({ kind: 'registration-closed' }, '/');

/** The step's answer when nothing is to be written: unconfirmed, back to the form; closed, to the hub. */
export function refusedStep(
  step: ReturnType<typeof registrationSubmitStep>,
  slug: string,
): JoinFromFormOutcome | null {
  if (step === 'confirm-required') {
    return answered({ kind: 'confirm-required' }, registerPath(slug));
  }
  return step === 'closed' ? CLOSED : null;
}

/**
 * A newcomer joined through registerForTournament (closed meanwhile is
 * "registration-closed"), a member taken in as they are; then the
 * tournament made the one used last (R-28), and home with "registered".
 */
async function admit(
  db: Db,
  submit: JoinFromForm,
  found: VisibleTournament,
  newcomer: boolean,
): Promise<JoinFromFormOutcome> {
  const { viewer, rules, now } = submit;
  const registered = newcomer
    ? await registerForTournament(db, {
        player: viewer.player,
        tournament: found.tournament,
        rules,
        now,
        dice: submit.dice,
      })
    : null;
  if (registered !== null && !registered.ok) return CLOSED;
  await setLastTournament(db, viewer.player, found.tournament.id);
  return answered(
    { kind: 'registered', tournament: found.tournament.name },
    PLAYER_HOME,
    registered?.value.newcomer ?? false,
  );
}
