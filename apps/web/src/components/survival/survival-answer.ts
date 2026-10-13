import { postSave, refusalSchema, type NotSaved } from '../save/laravel-save';
import { SURVIVAL_SAVE_PATH } from '../shell/shell-paths';
import {
  SURVIVAL_NOT_SAVED,
  survivalPickBody,
  survivalSavedSchema,
  type SurvivalPickRequest,
} from './survival-protocol';

/** What the grid shows after a post. */
export type SurvivalOutcome = { readonly kind: 'saved' } | NotSaved;

/**
 * A pick's answer as survival.blade.php shows it: 200 saved; a 422 its
 * own message, "a refusal written for the player"; anything else - a 429,
 * a 503, a 401, a 500, a body that is not the answer - SURVIVAL_NOT_SAVED.
 */
export function readSurvivalAnswer(
  status: number,
  body: unknown,
): SurvivalOutcome {
  if (status === 200 && survivalSavedSchema.safeParse(body).success) {
    return { kind: 'saved' };
  }
  const refusal = status === 422 ? refusalSchema.safeParse(body) : null;
  return {
    kind: 'refused',
    message:
      refusal?.success === true ? refusal.data.message : SURVIVAL_NOT_SAVED,
  };
}

/** Posts one pick as sportbet's grid does, and reads the answer. */
export const postSurvivalPick = (
  pick: SurvivalPickRequest,
): Promise<SurvivalOutcome> =>
  postSave(
    SURVIVAL_SAVE_PATH,
    survivalPickBody(pick),
    readSurvivalAnswer,
    SURVIVAL_NOT_SAVED,
  );
