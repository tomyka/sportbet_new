import type { Instant, PlayerId, Tournament } from '@sportbet/domain';

/**
 * Who confirms a destructive action and where: the admin the gate has just
 * let in (the session's player, role read again on this request, never the
 * cookie's), the tournament they work on now (the pages and writers all act
 * on one tournament), and the moment. A performer decides again under its own
 * locks, whatever the page showed.
 */
export interface Performer {
  readonly admin: PlayerId;
  readonly tournament: Tournament | null;
  readonly at: Instant;
}
