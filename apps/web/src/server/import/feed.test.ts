import {
  ok,
  refuseWith,
  seasonCodeSchema,
  type EuroleagueFeed,
} from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { readSeason } from './feed';

// sportbet's `parser->parse(feed->games(season))`, the two steps and their
// refusals as one.

const E2026 = seasonCodeSchema.parse('E2026');
const E2031 = seasonCodeSchema.parse('E2031');

const GAME = {
  round: 1,
  utcDate: '2026-09-24T16:00:00Z',
  local: { club: { name: 'Real Madrid' } },
  road: { club: { name: 'FC Barcelona' } },
  phaseType: { code: 'RS' },
};

const feedOf = (answer: Awaited<ReturnType<EuroleagueFeed['games']>>) => ({
  games: () => Promise.resolve(answer),
});

describe('readSeason', () => {
  it("is the feed's regular season, and asks for the season it was given", async () => {
    const asked: string[] = [];
    const feed: EuroleagueFeed = {
      games: (season) => {
        asked.push(season);
        return Promise.resolve(ok({ data: [GAME] }));
      },
    };
    const read = await readSeason(feed, E2026);
    expect(asked).toEqual([E2026]);
    expect(read).toMatchObject({
      ok: true,
      value: {
        fixtures: [{ round: 1, home: 'Real Madrid', away: 'FC Barcelona' }],
        postSeasonLeftOut: 0,
      },
    });
  });

  it('is a failure of the feed as a problem, naming the season an HTTP error asked about', async () => {
    expect(
      await readSeason(
        feedOf(refuseWith({ kind: 'http-error', status: 404 })),
        E2031,
      ),
    ).toEqual({
      ok: false,
      refusal: { kind: 'http-error', status: 404, season: E2031 },
    });
    expect(
      await readSeason(feedOf(refuseWith({ kind: 'unreachable' })), E2026),
    ).toEqual({ ok: false, refusal: { kind: 'unreachable' } });
  });

  it('is a refusal of the payload as a problem: no games, a malformed game', async () => {
    expect(await readSeason(feedOf(ok({ data: [] })), E2026)).toEqual({
      ok: false,
      refusal: { kind: 'no-games' },
    });
    expect(
      await readSeason(
        feedOf(ok({ data: [GAME, { ...GAME, round: 'x' }] })),
        E2026,
      ),
    ).toEqual({
      ok: false,
      refusal: { kind: 'malformed', number: 2, field: 'round' },
    });
  });
});
