import {
  Game,
  gameId,
  instantFrom,
  Rate,
  Round,
  roundNumber,
  teamId,
  type EmailAddress,
  type Result,
  type TeamId,
  type TournamentProfile,
} from '@sportbet/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { playerSettings } from '../account/schema';
import type { Db } from '../client';
import { excluded } from '../edge';
import { advanceIdentitySequences } from '../identity';
import { players, tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { saveGames, saveRounds } from '../season/repository';
import { games } from '../season/schema';
import { saveTeams } from '../team/repository';
import { saveTournamentProfile } from '../tournament/profile';
import {
  findTournamentBySlug,
  insertTournaments,
  type NewTournament,
} from '../tournament/repository';

/** The seed's own constants are valid; a refusal is a programmer error. */
function must<T, R extends string>(result: Result<T, R>): T {
  if (!result.ok) throw new Error(`seed: ${result.refusal}`);
  return result.value;
}
const team = (id: string): TeamId => must(teamId(id));
const mustRound = (n: number) => must(roundNumber(n));
const mustRate = (n: number) => must(Rate.of(n));

/** A staging tournament and what the hub shows of it. */
export interface StagingTournament {
  readonly tournament: NewTournament;
  readonly profile: TournamentProfile;
}

const EUROLEAGUE = {
  format: 'euroleague',
  standingsDeadlineRound: null,
  survival: true,
  standingsTableFinal: false,
} as const;

const PROFILE = {
  sport: 'basketball',
  description: null,
  isPublic: true,
} as const;

/**
 * Staging's fake data. Never real players or real tournaments' results.
 * The hub's three groups (2026/27 active, 2027/28 upcoming, 2025/26
 * finished) and a non-public tournament, finished so that no sign-up can
 * join it (R-50, and Task 6A).
 */
export const STAGING_TOURNAMENTS: readonly StagingTournament[] = [
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2025-26',
      name: 'Euroleague 2025/26',
      endsOn: '2026-05-24',
    },
    profile: { ...PROFILE, status: 'finished', startsOn: '2025-10-01' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2026-27',
      name: 'Euroleague 2026/27',
      endsOn: '2027-05-23',
    },
    profile: { ...PROFILE, status: 'active', startsOn: '2026-09-30' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'euroleague-2027-28',
      name: 'Euroleague 2027/28',
      endsOn: '2028-05-21',
    },
    profile: { ...PROFILE, status: 'upcoming', startsOn: '2027-10-01' },
  },
  {
    tournament: {
      ...EUROLEAGUE,
      slug: 'bandomasis-turnyras',
      name: 'Bandomasis turnyras',
      endsOn: '2026-06-30',
    },
    profile: {
      ...PROFILE,
      status: 'finished',
      startsOn: '2026-01-01',
      isPublic: false,
    },
  },
];

/**
 * Euroleague 2026/27's games. Ids are from 9001, clear of any a real season
 * uses on staging.
 * - 9001, far ahead (2027-03-04): a next game makes R-48 join every staging
 *   sign-up to 2026/27 rather than to the newer 2027/28, which has none; it
 *   fills the guest's "Artėjančios rungtynės", and the owner predicts it.
 * - 9002, Real Madrid at home, started (2026-09-01) with no result: the
 *   predictions page's locked row and the single game's "Žaidimas jau
 *   prasidėjo" (slice 6). A newcomer joining 2026/27 gets R-9's late
 *   fill-in for it.
 */
const STAGING_SEASON = {
  plays: 'euroleague-2026-27',
  teams: [
    { id: team('9001'), name: 'Zalgiris Kaunas' },
    { id: team('9002'), name: 'Real Madrid' },
  ],
  round: {
    id: 9001,
    name: '1 turas',
    round: Round.stored({
      number: mustRound(1),
      stage: 'regular',
      rate: mustRate(1),
      survival: false,
      knockout: false,
    }),
  },
  // 9002 is the return game: one round holds a pair of teams once each way
  // (games_round_teams_unique).
  games: [
    { id: 9001, tipOff: '2027-03-04T18:00:00Z', returnGame: false },
    { id: 9002, tipOff: '2026-09-01T18:00:00Z', returnGame: true },
  ],
} as const;

