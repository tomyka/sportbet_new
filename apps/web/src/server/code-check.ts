import { claimLoginCode, findLiveLoginCode, type Executor } from '@sportbet/db';
import type { EmailAddress, Instant, LoginCodePurpose } from '@sportbet/domain';
import { DUMMY_CODE_HASH, loginCodeMatches } from './sign-in/code-hash';

/** What an emailed code typed for an address and purpose came to. */
export type CodeCheck = 'claimed' | 'refused';

export interface CodeTyped {
  readonly email: EmailAddress;
  readonly purpose: LoginCodePurpose;
  readonly code: string;
  readonly now: Instant;
}

/**
 * The one emailed-code check, sign-in's (EmailCodeLoginController::verify)
 * and registration's (RegisteredUserController::confirm): the live code of
 * the address and purpose (#43: a code of another purpose never counts);
 * always one full hash comparison - against a dummy of the same cost when
 * none is live (#36 item 2) - then the atomic claim, so a code is used at
 * most once. Every failure is the one answer, `refused`.
 */
export async function checkCode(
  db: Executor,
  { email, purpose, code, now }: CodeTyped,
): Promise<CodeCheck> {
  const live = await findLiveLoginCode(db, email, purpose, now);
  const matches = await loginCodeMatches(
    code,
    live?.codeHash ?? DUMMY_CODE_HASH,
  );
  const claimed =
    live !== undefined && matches && (await claimLoginCode(db, live.id, now));
  return claimed ? 'claimed' : 'refused';
}
