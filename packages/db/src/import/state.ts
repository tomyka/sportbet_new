import type {
  ImportInput,
  Instant,
  RuleSet,
  Tournament,
} from '@sportbet/domain';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { tournamentPlayers } from '../player/schema';
import { loadSeason } from '../season/repository';
import { listTeams } from '../team/repository';

/**
 * Everything planEuroleagueImport reads of one tournament, besides the
 * feed's fixtures: its teams (by id), its season (rounds with their stage,
 * every game as stored), how many players it has, its survival switch, and
 * whether R-110 freezes it at `now`.
 */
export type ImportState = Pick<
  ImportInput,
  | 'teams'
  | 'season'
  | 'playerCount'
  | 'survivalPlayed'
  | 'finished'
  | 'now'
  | 'rules'
>;

const playerCountRows = z.array(z.object({ players: z.int() }));

/** The tournament's players: those with a `tournament_players` row (R-73). */
async function countPlayers(
  tx: Executor,
  tournament: Tournament,
): Promise<number> {
  const [row] = playerCountRows.parse(
    await tx
      .select({ players: count() })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id)),
  );
  return row?.players ?? 0;
}

/**
 * The tournament as the import sees it, every row parsed through the
 * domain's schemas (listTeams, loadSeason). Reads only; the caller holds
 * whatever lock its decision needs.
 */
export async function loadImportState(
  tx: Executor,
  tournament: Tournament,
  moment: { readonly now: Instant; readonly rules: RuleSet },
): Promise<ImportState> {
  const season = await loadSeason(tx, tournament);
  return {
    teams: await listTeams(tx, tournament),
    season,
    playerCount: await countPlayers(tx, tournament),
    survivalPlayed: tournament.survival,
    finished: !season.mayRecalculateAt(moment.now),
    now: moment.now,
    rules: moment.rules,
  };
}
