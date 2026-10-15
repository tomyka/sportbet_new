import {
  ok,
  planEuroleagueImport,
  refuseWith,
  teamNameKey,
  type DetailedResult,
  type ImportPlan,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import type { Executor } from '../client';
import { gameOf, inChunks, keyOf, teamOf } from '../edge';
import { seedBlankRows } from '../joining/seed-blank-rows';
import type { TournamentLock } from '../recalculation/lock';
import { saveTransaction } from '../save-transaction';
import { lockStructure, recalculateStructure } from '../season/admin';
import { games, rounds } from '../season/schema';
import { teamOutcomes, teams } from '../team/schema';
import {
  fingerprintOf,
  type ImportRequest,
  type PreviewRefusal,
} from './preview';
import { loadImportState } from './state';

/** R-93: the tournament or the feed changed since the preview the admin read. */
export type ApplyRefusal = PreviewRefusal | { readonly kind: 'plan-changed' };

export interface ApplyRequest extends ImportRequest {
  /** The fingerprint of the plan the admin previewed (previewEuroleagueImport's). */
  readonly fingerprint: string;
}

/** What an apply did: counts, as sportbet's flash reports them. */
export interface ImportResult {
  readonly teams: number;
  readonly rounds: number;
  readonly games: number;
  readonly moved: number;
  readonly skipped: number;
  readonly playersSeeded: number;
  /** R-96: the teams the tournament now has that no committed crest names. */
  readonly teamsWithoutCrest: readonly string[];
}

const idRows = z.array(z.object({ id: z.int() }));
const teamRows = z.array(z.object({ id: z.int(), name: z.string() }));
const roundRows = z.array(z.object({ id: z.int(), number: z.int() }));

/**
 * The tournament's regular-season games locked FOR NO KEY UPDATE by id (the
 * lock order's game step, as a result write takes it): a prediction save
 * holds a game FOR SHARE, so none can slip in between judging a game open
 * and moving it.
 */
async function lockRegularGames(
  tx: Executor,
  lock: TournamentLock,
): Promise<void> {
  await tx
    .select({ id: games.id })
    .from(games)
    .innerJoin(rounds, eq(rounds.id, games.roundId))
    .where(
      and(
        eq(games.tournamentId, lock.tournament.id),
        eq(rounds.stage, 'regular'),
      ),
    )
    .orderBy(asc(games.id))
    .for('no key update', { of: games });
}

/** The plan's teams inserted, each with an empty outcome; their ids by key. */
async function insertTeams(
  tx: Executor,
  lock: TournamentLock,
  names: readonly string[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  await inChunks(names, async (chunk) => {
    const inserted = teamRows.parse(
      await tx
        .insert(teams)
        .values(
          chunk.map((name) => ({ tournamentId: lock.tournament.id, name })),
        )
        .returning({ id: teams.id, name: teams.name }),
    );
    await tx.insert(teamOutcomes).values(
      inserted.map(({ id }) => ({
        teamId: id,
        place: null,
        playOffs: false,
        finalFour: false,
        finalPlace: null,
      })),
    );
    for (const { id, name } of inserted) {
      ids.set(teamNameKey(name) ?? '', id);
    }
  });
  return ids;
}

async function insertRounds(
  tx: Executor,
  lock: TournamentLock,
  plan: ImportPlan,
): Promise<void> {
  await inChunks(plan.roundsToCreate, (chunk) =>
    tx.insert(rounds).values(
      chunk.map(({ name, round }) => ({
        tournamentId: lock.tournament.id,
        number: round.number,
        name,
        stage: round.stage,
        rate: round.rate.value,
        survival: round.survival,
        knockout: round.knockout,
      })),
    ),
  );
}

/** The tournament's round ids by number, new rounds included. */
async function roundIds(
  tx: Executor,
  lock: TournamentLock,
): Promise<Map<number, number>> {
  const rows = roundRows.parse(
    await tx
      .select({ id: rounds.id, number: rounds.number })
      .from(rounds)
      .where(eq(rounds.tournamentId, lock.tournament.id)),
  );
  return new Map(rows.map(({ id, number }) => [number, id]));
}

function required(id: number | undefined, what: string): number {
  if (id === undefined) throw new Error(`applyEuroleagueImport: no ${what}`);
  return id;
}

async function insertGames(
  tx: Executor,
  lock: TournamentLock,
  plan: ImportPlan,
  teamIds: ReadonlyMap<string, number>,
): Promise<void> {
  const roundOf = await roundIds(tx, lock);
  const teamOfName = (name: string) =>
    required(teamIds.get(teamNameKey(name) ?? ''), `team ${name}`);
  await inChunks(plan.gamesToCreate, (chunk) =>
    tx.insert(games).values(
      chunk.map((game) => ({
        tournamentId: lock.tournament.id,
        roundId: required(
          roundOf.get(game.round),
          `round ${String(game.round)}`,
        ),
        homeTeamId: teamOfName(game.home),
        awayTeamId: teamOfName(game.away),
        tipOff: new Date(game.tipOff),
      })),
    ),
  );
}

async function moveGames(tx: Executor, plan: ImportPlan): Promise<void> {
  for (const move of plan.moves) {
    await tx
      .update(games)
      .set({
        tipOff: new Date(move.to),
        lockedSince:
          move.lockedSince === null ? null : new Date(move.lockedSince),
        postponed: move.postponed,
      })
      .where(eq(games.id, move.game));
  }
}

/** The tournament's team ids by key: those it held, then the ones just inserted. */
function teamIdsByKey(
  held: readonly { readonly id: string; readonly name: string }[],
  inserted: ReadonlyMap<string, number>,
): Map<string, number> {
  const ids = new Map(inserted);
  for (const team of held)
    ids.set(teamNameKey(team.name) ?? '', keyOf(team.id, 'team'));
  return ids;
}

/** Every game and team of the tournament gets every player a blank row where missing (sportbet's repair). */
async function seedEveryone(tx: Executor, lock: TournamentLock): Promise<void> {
  const gameRows = idRows.parse(
    await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.tournamentId, lock.tournament.id))
      .orderBy(asc(games.id)),
  );
  const teamIds = idRows.parse(
    await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.tournamentId, lock.tournament.id))
      .orderBy(asc(teams.id)),
  );
  await seedBlankRows(tx, lock.tournament, {
    games: gameRows.map(({ id }) => gameOf(id)),
    teams: teamIds.map(({ id }) => teamOf(id)),
  });
}

