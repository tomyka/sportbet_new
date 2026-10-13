import { SURVIVAL_FIELDS } from '../../../../components/survival/survival-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { formText } from '../../../../server/request/form-input';
import { autosaveRoute } from '../../../../server/request/route-responses';
import { saveSurvivalPickFromForm } from '../../../../server/survival/save-survival';

/**
 * The survival pick's save (sportbet's POST /prediction/predictionSurvival;
 * Next serves no page and handler at one path, slice 6 decision 1),
 * through autosaveRoute (this site only, a guest 401): every other answer
 * is saveSurvivalPickFromForm's, as JSON.
 */
export function POST(request: Request): Promise<Response> {
  return autosaveRoute(request, (player, form) =>
    saveSurvivalPickFromForm(getDb(), {
      player,
      fields: {
        team: formText(form, SURVIVAL_FIELDS.team),
        round: formText(form, SURVIVAL_FIELDS.round),
      },
      now: now(),
    }),
  );
}
