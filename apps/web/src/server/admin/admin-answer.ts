import type { Flash } from '../flash';
import {
  MAX_FORM_PROBLEMS,
  type AdminMessage,
  type FormProblem,
} from './admin-messages';

/**
 * What an admin POST decided; the skeleton (admin-action.ts) turns it into
 * the response: a real 303 to a page with the one-time message (or none),
 * a bare 404 for an id no row has, or home for a role the action's
 * permission refuses (decision 2).
 */
export type AdminAnswer =
  | {
      readonly kind: 'redirect';
      readonly to: string;
      readonly flash: Flash | null;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'home' };

/** What a message names besides itself: a game's number, a count, a tournament's name. */
interface Names {
  readonly number?: number;
  readonly name?: string;
}

/** Done or refused, to `to`, with the message (a refusal is the key of its own name). */
export function said(
  to: string,
  message: AdminMessage,
  names: Names = {},
): AdminAnswer {
  return { kind: 'redirect', to, flash: { kind: 'admin', message, ...names } };
}

/**
 * A form the domain refused field by field (Laravel reports every field):
 * back to the page with the problems listed, the first MAX_FORM_PROBLEMS of
 * them (a cookie holds 4 KB).
 */
export function invalid(
  to: string,
  problems: readonly FormProblem[],
): AdminAnswer {
  return {
    kind: 'redirect',
    to,
    flash: {
      kind: 'admin-invalid',
      problems: problems.slice(0, MAX_FORM_PROBLEMS),
    },
  };
}

/** Too many accepted writes in a minute: the page says for how long. */
export function throttledTo(to: string, minutes: number): AdminAnswer {
  return { kind: 'redirect', to, flash: { kind: 'throttled', minutes } };
}

/** On to `to`, with nothing to say. */
export function goTo(to: string): AdminAnswer {
  return { kind: 'redirect', to, flash: null };
}

/** An id no row has: a bare 404, as sportbet's `findOrFail`. */
export const NOT_FOUND: AdminAnswer = { kind: 'not-found' };

/** A role the action's permission refuses goes home (decision 2). */
export const HOME: AdminAnswer = { kind: 'home' };
