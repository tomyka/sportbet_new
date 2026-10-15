import { z } from 'zod';

/**
 * The admin structure pages' messages (slice 13: sportbet's `->with('info' |
 * 'error', ...)` flashes), each with its tone: `info` is the page's
 * success alert, `error` its danger alert. A message is a key, never text:
 * the texts are the components' (decision 13; admin-alert.tsx), and a key
 * outside this set opens as nothing. The refusals of the domain's admin
 * decisions are keys of their own name, so a refusal is its message.
 */
export const ADMIN_MESSAGES = {
  'game-added': 'info',
  'game-updated': 'info',
  'game-deleted': 'info',
  'round-added': 'info',
  'round-updated': 'info',
  'round-deleted': 'info',
  'teams-updated': 'info',
  'teams-added': 'info',
  'team-renamed': 'info',
  'tournament-created': 'info',
  'tournament-updated': 'info',
  'context-chosen': 'info',
  'no-tournament': 'error',
  'tournament-finished': 'error',
  'duplicate-number': 'error',
  'unknown-round': 'error',
  'has-games': 'error',
  'has-picks': 'error',
  'mixed-tournament': 'error',
  'same-team-twice': 'error',
  'duplicate-pair': 'error',
  'teams-fixed': 'error',
  'has-real-predictions': 'error',
  'has-result': 'error',
  'has-survival-picks': 'error',
  'no-game': 'error',
  'teams-exist': 'error',
  'places-incomplete': 'error',
  'unmark-not-allowed': 'error',
  'unknown-team': 'error',
  'duplicate-team': 'error',
  'place-not-positive': 'error',
  'duplicate-place': 'error',
  'final-place-out-of-range': 'error',
  'duplicate-final-place': 'error',
  'slug-taken': 'error',
  'wrong-code': 'error',
  'nothing-to-confirm': 'error',
} as const;

export type AdminMessage = keyof typeof ADMIN_MESSAGES;

export const adminMessageSchema = z
  .string()
  .refine((key): key is AdminMessage => Object.hasOwn(ADMIN_MESSAGES, key));

/**
 * One refused field of a form, as the domain's `*FormEntry` lists it
 * (Laravel reports every field): the posted name, the problem, and - for
 * the standings facts' rows - the row. Names and problems are the domain's
 * own words; the components give each its Lithuanian text.
 */
export const formProblemSchema = z
  .object({
    field: z.string().max(40),
    problem: z.string().max(40),
    row: z.int().min(0).max(999).optional(),
  })
  .readonly();

export type FormProblem = z.infer<typeof formProblemSchema>;

/** The most problems one flash carries: a cookie holds 4 KB, and a screenful of refusals is enough to act on. */
export const MAX_FORM_PROBLEMS = 12;
