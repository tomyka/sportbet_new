import { pruneSignInState, type Executor } from '@sportbet/db';
import type { Instant } from '@sportbet/domain';
import { after } from 'next/server';
import { errorKind } from '../error-kind';

/**
 * After the response, never in it: what sign-in and registration no longer
 * need is deleted (pruneSignInState). A failure is logged by its kind.
 */
export function pruneLater(db: Executor, at: Instant): void {
  after(async () => {
    try {
      await pruneSignInState(db, at);
    } catch (error) {
      console.error(`sign-in: pruning failed (${errorKind(error)})`);
    }
  });
}
