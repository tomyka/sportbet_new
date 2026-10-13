import {
  avatarInitials,
  survivalSummary,
  type PlayerId,
  type RoundNumber,
  type SummaryPlayer,
  type SurvivalSummary,
  type TeamId,
} from '@sportbet/domain';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { loadTournamentStanding } from '../dashboard/standing';
import { keyOf, playerOf } from '../edge';
import { players } from '../player/schema';
import { loadSeason } from '../season/repository';
import { loadRoundNames, loadSurvivalRuns, loadTeamNames } from './repository';
import type { SurvivalRequest } from './request';

/** The survival summary as the domain decided it, with the names it shows. */
export interface SurvivalSummaryData {
  readonly summary: SurvivalSummary;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  /** Each round's stored name, empty when unnamed. */
  readonly roundNames: ReadonlyMap<RoundNumber, string>;
}

/**
 * PredictionSurvivalController::getPredictionSurvivalSummary: the listed
 * players, the rule set's survival rows and totals (loadTournamentStanding,
 * whose roster slice 12 narrows to a league), every player's picks, the
 * season and the names, decided by survivalSummary. A player's name and
 * surname are read only to make their initials (avatarInitials): neither
 * leaves the database (#16).
 */
export async function loadSurvivalSummary(
  db: Executor,
  load: SurvivalRequest,
): Promise<SurvivalSummaryData> {
  const { player: viewer, tournament, rules, now } = load;
  const standing = await loadTournamentStanding(db, tournament, rules);
  const summary = survivalSummary({
    season: await loadSeason(db, tournament),
    rules,
    now,
    survivalPlayed: tournament.survival,
    viewer,
    players: await summaryPlayers(db, standing.listed),
    runs: await loadSurvivalRuns(db, tournament),
    rows: standing.rows.survival,
    totals: standing.totals,
  });
  return {
    summary,
    teamNames: await loadTeamNames(db, tournament),
    roundNames: await loadRoundNames(db, tournament),
  };
}

const nameRows = z.array(
  z.object({
    id: z.int(),
    username: z.string(),
    name: z.string(),
    surname: z.string(),
  }),
);

/** The listed players, each with their username and initials. */
async function summaryPlayers(
  db: Executor,
  listed: ReadonlySet<PlayerId>,
): Promise<SummaryPlayer[]> {
  if (listed.size === 0) return [];
  const rows = nameRows.parse(
    await db
      .select({
        id: players.id,
        username: players.username,
        name: players.name,
        surname: players.surname,
      })
      .from(players)
      .where(
        inArray(
          players.id,
          [...listed].map((player) => keyOf(player, 'player')),
        ),
      ),
  );
  return rows.map((row) => ({
    player: playerOf(row.id),
    username: row.username,
    initials: avatarInitials(row),
  }));
}
