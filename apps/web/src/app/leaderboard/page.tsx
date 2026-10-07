import { loadLeaderboard } from '@sportbet/db';
import { ruledRules } from '@sportbet/domain';
import { connection } from 'next/server';
import { LeaderboardView } from '../../components/leaderboard/leaderboard-view';
import { getDb } from '../../server/db';

/** MainController::leaderboard: public, every tournament's counted players (R-18, R-77). */
export default async function LeaderboardPage() {
  await connection();
  return <LeaderboardView rows={await loadLeaderboard(getDb(), ruledRules)} />;
}