/**
 * The Euroleague import's one write path (R-93, R-94, R-96, R-13, R-110),
 * after the feed was fetched - never inside the lock. One transaction: the
 * tournament's recalculation lock, then its regular-season game rows FOR NO
 * KEY UPDATE, then the state is read and planned again under them. A plan
 * whose fingerprint is not `request.fingerprint` is `plan-changed` (the
 * feed or the tournament changed since the preview) and nothing is written;
 * so is any other refusal. Else: the teams (with empty outcomes), rounds and
 * games inserted, open games the feed moves moved, every player's blank
 * rows made where missing, and the tournament recalculated once under
 * `request.rules`. A game left where it was is counted as skipped.
 */
export async function applyEuroleagueImport(
  db: Executor,
  request: ApplyRequest,
  clock: DatabaseClock = databaseClock,
): Promise<DetailedResult<ImportResult, ApplyRefusal>> {
  return saveTransaction(
    db,
    async (tx): Promise<DetailedResult<ImportResult, ApplyRefusal>> => {
      const lock = await lockStructure(tx, request.tournament);
      if (lock === null) return refuseWith({ kind: 'no-tournament' });
      await lockRegularGames(tx, lock);
      const now = await judgedAt(tx, clock, request.now);
      const state = await loadImportState(tx, lock.tournament, {
        now,
        rules: request.rules,
      });
      const decided = planEuroleagueImport({
        ...state,
        fixtures: request.fixtures,
        postSeasonLeftOut: request.postSeasonLeftOut,
      });
      if (!decided.ok) return decided;
      const plan = decided.value;
      if (fingerprintOf(plan) !== request.fingerprint) {
        return refuseWith({ kind: 'plan-changed' });
      }
      const inserted = await insertTeams(tx, lock, plan.teamsToCreate);
      await insertRounds(tx, lock, plan);
      await insertGames(tx, lock, plan, teamIdsByKey(state.teams, inserted));
      await moveGames(tx, plan);
      await seedEveryone(tx, lock);
      await recalculateStructure(lock, request.rules, 'applyEuroleagueImport');
      return ok({
        teams: plan.teamsToCreate.length,
        rounds: plan.roundsToCreate.length,
        games: plan.gamesToCreate.length,
        moved: plan.moves.length,
        skipped: plan.skippedMoves.length,
        playersSeeded: state.playerCount,
        teamsWithoutCrest: plan.teamsWithoutCrest,
      });
    },
  );
}
