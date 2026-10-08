import type { JSX } from 'react';
import { loadSingleGame } from '@sportbet/db';
import { gameIdFromText, ruledRules } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { singleGameText } from '../../../../components/predictions/single-game-text';
import { SingleGameView } from '../../../../components/predictions/single-game-view';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { signInAndReturn } from '../../../../server/sign-in/guarded-pages';
import { playerViewer } from '../../../../server/viewer';

/**
 * PredictionResultController::showSingleGame, behind sportbet's `auth`:
 * the reminder mail's link. A guest goes to sign in and comes back here
 * (the return path); an unknown game, or one of a tournament the player
 * may not see (R-50), is a 404; else the game's page.
 */
export default async function PredictionGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  await connection();
  const { id } = await params;
  const game = gameIdFromText(id);
  if (!game.ok) notFound();
  const viewer = await playerViewer();
  if (viewer === null) redirect(signInAndReturn('predictionGame', game.value));
  const single = await loadSingleGame(getDb(), {
    viewer,
    game: game.value,
    now: now(),
    rules: ruledRules,
  });
  if (single === null) notFound();
  return <SingleGameView game={singleGameText(single, game.value)} />;
}
