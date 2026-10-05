import { issueLoginCode } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import {
  emailAddress,
  secondsAfter,
  type LoginCodePurpose,
} from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { checkCode } from '../../src/server/code-check';
import * as codeHash from '../../src/server/sign-in/code-hash';

// The one emailed-code check sign-in and registration share
// (EmailCodeLoginController::verify, RegisteredUserController::confirm),
// against the test database. sign-in.test.ts and registration.test.ts
// prove the same end to end through the built app.

const { db } = useTestDatabase();

const NOW = at('2026-10-05T12:00:00Z');
const EMAIL = unwrap(emailAddress('ruta.naujoke@example.lt'));
const CODE = '01234567';

async function issued(purpose: LoginCodePurpose, code = CODE): Promise<void> {
  await issueLoginCode(db, {
    email: EMAIL,
    purpose,
    codeHash: await codeHash.hashLoginCode(code),
    now: NOW,
  });
}

const check = (
  purpose: LoginCodePurpose,
  code = CODE,
  now = secondsAfter(NOW, 60),
) => checkCode(db, { email: EMAIL, purpose, code, now });

describe('checkCode', () => {
  it('claims the live code of the address and purpose, once', async () => {
    await issued('registration');
    expect(await check('registration')).toBe('claimed');
    expect(await check('registration')).toBe('refused');
  });

  it('refuses a wrong code, and the right one still claims after it', async () => {
    await issued('login');
    expect(await check('login', '76543210')).toBe('refused');
    expect(await check('login')).toBe('claimed');
  });

  it("refuses another purpose's code (#43): a sign-in code never registers, nor the reverse", async () => {
    await issued('login');
    expect(await check('registration')).toBe('refused');
    await issued('registration', '11112222');
    expect(await check('login', '11112222')).toBe('refused');
  });

  it('refuses a code past its life', async () => {
    await issued('login');
    expect(await check('login', CODE, secondsAfter(NOW, 60 * 60))).toBe(
      'refused',
    );
  });

  it('pays one full comparison whether or not a code is live (#36 item 2): the dummy when none is', async () => {
    const matches = vi.spyOn(codeHash, 'loginCodeMatches');
    try {
      expect(await check('login')).toBe('refused');
      expect(matches).toHaveBeenCalledTimes(1);
      expect(matches).toHaveBeenLastCalledWith(CODE, codeHash.DUMMY_CODE_HASH);
      await issued('login');
      expect(await check('login')).toBe('claimed');
      expect(matches).toHaveBeenCalledTimes(2);
      expect(matches.mock.lastCall?.[1]).not.toBe(codeHash.DUMMY_CODE_HASH);
    } finally {
      matches.mockRestore();
    }
  });
});
