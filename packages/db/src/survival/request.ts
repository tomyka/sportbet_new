import type { Instant, PlayerId, Tournament } from '@sportbet/domain';

/** Who asks, under which rules, at what moment: what every survival read and write is about. */
export interface SurvivalAsk {
  readonly player: PlayerId;
  readonly now: Instant;
}

/** A survival page asked for in a tournament (the summary's player is its viewer). */
export interface SurvivalRequest extends SurvivalAsk {
  readonly tournament: Tournament;
}
