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
import { findAccountByEmail } from '../account/repository';
import { playerSettings } from '../account/schema';
import type { Db, Executor } from '../client';
import { keyOf } from '../edge';
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
 * Euroleague 2026/27's teams, rounds and games. Ids are from 9001, clear of
 * any a real season uses on staging.
 * - 20 teams, a full Euroleague table, so the standings ladder (slice 9) can
 *   be tried whole: 8 play-off and 4 Final Four ticks, a full stage refused,
 *   dragging across a long table.
 * - 9001, round 1, far ahead (2027-03-04): a next game makes R-48 join every
 *   staging sign-up to 2026/27 rather than to the newer 2027/28, which has
 *   none; it fills the guest's "Artėjančios rungtynės", and the owner
 *   predicts it.
 * - 9002, round 1, Real Madrid at home, started (2026-09-01) with no result:
 *   the predictions page's locked row and the single game's "Žaidimas jau
 *   prasidėjo" (slice 6). A newcomer joining 2026/27 gets R-9's late fill-in
 *   for it.
 * - 9003, round 5 (2027-03-10), after 9001 so 9001 stays the next game: the
 *   standings deadline (ST-2), so the standings page says when it closes
 *   (R-80) - and R-8 keeps registration open until then.
 */
const STAGING_SEASON = {
  plays: 'euroleague-2026-27',
  teams: [
    { id: team('9001'), name: 'Zalgiris Kaunas' },
    { id: team('9002'), name: 'Real Madrid' },
    { id: team('9003'), name: 'Olympiacos' },
    { id: team('9004'), name: 'Panathinaikos' },
    { id: team('9005'), name: 'Fenerbahce' },
    { id: team('9006'), name: 'Anadolu Efes' },
    { id: team('9007'), name: 'Barcelona' },
    { id: team('9008'), name: 'Monaco' },
    { id: team('9009'), name: 'Partizan' },
    { id: team('9010'), name: 'Crvena Zvezda' },
    { id: team('9011'), name: 'Maccabi Tel Aviv' },
    { id: team('9012'), name: 'Bayern Munich' },
    { id: team('9013'), name: 'Virtus Bologna' },
    { id: team('9014'), name: 'Olimpia Milano' },
    { id: team('9015'), name: 'Baskonia' },
    { id: team('9016'), name: 'ASVEL' },
    { id: team('9017'), name: 'Paris Basketball' },
    { id: team('9018'), name: 'Hapoel Tel Aviv' },
    { id: team('9019'), name: 'Dubai Basketball' },
    { id: team('9020'), name: 'Valencia' },
  ],
  rounds: [
    {
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
    {
      id: 9005,
      name: '5 turas',
      round: Round.stored({
        number: mustRound(5),
        stage: 'regular',
        rate: mustRate(1),
        survival: false,
        knockout: false,
      }),
    },
  ],
  // 9002 is 9001's return game: one round holds a pair of teams once each way
  // (games_round_teams_unique).
  games: [
    {
      id: 9001,
      round: 1,
      home: '9001',
      away: '9002',
      tipOff: '2027-03-04T18:00:00Z',
    },
    {
      id: 9002,
      round: 1,
      home: '9002',
      away: '9001',
      tipOff: '2026-09-01T18:00:00Z',
    },
    {
      id: 9003,
      round: 5,
      home: '9003',
      away: '9004',
      tipOff: '2027-03-10T18:00:00Z',
    },
  ],
} as const;

/**
 * The one staging account: its address comes from STAGING_ACCOUNT_EMAIL (a
 * secret; the owner's on staging, a test address in CI's E2E stack), never
 * from this file. A superadmin (R-26 amended): the owner's account on
 * staging, and CI's E2E account, enters results (slice 7).
 */
export const STAGING_ACCOUNT = {
  username: 'savininkas',
  name: 'Savininkas',
  surname: '',
  plays: 'euroleague-2026-27',
} as const;

/**
 * Inserts the staging tournaments, and, given an address, the staging
 * account, its settings and its place in one tournament (stagingAccount:
 * found by its address, never taken over). Running it again with the same
 * address keeps one account.
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
    const account = await stagingAccount(tx, accountEmail);
    const tournament = await findTournamentBySlug(tx, STAGING_ACCOUNT.plays);
    if (tournament === undefined) {
      throw new Error("seed: the staging account's tournament is missing");
    }
    await seatStagingAccount(tx, account.id, tournament.id);
  });
}

/**
 * The staging account made a superadmin and seated in its tournament, with
 * a blank row per game as joining writes (PredictionRows::seedMissing):
 * without one, a save answers that the prediction is not the player's.
 */
async function seatStagingAccount(
  tx: Executor,
  playerId: number,
  tournamentId: number,
): Promise<void> {
  await tx
    .insert(playerSettings)
    .values({ playerId, role: 'superadmin' })
    .onConflictDoUpdate({
      target: playerSettings.playerId,
      set: { role: 'superadmin' },
    });
  await tx
    .insert(tournamentPlayers)
    .values({ tournamentId, playerId, switchedOff: false, fillIns: 0 })
    .onConflictDoNothing({
      target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
    });
  const seasonGames = z
    .array(z.object({ id: z.int() }))
    .parse(
      await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.tournamentId, tournamentId)),
    );
  if (seasonGames.length > 0) {
    await tx
      .insert(matchPredictions)
      .values(
        seasonGames.map(({ id }) => ({
          playerId,
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
}

const accountIds = z.array(z.object({ id: z.int() }));

/**
 * The staging account, found by its exact address (findAccountByEmail) or
 * created when neither the address nor the staging username exists. It is
 * never taken over or moved: the staging username under another address,
 * or the address under another account, is refused (a security review of
 * slice 7), so the superadmin role below only ever reaches this account.
 */
async function stagingAccount(
  tx: Executor,
  email: EmailAddress,
): Promise<{ id: number }> {
  const [byName] = accountIds.parse(
    await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.username, STAGING_ACCOUNT.username)),
  );
  // The address looked up only by findAccountByEmail (exact equality,
  // CLAUDE.md), never compared here: the staging username is this account
  // only if the address finds that very account.
  const byEmail = await findAccountByEmail(tx, email);
  if (byName !== undefined) {
    if (
      byEmail === undefined ||
      keyOf(byEmail.player, 'player') !== byName.id
    ) {
      throw new Error(
        'seed: the staging username already belongs to another address',
      );
    }
    return { id: byName.id };
  }
  if (byEmail !== undefined) {
    throw new Error(
      'seed: the staging address already belongs to another account',
    );
  }
  const [created] = accountIds.parse(
    await tx
      .insert(players)
      .values({
        username: STAGING_ACCOUNT.username,
        email,
        name: STAGING_ACCOUNT.name,
        surname: STAGING_ACCOUNT.surname,
      })
      .returning({ id: players.id }),
  );
  if (created === undefined) {
    throw new Error('seed: the staging account was not created');
  }
  return created;
}

/**
 * Where the seed may run (SPORTBET_ENV, named explicitly): a developer's
 * machine ('local'), CI's E2E stack ('ci') and staging - never production,
 * a value it does not know, or none at all.
 */
export function seedEnvironmentAllowed(value: string | undefined): boolean {
  return value === 'local' || value === 'ci' || value === 'staging';
}

/** STAGING_SEASON, saved again on every run (each save is an upsert). */
async function seedSeason(db: Db): Promise<void> {
  const tournament = await findTournamentBySlug(db, STAGING_SEASON.plays);
  if (tournament === undefined) {
    throw new Error('seed: the staging season has no tournament');
  }
  await saveTeams(db, tournament, STAGING_SEASON.teams);
  await saveRounds(db, tournament, STAGING_SEASON.rounds);
  await saveGames(
    db,
    tournament,
    STAGING_SEASON.games.map(({ id, round, home, away, tipOff }) =>
      must(
        Game.schedule({
          id: must(gameId(id)),
          round: mustRound(round),
          home: team(home),
          away: team(away),
          tipOff: must(instantFrom(tipOff)),
        }),
      ),
    ),
  );
  await advanceIdentitySequences(db);
}
