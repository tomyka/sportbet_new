import {
  gameIdFromText,
  mayEnterResults,
  ruledRules,
  type PlayerId,
} from '@sportbet/domain';
import { NextResponse } from 'next/server';
import { RESULT_FIELDS } from '../../../components/admin/result-protocol';
import { adminGate } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { cryptoDice } from '../../../server/dice';
import { formText } from '../../../server/request/form-input';
import {
  notFound,
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';
import { pointsChanged } from '../../../server/points-changed';
import {
  SAVED_ANSWER,
  saveResultFromForm,
} from '../../../server/results/save-result';

/**
 * ResultController::updateResult behind AdminMiddleware (R-26 amended):
 * from this site only (#16), for a role that may enter results, else home
 * (decision 2). An unreadable gameID is a 404; everything else is
 * saveResultFromForm's (server/results/save-result.ts), answered as JSON,
 * by the session's player, under the live rule set, its fill-ins drawn
 * with node:crypto (cryptoDice).
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const admin = await adminGate(mayEnterResults);
  if (admin === null) return seeOther('/');
  // A body that is not a form reads as an empty one (no game: a 404), not a 500.
  return saveFrom(
    admin.player,
    await request.formData().catch(() => new FormData()),
  );
}

/** The posted boxes saved by `by`: an unreadable gameID or no such game a 404, else saveResultFromForm's answer as JSON. */
async function saveFrom(by: PlayerId, form: FormData): Promise<Response> {
  const game = gameIdFromText(formText(form, RESULT_FIELDS.game));
  if (!game.ok) return notFound();
  const saved = await saveResultFromForm(getDb(), {
    by,
    game: game.value,
    boxes: {
      home: formText(form, RESULT_FIELDS.home),
      away: formText(form, RESULT_FIELDS.away),
    },
    now: now(),
    rules: ruledRules,
    dice: cryptoDice,
  });
  if (saved.kind === 'not-found') return notFound();
  if (saved.answer === SAVED_ANSWER) pointsChanged();
  return NextResponse.json(saved.answer.body, { status: saved.answer.status });
}
