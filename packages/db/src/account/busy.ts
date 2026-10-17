import type { PlayerId } from '@sportbet/domain';

/** A deletion that kept losing races to a join or a founded league: busy, to be told in words and tried again, never a failure. */
export class AccountBusyError extends Error {
  constructor(target: PlayerId) {
    super(
      `deleteAccount: player ${String(target)} kept gaining rows while being deleted`,
    );
    this.name = 'AccountBusyError';
  }
}
