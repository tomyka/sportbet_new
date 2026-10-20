import { saveSurvivalPick } from '@sportbet/db';
import type { Db } from '@sportbet/db/connection';
import {
  survivalPickFormEntry,
  survivalSaveLimits,
  type Instant,
  type PickRefusal,
  type PlayerId,
  type SurvivalFormRefusal,
} from '@sportbet/domain';
import type { SurvivalSaveAnswer } from '../../components/survival/survival-protocol';
import {
  orBusy,
  refusedAnswer,
  throttledAnswer,
} from '../request/save-answers';
import { throttle } from '../sign-in/throttle';
import { SURVIVAL_TEXTS } from './texts';

const FORM_TEXTS: Readonly<Record<SurvivalFormRefusal, string>> = {
  'no-team': SURVIVAL_TEXTS.noTeam,
  'bad-team': SURVIVAL_TEXTS.unknownTeam,
  'bad-round': SURVIVAL_TEXTS.roundChanged,
};

const PICK_TEXTS: Readonly<Record<PickRefusal, string>> = {
  'unknown-team': SURVIVAL_TEXTS.unknownTeam,
  'no-current-round': SURVIVAL_TEXTS.noCurrentRound,
  'round-changed': SURVIVAL_TEXTS.roundChanged,
  'round-has-no-survival': SURVIVAL_TEXTS.roundHasNoSurvival,
  'round-already-scored': SURVIVAL_TEXTS.roundAlreadyScored,
  'team-not-playing': SURVIVAL_TEXTS.teamNotPlaying,
  'team-already-started': SURVIVAL_TEXTS.teamAlreadyStarted,
  'pick-locked': SURVIVAL_TEXTS.pickLocked,
  'team-used-in-run': SURVIVAL_TEXTS.teamUsedInRun,
};

/** The form refused, as sportbet answers it: one message, `{success: false, message}`. */
export const formRefusalAnswer = (
  refusal: SurvivalFormRefusal,
): SurvivalSaveAnswer => refusedAnswer(FORM_TEXTS[refusal]);

/** SurvivalPick::decide's refusal, as sportbet answers it. */
export const pickRefusalAnswer = (refusal: PickRefusal): SurvivalSaveAnswer =>
  refusedAnswer(PICK_TEXTS[refusal]);

/**
 * updatePredictionSurvivalUser as a use case: the form first (a post it
 * refuses does not count against the throttle), then survivalSaveLimits,
 * then saveSurvivalPick under the ruled rules, whose refusals are
 * sportbet's texts. A lock waited for past 5 s: 503. A pick changes no
 * stored points, so nothing calls pointsChanged().
 */
export async function saveSurvivalPickFromForm(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly fields: { readonly team: string; readonly round: string };
    readonly now: Instant;
  },
): Promise<SurvivalSaveAnswer> {
  const { player, fields, now } = input;
  const checked = survivalPickFormEntry({
    teamID: fields.team,
    round: fields.round,
  });
  if (!checked.ok) return formRefusalAnswer(checked.refusal);
  const verdict = await throttle(db, survivalSaveLimits(player), now);
  if (!verdict.allowed) return throttledAnswer(verdict.minutes);
  return orBusy(async () => {
    const saved = await saveSurvivalPick(db, {
      player,
      entry: checked.value,
      now,
    });
    return saved.ok
      ? { status: 200, body: { success: true } }
      : pickRefusalAnswer(saved.refusal);
  }, SURVIVAL_TEXTS.notSaved);
}
