import { STANDINGS_DEADLINE_ROUND } from '@sportbet/domain';
import { sql, type SQL } from 'drizzle-orm';
import { tournaments } from '../tournament/schema';
import { games, rounds } from './schema';

/**
 * The round that closes a tournament's standings: the first at or after
 * its deadline round (its own, else STANDINGS_DEADLINE_ROUND) that has any
 * game, null with none.
 */
const standingsRoundSql = () =>
  sql`(select min(${rounds.number}) from ${games} inner join ${rounds} on ${rounds.id} = ${games.roundId} where ${games.tournamentId} = ${tournaments.id} and ${rounds.number} >= coalesce(${tournaments.standingsDeadlineRound}, ${STANDINGS_DEADLINE_ROUND}))`;

/**
 * ST-2 in SQL, the one place the database renders it: whether every game of
 * a tournament's standings round (the first round at or after the deadline
 * round that has any) has a result, as a subquery needing only the
 * `tournaments` row in scope. Null with no such round (never closes). The
 * rule is Season.standingsCloses's; test/standings-closes.test.ts holds the
 * two equal on every one of the domain's standingsDeadlineExamples.
 */
export const standingsClosesSql = (): {
  readonly complete: SQL<boolean | null>;
} => ({
  complete: sql<
    boolean | null
  >`(select bool_and(${games.homeScore} is not null and ${games.awayScore} is not null) from ${games} inner join ${rounds} on ${rounds.id} = ${games.roundId} where ${games.tournamentId} = ${tournaments.id} and ${rounds.number} = ${standingsRoundSql()} having count(*) > 0)`,
});
