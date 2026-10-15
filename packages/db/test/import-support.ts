// Shared by the import's db tests: sportbet's E2026 fixture, parsed, and an
// empty tournament with players. No test here reaches the Euroleague host:
// the fixture adapter reads the file, and the Vitest network guard refuses
// any other host.

import {
  DAY_SECONDS,
  parseEuroleagueFeed,
  seasonCodeSchema,
  secondsAfter,
  type EuroleagueFixture,
  type FeedSeason,
  type Tournament,
} from '@sportbet/domain';
import { at, roundNo } from '@sportbet/domain/testing';
import { fileURLToPath } from 'node:url';
import { savePlayers, type Db } from '../src';
import { fixtureEuroleagueFeed } from '../src/import/feed';
import { saveTournament } from '../src/tournament/repository';
import { testPlayer } from '@sportbet/domain/testing';
import { ADA, BEN, CAI, savePlaying, TOURNAMENT } from './world';

export const FIXTURE_PATH = fileURLToPath(
  new URL(
    '../../domain/test/fixtures/euroleague-e2026-games.json',
    import.meta.url,
  ),
);

/** Before the fixture's first tip-off (2026-09-24T16:00:00Z). */
export const BEFORE_SEASON = at('2026-09-20T12:00:00Z');

/** The fixture's regular season, as the feed adapter and the parser give it. */
export async function fixtureSeason(): Promise<FeedSeason> {
  const answer = await fixtureEuroleagueFeed(FIXTURE_PATH).games(
    seasonCodeSchema.parse('E2026'),
  );
  if (!answer.ok) throw new Error('the fixture feed answered a failure');
  const parsed = parseEuroleagueFeed(answer.value);
  if (!parsed.ok) throw new Error('the fixture is refused');
  return parsed.value;
}

/** An empty tournament (no team, round or game) with ADA, BEN and CAI playing it. */
export async function saveEmptyTournament(
  db: Db,
  tournament: Tournament = TOURNAMENT,
): Promise<void> {
  await saveTournament(db, tournament);
  await savePlayers(db, [
    testPlayer(ADA, 'ada'),
    testPlayer(BEN, 'ben'),
    testPlayer(CAI, 'cai'),
  ]);
  await savePlaying(db, tournament, ADA, BEN, CAI);
}

/**
 * A full season as the feed would list it: the fixture's 20 clubs in a
 * double round robin, 38 rounds of 10 games, one round a week; for timing.
 */
export async function fullSeason(): Promise<readonly EuroleagueFixture[]> {
  const clubs = [
    ...new Set(
      (await fixtureSeason()).fixtures.flatMap((f) => [f.home, f.away]),
    ),
  ].sort();
  const others = clubs.slice(1);
  const fixtures: EuroleagueFixture[] = [];
  for (let leg = 0; leg < 2; leg += 1) {
    for (let day = 0; day < 19; day += 1) {
      const round = leg * 19 + day + 1;
      const ring = [...others.slice(day), ...others.slice(0, day)];
      const pairs = [[clubs[0], ring[0]], ...pairUp(ring.slice(1))];
      for (const [a, b] of pairs) {
        if (a === undefined || b === undefined) throw new Error('short ring');
        const [home, away] = leg === 0 ? [a, b] : [b, a];
        fixtures.push({
          round: roundNo(round),
          tipOff: secondsAfter(
            at('2026-09-24T16:00:00Z'),
            (round - 1) * 7 * DAY_SECONDS,
          ),
          home,
          away,
        });
      }
    }
  }
  return fixtures;
}

function pairUp(ring: readonly string[]): (string | undefined)[][] {
  const half = ring.length / 2;
  return ring
    .slice(0, half)
    .map((club, i) => [club, ring[ring.length - 1 - i]]);
}
