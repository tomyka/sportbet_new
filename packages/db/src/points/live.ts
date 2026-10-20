import { eq, type SQL } from 'drizzle-orm';
import { LIVE_SOURCE } from './names';
import {
  gameOdds,
  matchPoints,
  standingsPoints,
  survivalPoints,
} from './schema';

/**
 * The live rows of each points table, as a condition for a `where` or a
 * join: the one place a query names the source it reads, so no reader can
 * forget the filter and sum the retired `production` and `sportbet` rows
 * into a total. Only the deletions of a game's or a player's own rows,
 * which go under every source because the row's owner ceases to exist
 * (deleteGame, deleteAccount), and season/admin.ts's "does a points row name
 * this round" read, which counts any, go without it
 * (`test/points-scope.test.ts` lists them).
 */
export const liveRows = {
  gameOdds: (): SQL => eq(gameOdds.source, LIVE_SOURCE),
  matchPoints: (): SQL => eq(matchPoints.source, LIVE_SOURCE),
  standingsPoints: (): SQL => eq(standingsPoints.source, LIVE_SOURCE),
  survivalPoints: (): SQL => eq(survivalPoints.source, LIVE_SOURCE),
};
