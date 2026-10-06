import { ruledRules } from '@sportbet/domain';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { savePredictionFromForm } from '../../../../server/predictions/save-prediction';
import { signedInPlayer } from '../../../../server/request-context';
import { formText } from '../../../../server/request/form-input';
import { refuseCrossSite } from '../../../../server/request/route-responses';

/**
 * The autosave's POST (sportbet's POST /prediction/results; decision 1),
 * from this site only (#16). A guest is sportbet's `auth` answer to a JSON
 * request, 401 (decision 8). Everything else is savePredictionFromForm's
 * answer, as JSON.
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await signedInPlayer();
  if (signedIn === null) {
    return Response.json({ message: 'Unauthenticated.' }, { status: 401 });
  }
  const form = await request.formData().catch(() => new FormData());
  const answer = await savePredictionFromForm(getDb(), {
    player: signedIn.player,
    fields: {
      game: formText(form, 'gameID'),
      row: formText(form, 'prediction_gameID'),
      home: formText(form, 'homeTeamScore'),
      away: formText(form, 'awayTeamScore'),
    },
    now: now(),
    rules: ruledRules,
  });
  return Response.json(answer.body, { status: answer.status });
}
