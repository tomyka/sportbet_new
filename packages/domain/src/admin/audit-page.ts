import { z } from 'zod';
import { ROLES } from '../account/role';
import { AUDIT_LOGIN_METHODS } from '../account/session';
import { usernameInvariant } from '../player/player';
import { scoreSideInvariant } from '../score/score';
import { idFromText } from '../shared/ids';
import { instantSchema } from '../shared/instant';

/**
 * The audit page's tabs, as the server links name them: the sign-ins, the
 * prediction changes, the result changes (R-69), the role changes and
 * account deletions (R-117) and the survival picks (R-140).
 */
export const AUDIT_TABS = [
  'prisijungimai',
  'prognozes',
  'rezultatai',
  'roles',
  'islikimas',
] as const;

export type AuditTab = (typeof AUDIT_TABS)[number];

/** Rows to a page, as sportbet's `paginate(25)`. */
export const AUDIT_PAGE_SIZE = 25;

/** Each tab's own page parameter, as sportbet named the first two. */
export const AUDIT_PAGE_PARAMS: Readonly<Record<AuditTab, string>> = {
  prisijungimai: 'logins_page',
  prognozes: 'predictions_page',
  rezultatai: 'results_page',
  roles: 'roles_page',
  islikimas: 'survival_page',
};

/** The request's query as Next hands it over: a text, a list for a repeated key, or absent. */
export type AuditParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** What the audit page was asked for. */
export interface AuditPageQuery {
  readonly tab: AuditTab;
  /** The account the tabs are filtered to, or null for everyone. */
  readonly user: number | null;
  /** Each tab's page, from 1. */
  readonly pages: Readonly<Record<AuditTab, number>>;
}

const tabOf = (text: string | undefined): AuditTab =>
  AUDIT_TABS.find((tab) => tab === text) ?? 'prisijungimai';

/** An id or a page number is read only by idFromText; an array, a cast or junk is none. */
function numberOf(
  value: string | readonly string[] | undefined,
): number | null {
  if (typeof value !== 'string') return null;
  const read = idFromText(value);
  return read.ok ? read.value : null;
}

const textOf = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/**
 * AuditController::index's query, read strictly: an unknown tab is the
 * sign-ins; a page below 1 or not a number is 1; the user filter is read
 * only by idFromText, so `user[]=1` (issue 281) filters nobody.
 */
export function auditPageQuery(params: AuditParams): AuditPageQuery {
  const page = (tab: AuditTab): number =>
    numberOf(params[AUDIT_PAGE_PARAMS[tab]]) ?? 1;
  return {
    tab: tabOf(textOf(params['tab'])),
    user: numberOf(params['user']),
    pages: {
      prisijungimai: page('prisijungimai'),
      prognozes: page('prognozes'),
      rezultatai: page('rezultatai'),
      roles: page('roles'),
      islikimas: page('islikimas'),
    },
  };
}

/** The last page of a tab of `total` rows: an empty tab still has page 1. */
export function auditLastPage(total: number): number {
  return Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
}

const side = scoreSideInvariant.schema;
const when = instantSchema;

/** One sign-in. R-45: no IP; R-25: only an account that exists has any. */
export const auditLoginRowSchema = z.object({
  username: usernameInvariant.schema,
  method: z.enum(AUDIT_LOGIN_METHODS),
  at: when,
});

export type AuditLoginRow = z.infer<typeof auditLoginRowSchema>;

const pairOf = (home: number | null, away: number | null) =>
  home === null || away === null ? null : { home, away };

/** One saved prediction: the game's teams, the pair it replaced (none the first time), the pair now. */
export const auditPredictionRowSchema = z
  .object({
    username: usernameInvariant.schema,
    home: z.string(),
    away: z.string(),
    oldHome: side.nullable(),
    oldAway: side.nullable(),
    newHome: side,
    newAway: side,
    at: when,
  })
  .transform((row) => ({
    username: row.username,
    home: row.home,
    away: row.away,
    old: pairOf(row.oldHome, row.oldAway),
    new: { home: row.newHome, away: row.newAway },
    at: row.at,
  }));

export type AuditPredictionRow = z.output<typeof auditPredictionRowSchema>;

/** A game's state before or after a result change (R-63): a score, postponed, or no result. */
export type AuditResultSide =
  | { readonly kind: 'score'; readonly home: number; readonly away: number }
  | { readonly kind: 'postponed' }
  | { readonly kind: 'none' };

const resultSideOf = (
  home: number | null,
  away: number | null,
  postponed: boolean,
): AuditResultSide => {
  if (postponed) return { kind: 'postponed' };
  return home === null || away === null
    ? { kind: 'none' }
    : { kind: 'score', home, away };
};

const wholeOrNone = (home: number | null, away: number | null): boolean =>
  (home === null) === (away === null);

/** One result change (R-69): who (null once forgotten), the game's teams, before and after. */
export const auditResultRowSchema = z
  .object({
    username: usernameInvariant.schema.nullable(),
    home: z.string(),
    away: z.string(),
    oldHome: side.nullable(),
    oldAway: side.nullable(),
    oldPostponed: z.boolean(),
    newHome: side.nullable(),
    newAway: side.nullable(),
    newPostponed: z.boolean(),
    at: when,
  })
  .refine(
    (row) =>
      wholeOrNone(row.oldHome, row.oldAway) &&
      wholeOrNone(row.newHome, row.newAway),
    'a result holds both scores or neither',
  )
  .transform((row) => ({
    username: row.username,
    home: row.home,
    away: row.away,
    old: resultSideOf(row.oldHome, row.oldAway, row.oldPostponed),
    new: resultSideOf(row.newHome, row.newAway, row.newPostponed),
    at: row.at,
  }));

export type AuditResultRow = z.output<typeof auditResultRowSchema>;

/** What the admin trail records (R-117), as the table's enum names it. */
export const AUDIT_ADMIN_KINDS = ['role_change', 'account_deletion'] as const;

export type AuditAdminKind = (typeof AUDIT_ADMIN_KINDS)[number];

/**
 * One admin action (R-117): who did it and to whom, each null once that
 * account is deleted (only who it was is forgotten); a role change has both
 * roles, a deletion the role the account held and no new one.
 */
export const auditAdminRowSchema = z.object({
  actor: usernameInvariant.schema.nullable(),
  target: usernameInvariant.schema.nullable(),
  kind: z.enum(AUDIT_ADMIN_KINDS),
  oldRole: z.enum(ROLES).nullable(),
  newRole: z.enum(ROLES).nullable(),
  at: when,
});

export type AuditAdminRow = z.infer<typeof auditAdminRowSchema>;

/**
 * One saved survival pick (R-140): the round's number, the card chosen and
 * the one it replaced (none the first time).
 */
export const auditSurvivalRowSchema = z.object({
  username: usernameInvariant.schema,
  round: z.int().positive(),
  team: z.string(),
  oldTeam: z.string().nullable(),
  at: when,
});

export type AuditSurvivalRow = z.infer<typeof auditSurvivalRowSchema>;
