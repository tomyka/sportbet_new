import type { Db } from '@sportbet/db';
import {
  adminWriteLimits,
  type Instant,
  type PlayerId,
} from '@sportbet/domain';
import { throttle } from '../sign-in/throttle';
import { throttledTo, type AdminAnswer } from './admin-answer';

/**
 * An admin write behind the throttle: 60 accepted writes a minute per
 * account (adminWriteLimits), past which nothing is written and the page
 * `to` says for how long. Asked only once the form is checked, so a
 * refused form costs nothing.
 */
export async function throttledWrite(
  db: Db,
  input: {
    readonly player: PlayerId;
    readonly now: Instant;
    readonly to: string;
  },
  write: () => Promise<AdminAnswer>,
): Promise<AdminAnswer> {
  const verdict = await throttle(db, adminWriteLimits(input.player), input.now);
  return verdict.allowed ? write() : throttledTo(input.to, verdict.minutes);
}
