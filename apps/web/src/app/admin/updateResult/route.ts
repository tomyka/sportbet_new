import { saveResult } from '@sportbet/db';
import { gameIdFromText, ruledRules } from '@sportbet/domain';
import { NextResponse } from 'next/server';
import {
  RESULT_FIELDS,
  type ResultAnswer,
} from '../../../components/admin/result-protocol';
import { resultsManager } from '../../../server/admin/gate';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { cryptoDice } from '../../../server/dice';
import { formText } from '../../../server/request/form-input';
import {
  notFound,
  refuseCrossSite,
  seeOther,
} from '../../../server/request/route-responses';
import { answerOf } from '../../../server/results/save-result';

/**
 * ResultController::updateResult behind AdminMiddleware (R-26 amended):
 * from this site only (#16), for a results manager or superadmin, else
 * home (decision 2). An unreadable or unknown gameID is a 404, as
 * sportbet's findOrFail. The result is saved in one transaction
 * (saveResult) under the live rule set, its fill-ins drawn with
 * node:crypto (cryptoDice).
 */
export async function POST(request: Request): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  if ((await resultsManager()) === null) return seeOther('/');
  // A body that is not a form reads as an empty one (no game: a 404), not a 500.
  const form = await request.formData().catch(() => new FormData());
  const game = gameIdFromText(formText(form, RESULT_FIELDS.game));
  if (!game.ok) return notFound();
  const saved = await saveResult(getDb(), {
    game: game.value,
    boxes: {
      home: formText(form, RESULT_FIELDS.home),
      away: formText(form, RESULT_FIELDS.away),
    },
    now: now(),
    rules: ruledRules,
    dice: cryptoDice,
  });
  if (saved.ok) return answerJson(answerOf(saved));
  const { refusal } = saved;
  if (refusal.kind === 'no-game') return notFound();
  return answerJson(answerOf({ ok: false, refusal }));
}

function answerJson(answer: ResultAnswer): Response {
  return NextResponse.json(answer.body, { status: answer.status });
}