/**
 * The one staging account: its address comes from STAGING_ACCOUNT_EMAIL (a
 * secret; the owner's on staging, a test address in CI's E2E stack), never
 * from this file. A player, not an admin: admin tiers are slice 13's.
 */
export const STAGING_ACCOUNT = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  plays: 'euroleague-2026-27',
} as const;

/**
 * Inserts the staging tournaments, and, given an address, the staging
 * account, its settings and its place in one tournament. Running it again
 * keeps one account and moves it to the address given.
 */
export async function seedStaging(
  db: Db,
  accountEmail: EmailAddress | null,
): Promise<void> {
  await insertTournaments(
    db,
    STAGING_TOURNAMENTS.map(({ tournament }) => tournament),
  );
  for (const { tournament, profile } of STAGING_TOURNAMENTS) {
    const stored = await findTournamentBySlug(db, tournament.slug);
    if (stored === undefined) {
      throw new Error('seed: a staging tournament is missing');
    }
    await saveTournamentProfile(db, stored, profile);
  }
  await seedSeason(db);
  if (accountEmail === null) return;
  await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(players)
      .values({
        username: STAGING_ACCOUNT.username,
        email: accountEmail,
        name: STAGING_ACCOUNT.name,
        surname: STAGING_ACCOUNT.surname,
      })
      .onConflictDoUpdate({
        target: players.username,
        set: { email: excluded(players.email) },
      })
      .returning({ id: players.id });
    const tournament = await findTournamentBySlug(tx, STAGING_ACCOUNT.plays);
    if (account === undefined || tournament === undefined) {
      throw new Error('seed: the staging account or its tournament is missing');
    }
    await tx
      .insert(playerSettings)
      .values({ playerId: account.id })
      .onConflictDoNothing({ target: playerSettings.playerId });
    await tx
      .insert(tournamentPlayers)
      .values({
        tournamentId: tournament.id,
        playerId: account.id,
        switchedOff: false,
        fillIns: 0,
      })
      .onConflictDoNothing({
        target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
      });
    // A blank row per game, as joining writes (PredictionRows::seedMissing):
    // without one, a save answers that the prediction is not the player's.
    const seasonGames = z
      .array(z.object({ id: z.int() }))
      .parse(
        await tx
          .select({ id: games.id })
          .from(games)
          .where(eq(games.tournamentId, tournament.id)),
      );
    if (seasonGames.length > 0) {
      await tx
        .insert(matchPredictions)
        .values(
          seasonGames.map(({ id }) => ({
            playerId: account.id,
            gameId: id,
            home: null,
            away: null,
            origin: 'real' as const,
            filledInAt: null,
          })),
        )
        .onConflictDoNothing({
          target: [matchPredictions.playerId, matchPredictions.gameId],
        });
    }
  });
}

/** STAGING_SEASON, saved again on every run (each save is an upsert). */
async function seedSeason(db: Db): Promise<void> {
  const tournament = await findTournamentBySlug(db, STAGING_SEASON.plays);
  const [home, away] = STAGING_SEASON.teams;
  if (tournament === undefined) {
    throw new Error('seed: the staging season has no tournament');
  }
  await saveTeams(db, tournament, STAGING_SEASON.teams);
  await saveRounds(db, tournament, [STAGING_SEASON.round]);
  await saveGames(
    db,
    tournament,
    STAGING_SEASON.games.map(({ id, tipOff, returnGame }) =>
      must(
        Game.schedule({
          id: must(gameId(id)),
          round: STAGING_SEASON.round.round.number,
          home: returnGame ? away.id : home.id,
          away: returnGame ? home.id : away.id,
          tipOff: must(instantFrom(tipOff)),
        }),
      ),
    ),
  );
  await advanceIdentitySequences(db);
}
