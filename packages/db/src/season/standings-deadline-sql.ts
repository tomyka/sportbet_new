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

/** An aggregate over the standings round's games, null when it has none. */
const overStandingsRound = <T>(aggregate: SQL): SQL<T | null> =>
  sql<T | null>`(select ${aggregate} from ${games} inner join ${rounds} on ${rounds.id} = ${games.roundId} where ${games.tournamentId} = ${tournaments.id} and ${rounds.number} = ${standingsRoundSql()} having count(*) > 0)`;

/**
 * ST-2 in SQL, the one place the database renders it: how a tournament's
 * standings close, summed up per tournament without loading its games, as
 * two subqueries over the games of its standings round (the first round
 * at or after the deadline round that has any). Self-contained: each needs
 * only the `tournaments` row in scope, whatever else the query joins or
 * groups. `complete` - every game of that round has a result - is null
 * with no such round (never closes); `lastTipOff` is the round's latest
 * tip-off. The rule is Season.standingsCloses's;
 * test/standings-deadline.test.ts holds the two equal on every one of the
 * domain's standingsDeadlineExamples.
 */
export const standingsClosesSql = (): {
  readonly complete: SQL<boolean | null>;
  readonly lastTipOff: SQL<Date | null>;
} => ({
  complete: overStandingsRound<boolean>(
    sql`bool_and(${games.homeScore} is not null and ${games.awayScore} is not null)`,
  ),
  lastTipOff: overStandingsRound<Date>(sql`max(${games.tipOff})`).mapWith(
    games.tipOff,
  ),
});
