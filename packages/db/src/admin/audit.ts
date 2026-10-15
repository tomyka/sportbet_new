import {
  AUDIT_PAGE_SIZE,
  auditAdminRowSchema,
  auditLastPage,
  auditLoginRowSchema,
  auditPredictionRowSchema,
  auditResultRowSchema,
  usernameInvariant,
  type AuditAdminRow,
  type AuditLoginRow,
  type AuditPageQuery,
  type AuditPredictionRow,
  type AuditResultRow,
  type AuditTab,
} from '@sportbet/domain';
import { asc, count, desc, eq, or, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { auditAdminActions, auditLogins } from '../account/schema';
import type { Executor } from '../client';
import { players } from '../player/players';
import { auditPredictionGames } from '../prediction/schema';
import { auditResults } from '../result/schema';
import { games } from '../season/schema';
import { teams } from '../team/schema';

/** The rows of the tab asked for, parsed with the domain's schemas. */
export type AuditTabRows =
  | { readonly tab: 'prisijungimai'; readonly rows: readonly AuditLoginRow[] }
  | {
      readonly tab: 'prognozes';
      readonly rows: readonly AuditPredictionRow[];
    }
  | { readonly tab: 'rezultatai'; readonly rows: readonly AuditResultRow[] }
  | { readonly tab: 'roles'; readonly rows: readonly AuditAdminRow[] };

/** What /admin/audit shows. */
export interface AuditPageData {
  readonly query: AuditPageQuery;
  /** Every tab's row count under the user filter, for the tabs' badges. */
  readonly counts: Readonly<Record<AuditTab, number>>;
  /** The active tab's last page (an empty tab still has page 1). */
  readonly lastPage: number;
  /** Every account's username, by username, for the filter's select. */
  readonly users: readonly {
    readonly id: number;
    readonly username: string;
  }[];
  readonly active: AuditTabRows;
}

const counted = z.tuple([z.object({ rows: z.int() })]);
const userRows = z.array(
  z.object({ id: z.int(), username: usernameInvariant.schema }),
);

const homeTeam = alias(teams, 'home_team');
const awayTeam = alias(teams, 'away_team');
const actorPlayer = alias(players, 'actor_player');
const targetPlayer = alias(players, 'target_player');

/** A timestamp as the domain's instant: milliseconds. */
const moment = (at: Date): number => at.getTime();

async function rowCount(query: PromiseLike<unknown>): Promise<number> {
  const [{ rows }] = counted.parse(await query);
  return rows;
}

/** Each tab's count under the user filter. */
async function countsOf(
  db: Executor,
  user: number | null,
): Promise<Record<AuditTab, number>> {
  const where = (column: AnyPgColumn): SQL | undefined =>
    user === null ? undefined : eq(column, user);
  return {
    prisijungimai: await rowCount(
      db
        .select({ rows: count() })
        .from(auditLogins)
        .where(where(auditLogins.playerId)),
    ),
    prognozes: await rowCount(
      db
        .select({ rows: count() })
        .from(auditPredictionGames)
        .where(where(auditPredictionGames.playerId)),
    ),
    rezultatai: await rowCount(
      db
        .select({ rows: count() })
        .from(auditResults)
        .where(where(auditResults.playerId)),
    ),
    roles: await rowCount(
      db
        .select({ rows: count() })
        .from(auditAdminActions)
        .where(
          user === null
            ? undefined
            : or(
                eq(auditAdminActions.actorId, user),
                eq(auditAdminActions.targetId, user),
              ),
        ),
    ),
  };
}

const offsetOf = (page: number): number => (page - 1) * AUDIT_PAGE_SIZE;

async function loginRows(
  db: Executor,
  user: number | null,
  page: number,
): Promise<AuditLoginRow[]> {
  const rows = await db
    .select({
      username: players.username,
      method: auditLogins.method,
      at: auditLogins.at,
    })
    .from(auditLogins)
    .innerJoin(players, eq(players.id, auditLogins.playerId))
    .where(user === null ? undefined : eq(auditLogins.playerId, user))
    .orderBy(desc(auditLogins.at), desc(auditLogins.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset(offsetOf(page));
  return rows.map((row) =>
    auditLoginRowSchema.parse({ ...row, at: moment(row.at) }),
  );
}

async function predictionRows(
  db: Executor,
  user: number | null,
  page: number,
): Promise<AuditPredictionRow[]> {
  const rows = await db
    .select({
      username: players.username,
      home: homeTeam.name,
      away: awayTeam.name,
      oldHome: auditPredictionGames.oldHome,
      oldAway: auditPredictionGames.oldAway,
      newHome: auditPredictionGames.home,
      newAway: auditPredictionGames.away,
      at: auditPredictionGames.at,
    })
    .from(auditPredictionGames)
    .innerJoin(players, eq(players.id, auditPredictionGames.playerId))
    .innerJoin(games, eq(games.id, auditPredictionGames.gameId))
    .innerJoin(homeTeam, eq(homeTeam.id, games.homeTeamId))
    .innerJoin(awayTeam, eq(awayTeam.id, games.awayTeamId))
    .where(user === null ? undefined : eq(auditPredictionGames.playerId, user))
    .orderBy(desc(auditPredictionGames.at), desc(auditPredictionGames.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset(offsetOf(page));
  return rows.map((row) =>
    auditPredictionRowSchema.parse({ ...row, at: moment(row.at) }),
  );
}

async function resultRows(
  db: Executor,
  user: number | null,
  page: number,
): Promise<AuditResultRow[]> {
  const rows = await db
    .select({
      username: players.username,
      home: homeTeam.name,
      away: awayTeam.name,
      oldHome: auditResults.oldHome,
      oldAway: auditResults.oldAway,
      oldPostponed: auditResults.oldPostponed,
      newHome: auditResults.newHome,
      newAway: auditResults.newAway,
      newPostponed: auditResults.newPostponed,
      at: auditResults.at,
    })
    .from(auditResults)
    .leftJoin(players, eq(players.id, auditResults.playerId))
    .innerJoin(games, eq(games.id, auditResults.gameId))
    .innerJoin(homeTeam, eq(homeTeam.id, games.homeTeamId))
    .innerJoin(awayTeam, eq(awayTeam.id, games.awayTeamId))
    .where(user === null ? undefined : eq(auditResults.playerId, user))
    .orderBy(desc(auditResults.at), desc(auditResults.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset(offsetOf(page));
  return rows.map((row) =>
    auditResultRowSchema.parse({ ...row, at: moment(row.at) }),
  );
}

async function adminRows(
  db: Executor,
  user: number | null,
  page: number,
): Promise<AuditAdminRow[]> {
  const rows = await db
    .select({
      actor: actorPlayer.username,
      target: targetPlayer.username,
      kind: auditAdminActions.kind,
      oldRole: auditAdminActions.oldRole,
      newRole: auditAdminActions.newRole,
      at: auditAdminActions.at,
    })
    .from(auditAdminActions)
    .leftJoin(actorPlayer, eq(actorPlayer.id, auditAdminActions.actorId))
    .leftJoin(targetPlayer, eq(targetPlayer.id, auditAdminActions.targetId))
    .where(
      user === null
        ? undefined
        : or(
            eq(auditAdminActions.actorId, user),
            eq(auditAdminActions.targetId, user),
          ),
    )
    .orderBy(desc(auditAdminActions.at), desc(auditAdminActions.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset(offsetOf(page));
  return rows.map((row) =>
    auditAdminRowSchema.parse({ ...row, at: moment(row.at) }),
  );
}

async function activeRows(
  db: Executor,
  query: AuditPageQuery,
): Promise<AuditTabRows> {
  const page = query.pages[query.tab];
  switch (query.tab) {
    case 'prisijungimai':
      return { tab: query.tab, rows: await loginRows(db, query.user, page) };
    case 'prognozes':
      return {
        tab: query.tab,
        rows: await predictionRows(db, query.user, page),
      };
    case 'rezultatai':
      return { tab: query.tab, rows: await resultRows(db, query.user, page) };
    case 'roles':
      return { tab: query.tab, rows: await adminRows(db, query.user, page) };
  }
}

/**
 * /admin/audit (AuditController::index, R-45, R-69, R-117): the active tab's
 * page of 25 rows, newest first, and every tab's count under the user
 * filter (the filter reaches every tab: logins and predictions and results
 * by the account that did it, the admin trail by either party). Dates are
 * instants; an actor or a party whose account is gone is null (R-69,
 * R-117). A filter naming no account shows empty tabs. Every row is parsed
 * with the domain's schema before it leaves. Read with no lock.
 */
export async function loadAuditPage(
  db: Executor,
  query: AuditPageQuery,
): Promise<AuditPageData> {
  const counts = await countsOf(db, query.user);
  const users = userRows.parse(
    await db
      .select({ id: players.id, username: players.username })
      .from(players)
      .orderBy(asc(players.username)),
  );
  return {
    query,
    counts,
    lastPage: auditLastPage(counts[query.tab]),
    users,
    active: await activeRows(db, query),
  };
}
