import {
  ok,
  planEuroleagueImport,
  refuseWith,
  teamNameKey,
  type DetailedResult,
  type ImportPlan,
  type Instant,
} from '@sportbet/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { databaseClock, judgedAt, type DatabaseClock } from '../clock';
import { BOARD_CHANGED, type BoardEffect } from '../board-effect';
import type { Executor } from '../client';
import { gameOf, inChunks, keyOf, teamOf } from '../edge';
import { seedBlankRows } from '../joining/seed-blank-rows';
import type { TournamentLock } from '../recalculation/lock';
import { saveTransaction } from '../save-transaction';
import { lockStructure, recalculateStructure } from '../season/admin';
import { clearReminded } from '../reminder/mark';
import { games, rounds } from '../season/schema';
import { teamOutcomes, teams } from '../team/schema';
import {
  fingerprintOf,
  type ImportRequest,
  type PreviewRefusal,
} from './preview';
import { loadImportState, type ImportState } from './state';

/** R-93: the tournament or the feed changed since the preview the admin read. */
export type ApplyRefusal = PreviewRefusal | { readonly kind: 'plan-changed' };

export interface ApplyRequest extends ImportRequest {
  /** The fingerprint of the plan the admin previewed (previewEuroleagueImport's). */
  readonly fingerprint: string;
}

/** What an apply did: counts, as sportbet's flash reports them. */
export interface ImportResult extends BoardEffect {
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
 * The rows of the games the plan moves locked FOR UPDATE by id, as an admin's
 * change of a game takes them (the lock order's game step, after the
 * tournament lock): a prediction save holds a game FOR SHARE, so none can
 * slip in between judging a moved game open and moving it. A game the plan
 * leaves where it is is not locked, so a prediction on it is never held up.
 * A result save takes the tournament lock before its game row
 * (saveResult's lockGameTournament), so the tournament lock this write
 * already holds keeps every result out while the import plans and writes.
 */
async function lockMovedGames(tx: Executor, plan: ImportPlan): Promise<void> {
  if (plan.moves.length === 0) return;
  await tx
    .select({ id: games.id })
    .from(games)
    .where(
      inArray(
        games.id,
        plan.moves.map((move) => move.game),
      ),
    )
    .orderBy(asc(games.id))
    .for('update');
}

/** The tournament read and planned at `now` under the locks the caller holds; `plan-changed` unless it is the previewed plan. */
async function planUnderLock(
  tx: Executor,
  lock: TournamentLock,
  request: ApplyRequest,
  now: Instant,
): Promise<
  DetailedResult<{ plan: ImportPlan; state: ImportState }, ApplyRefusal>
> {
  const state = await loadImportState(tx, lock.tournament, { now });
  const decided = planEuroleagueImport({
    ...state,
    fixtures: request.fixtures,
    postSeasonLeftOut: request.postSeasonLeftOut,
  });
  if (!decided.ok) return decided;
  return fingerprintOf(decided.value) === request.fingerprint
    ? ok({ plan: decided.value, state })
    : refuseWith({ kind: 'plan-changed' });
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
    // sportbet (issue 283): a reminder was sent against a time that is no
    // longer when the game kicks off, so it counts as unsent. Only here, where
    // the game actually moves: a refused move keeps its date and its reminder.
    await clearReminded(tx, move.game);
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
 * tournament's recalculation lock (every lock waited for at most 5 s, as in
 * every admin write), the state read and planned again under it, then the
 * rows of the games the plan moves FOR UPDATE and the plan checked once more
 * under them. A plan whose fingerprint is not `request.fingerprint` is
 * `plan-changed` (the feed or the tournament changed since the preview) and
 * nothing is written; so is any other refusal. Else: the teams (with empty outcomes), rounds and
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
      const now = await judgedAt(tx, clock, request.now);
      const planned = await planUnderLock(tx, lock, request, now);
      if (!planned.ok) return planned;
      const { plan, state } = planned.value;
      if (plan.moves.length > 0) {
        // Judged again under the moved games' rows: a game that tipped off,
        // was scored or postponed while the lock waited is a skip now, so
        // the plan is no longer the previewed one.
        await lockMovedGames(tx, plan);
        const again = await planUnderLock(tx, lock, request, now);
        if (!again.ok) return again;
      }
      const inserted = await insertTeams(tx, lock, plan.teamsToCreate);
      await insertRounds(tx, lock, plan);
      await insertGames(tx, lock, plan, teamIdsByKey(state.teams, inserted));
      await moveGames(tx, plan);
      await seedEveryone(tx, lock);
      await recalculateStructure(lock);
      return ok({
        teams: plan.teamsToCreate.length,
        rounds: plan.roundsToCreate.length,
        games: plan.gamesToCreate.length,
        moved: plan.moves.length,
        skipped: plan.skippedMoves.length,
        playersSeeded: state.playerCount,
        teamsWithoutCrest: plan.teamsWithoutCrest,
        ...BOARD_CHANGED,
      });
    },
  );
}
