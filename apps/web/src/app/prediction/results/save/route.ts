import { ruledRules } from '@sportbet/domain';
import { SAVE_FIELDS } from '../../../../components/predictions/save-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { pointsChanged } from '../../../../server/points-changed';
import { savePredictionFromForm } from '../../../../server/predictions/save-prediction';
import { formText } from '../../../../server/request/form-input';
import { autosaveRoute } from '../../../../server/request/route-responses';

/**
 * The autosave's POST (sportbet's POST /prediction/results; decision 1),
 * through autosaveRoute (this site only, a guest 401): every other answer
 * is savePredictionFromForm's, as JSON.
 */
export function POST(request: Request): Promise<Response> {
  return autosaveRoute(request, async (player, form) => {
    const answer = await savePredictionFromForm(getDb(), {
      player,
      fields: {
        game: formText(form, SAVE_FIELDS.game),
        row: formText(form, SAVE_FIELDS.row),
        home: formText(form, SAVE_FIELDS.home),
        away: formText(form, SAVE_FIELDS.away),
      },
      now: now(),
      rules: ruledRules,
    });
    // A player switched back on (R-57) is listed again: the board counts them now.
    if (answer.status === 200 && answer.listingChanged) pointsChanged();
    return answer;
  });
}
