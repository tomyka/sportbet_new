import { STANDINGS_FIELDS } from '../../../../components/standings/standings-protocol';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { formText } from '../../../../server/request/form-input';
import { autosaveRoute } from '../../../../server/request/route-responses';
import { saveStandingsRowFromForm } from '../../../../server/standings/save-standings';

/**
 * The ladder's row save (sportbet's POST /prediction/standings; Next
 * serves no page and handler at one path, slice 6 decision 1), through
 * autosaveRoute (this site only, a guest 401): every other answer is
 * saveStandingsRowFromForm's, as JSON.
 */
export function POST(request: Request): Promise<Response> {
  return autosaveRoute(request, (player, form) =>
    saveStandingsRowFromForm(getDb(), {
      player,
      fields: {
        team: formText(form, STANDINGS_FIELDS.team),
        place: formText(form, STANDINGS_FIELDS.place),
        playOffs: formText(form, STANDINGS_FIELDS.playOffs),
        finalFour: formText(form, STANDINGS_FIELDS.finalFour),
        finalPlace: formText(form, STANDINGS_FIELDS.finalPlace),
      },
      now: now(),
    }),
  );
}
