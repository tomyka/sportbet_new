import { euroleagueFeedOf } from '@sportbet/db';
import {
  parseEuroleagueFeed,
  refuseWith,
  type DetailedResult,
  type EuroleagueFeed,
  type FeedSeason,
  type SeasonCode,
} from '@sportbet/domain';
import { env } from '../../env';
import { importProblem, type ImportProblem } from './problem';

/**
 * The feed the environment chose (EUROLEAGUE_FEED, held to SPORTBET_ENV in
 * env.ts): the live one on staging and production, sportbet's fixture in CI
 * and in every test. The one place the web app asks for it; it names no host.
 */
export function chosenFeed(): EuroleagueFeed {
  return euroleagueFeedOf(env());
}

/**
 * sportbet's `parser->parse(feed->games(season))`: the season's regular-season
 * fixtures (R-94), or the problem - a failure of the feed or a refusal of what
 * it answered - that the screen words.
 */
export async function readSeason(
  feed: EuroleagueFeed,
  season: SeasonCode,
): Promise<DetailedResult<FeedSeason, ImportProblem>> {
  const answer = await feed.games(season);
  if (!answer.ok) return refuseWith(importProblem(answer.refusal, season));
  const parsed = parseEuroleagueFeed(answer.value);
  return parsed.ok ? parsed : refuseWith(importProblem(parsed.refusal, season));
}
