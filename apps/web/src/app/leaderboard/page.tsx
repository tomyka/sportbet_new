import { connection } from 'next/server';
import { LeaderboardView } from '../../components/leaderboard/leaderboard-view';
import { cachedLeaderboard } from '../../server/leaderboard';

/**
 * MainController::leaderboard: public, every tournament's counted players
 * (R-18, R-77), from a read at most a minute old (cachedLeaderboard).
 */
export default async function LeaderboardPage() {
  await connection();
  return <LeaderboardView rows={await cachedLeaderboard()} />;
}
