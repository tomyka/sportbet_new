import { loadPredictionsPage } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { PredictionsView } from '../../../components/predictions/predictions-view';
import { PREDICTIONS_PATH } from '../../../components/shell/shell-paths';
import { now } from '../../../server/clock';
import { getDb } from '../../../server/db';
import { requestContext } from '../../../server/request-context';

/**
 * PredictionResultController::getPredictionResultsUser, behind sportbet's
 * `auth`: a guest goes to sign in and comes back here (the return path);
 * a player sees their rows of the request's tournament (R-28) at
 * `?event=` - a round's id, "all" (R-58), or the current round.
 */
export default async function PredictionResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  await connection();
  const { event } = await searchParams;
  const requested = typeof event === 'string' ? event : null;
  const context = await requestContext();
  if (context.player === null) {
    const here =
      requested === null
        ? PREDICTIONS_PATH
        : `${PREDICTIONS_PATH}?event=${encodeURIComponent(requested)}`;
    redirect(`/login?intended=${encodeURIComponent(here)}`);
  }
  const page =
    context.tournament === null
      ? null
      : await loadPredictionsPage(getDb(), {
          player: context.player.id,
          tournament: context.tournament.tournament,
          requested,
          now: now(),
          rules: ruledRules,
        });
  return <PredictionsView page={page} />;
}
