import { STANDINGS_DEADLINE_ROUND } from '@sportbet/domain';
import { sql } from 'drizzle-orm';
import { tournaments } from '../tournament/schema';
import { games, rounds } from './schema';

/**
 * ST-2 in SQL, the one place the database renders it: a tournament's
 * standings deadline - the first tip-off from its deadline round on (its
 * own, else STANDINGS_DEADLINE_ROUND) - as a subquery over its games
 * joined to their rounds. Self-contained: it needs only the `tournaments`
 * row in scope, whatever else the query joins or groups. The rule is
 * Season.standingsDeadline's; test/standings-deadline.test.ts holds the
 * two equal on every one of the domain's standingsDeadlineExamples.
 */
export const standingsDeadlineSql = () =>
  sql<Date | null>`(select min(${games.tipOff}) from ${games} inner join ${rounds} on ${rounds.id} = ${games.roundId} where ${games.tournamentId} = ${tournaments.id} and ${rounds.number} >= coalesce(${tournaments.standingsDeadlineRound}, ${STANDINGS_DEADLINE_ROUND}))`.mapWith(
    games.tipOff,
  );
