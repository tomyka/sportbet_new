import {
  joinTournament,
  ok,
  registrationIsOpen,
  type FillInDice,
  type Instant,
  type JoinCandidate,
  type JoiningRefusal,
  type PlayerId,
  type Result,
  type RuleSet,
  type Tournament,
} from '@sportbet/domain';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { inChunks, keyOf } from '../edge';
import { tournamentPlayers } from '../player/schema';
import { matchPredictions } from '../prediction/schema';
import { recalculateUnderRuleSet } from '../recalculation/repository';
import { loadSeason } from '../season/repository';
import { standingsPredictions } from '../standings/schema';
import { listTeams } from '../team/repository';
import { loadTournamentCatalogue } from '../tournament/catalogue';

/** Every tournament with its season and public switch, by id: what a new account may join. */
export async function loadJoinCandidates(
  db: Executor,
): Promise<JoinCandidate[]> {
  const candidates: JoinCandidate[] = [];
  for (const { tournament, profile } of await loadTournamentCatalogue(db)) {
    candidates.push({
      tournament,
      season: await loadSeason(db, tournament),
      isPublic: profile.isPublic,
    });
  }
  return candidates;
}

/**
 * Whether a guest may register at all (ChecksRegistrationDeadline::
 * anyTournamentIsJoinable, registrationIsOpen) under the rule set, over
 * the tournaments sign-up may join (R-50): asked on every guest page, so it
 * reads one catalogue row per tournament (loadTournamentCatalogue: its
 * window and public switch), never a season.
 */
export async function isRegistrationOpen(
  db: Executor,
  now: Instant,
  rules: RuleSet,
): Promise<boolean> {
  const windows = (await loadTournamentCatalogue(db)).map(
    ({ window, profile }) => ({ window, isPublic: profile.isPublic }),
  );
  return registrationIsOpen(windows, now, rules);
}

export interface TournamentJoin {
  readonly player: PlayerId;
  readonly tournament: Tournament;
  readonly rules: RuleSet;
  readonly now: Instant;
  /** The fill-in generator's randomness (FI-2): a late joiner's rows. */
  readonly dice: FillInDice;
}

/** What a join wrote: whether the place is new, and how many late fill-ins. */
export interface Joined {
  readonly newcomer: boolean;
  readonly lateFillIns: number;
}

const placeRows = z.array(z.object({ player: z.int() }));

/**
 * TournamentRegistrationService::register, in one transaction (a savepoint
 * when `db` is one): the domain decides (joinTournament) from the
 * tournament's season, teams and whether the player is in it; each row is
 * then inserted only where it is missing, so a second join writes nothing
 * (PredictionRows::seedMissing). A late joiner's fill-ins (R-9) are scored
 * by recalculateUnderRuleSet under the same rule set - the one way derived
 * rows are made - whose refusal is an inconsistent database: it throws, and
 * the join is rolled back.
 */
export async function registerForTournament(
  db: Executor,
  joining: TournamentJoin,
): Promise<Result<Joined, JoiningRefusal>> {
  const { player, tournament, rules, now, dice } = joining;
  const playerKey = keyOf(player, 'player');
  return db.transaction(async (tx): Promise<Result<Joined, JoiningRefusal>> => {
    const season = await loadSeason(tx, tournament);
    const teams = (await listTeams(tx, tournament)).map(({ id }) => id);
    const places = placeRows.parse(
      await tx
        .select({ player: tournamentPlayers.playerId })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournament.id),
            eq(tournamentPlayers.playerId, playerKey),
          ),
        ),
    );
    const decided = joinTournament({
      player,
      season,
      teams,
      alreadyIn: places.length > 0,
      rules,
      now,
      dice,
    });
    if (!decided.ok) return decided;
    const { newcomer, blankGames, standingsTeams, lateFillIns } = decided.value;
    if (newcomer) {
      await tx
        .insert(tournamentPlayers)
        .values({
          tournamentId: tournament.id,
          playerId: playerKey,
          switchedOff: false,
          adminHidden: false,
          fillIns: 0,
        })
        .onConflictDoNothing({
          target: [tournamentPlayers.tournamentId, tournamentPlayers.playerId],
        });
    }
    const predictions: (typeof matchPredictions.$inferInsert)[] = [
      ...blankGames.map((game) => ({
        playerId: playerKey,
        gameId: game,
        home: null,
        away: null,
        origin: 'real' as const,
        filledInAt: null,
      })),
      ...lateFillIns.map((prediction) => ({
        playerId: playerKey,
        gameId: prediction.game,
        home: prediction.home,
        away: prediction.away,
        origin: prediction.origin,
        filledInAt:
          prediction.filledInAt === null
            ? null
            : new Date(prediction.filledInAt),
      })),
    ];
    await inChunks(predictions, (chunk) =>
      tx
        .insert(matchPredictions)
        .values(chunk)
        .onConflictDoNothing({
          target: [matchPredictions.playerId, matchPredictions.gameId],
        }),
    );
    await inChunks(
      standingsTeams.map((team) => ({
        playerId: playerKey,
        teamId: keyOf(team, 'team'),
        place: null,
        playOffs: null,
        finalFour: null,
        finalPlace: null,
      })),
      (chunk) =>
        tx
          .insert(standingsPredictions)
          .values(chunk)
          .onConflictDoNothing({
            target: [
              standingsPredictions.playerId,
              standingsPredictions.teamId,
            ],
          }),
    );
    if (lateFillIns.length > 0) {
      const refusal = await recalculateUnderRuleSet(tx, tournament, rules);
      if (refusal !== null) {
        throw new Error(
          `registerForTournament: tournament ${String(tournament.id)} could not be recalculated (${refusal})`,
        );
      }
    }
    return ok({ newcomer, lateFillIns: lateFillIns.length });
  });
}
