import { issueLoginCode } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import {
  emailAddress,
  secondsAfter,
  type LoginCodePurpose,
} from '@sportbet/domain';
import { at, unwrap } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  checkEmailedCode,
  sendEmailedCode,
  verifyEmailedCode,
} from '../../src/server/emailed-code';
import type { Mailer } from '../../src/server/mail/mail';
import * as codeHash from '../../src/server/sign-in/code-hash';

// The one emailed-code check sign-in and registration share
// (EmailCodeLoginController::verify, RegisteredUserController::confirm),
// against the test database. sign-in.test.ts and registration.test.ts
// prove the same end to end through the built app.

const { db } = useTestDatabase();

// sendEmailedCode asks the environment's mailer; this file stands in for it.
const mailer = vi.hoisted(
  (): { current: Mailer | undefined; database: unknown } => ({
    current: undefined,
    database: undefined,
  }),
);
vi.mock('../../src/env', () => ({ env: () => ({}) }));
vi.mock('../../src/server/mail/create-mailer', () => ({
  createMailer: () => mailer.current,
}));
vi.mock('../../src/server/db', () => ({ getDb: () => mailer.database }));

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
) => checkEmailedCode(db, { email: EMAIL, purpose, code, now });

describe('checkEmailedCode', () => {
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

  it("refuses another purpose's code for an admin action (R-26 amended), and an admin action's for a sign-in", async () => {
    await issued('login');
    expect(await check('admin_action')).toBe('refused');
    await issued('admin_action', '33334444');
    expect(await check('login', '33334444')).toBe('refused');
    expect(await check('admin_action', '33334444')).toBe('claimed');
    expect(await check('admin_action', '33334444')).toBe('refused');
  });

  it('a bound code is claimed only with its own binding: another binding refuses it and leaves it live', async () => {
    await issueLoginCode(db, {
      email: EMAIL,
      purpose: 'admin_action',
      codeHash: await codeHash.hashLoginCode(CODE, 'game-5'),
      now: NOW,
    });
    const bound = (binding?: string) =>
      checkEmailedCode(db, {
        email: EMAIL,
        purpose: 'admin_action',
        code: CODE,
        now: secondsAfter(NOW, 60),
        ...(binding === undefined ? {} : { binding }),
      });
    expect(await bound('game-6')).toBe('refused');
    expect(await bound()).toBe('refused');
    expect(await bound('game-5')).toBe('claimed');
    expect(await bound('game-5')).toBe('refused');
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
      expect(matches).toHaveBeenLastCalledWith(
        CODE,
        codeHash.DUMMY_CODE_HASH,
        undefined,
      );
      await issued('login');
      expect(await check('login')).toBe('claimed');
      expect(matches).toHaveBeenCalledTimes(2);
      expect(matches.mock.lastCall?.[1]).not.toBe(codeHash.DUMMY_CODE_HASH);
    } finally {
      matches.mockRestore();
    }
  });
});

describe('sendEmailedCode', () => {
  const allowing = (): Mailer & { sent: string[] } => {
    const sent: string[] = [];
    return {
      sent,
      mayDeliver: () => true,
      send: (mail) => {
        sent.push(mail.text);
        return Promise.resolve('sent');
      },
    };
  };
  const send = () =>
    sendEmailedCode({ email: EMAIL, now: NOW, purpose: 'account_deletion' });

  it("mints a code, mails it as the purpose's own mail and stores only its hash", async () => {
    mailer.database = db;
    const mail = allowing();
    mailer.current = mail;
    expect(await send()).toBe('sent');
    const [text] = mail.sent;
    const typed = /\b(\d{8})\b/.exec(text ?? '')?.[1];
    expect(text).toContain('Paskyros ištrynimo patvirtinimo kodas');
    expect(typed).toBeDefined();
    expect(
      await checkEmailedCode(db, {
        email: EMAIL,
        purpose: 'account_deletion',
        code: typed ?? '',
        now: secondsAfter(NOW, 60),
      }),
    ).toBe('claimed');
  });

  it('voids the code held before when a new one is sent', async () => {
    mailer.database = db;
    await issued('account_deletion', '11112222');
    mailer.current = allowing();
    expect(await send()).toBe('sent');
    expect(
      await verifyEmailedCode(db, {
        email: EMAIL,
        purpose: 'account_deletion',
        code: '11112222',
        now: secondsAfter(NOW, 60),
      }),
    ).toBeNull();
  });

  it('asks the mailer before issuing: a refusal leaves the code already held live, and nothing is mailed', async () => {
    mailer.database = db;
    await issued('account_deletion', '11112222');
    const send = vi.fn();
    mailer.current = { mayDeliver: () => false, send };
    expect(
      await sendEmailedCode({
        email: EMAIL,
        now: NOW,
        purpose: 'account_deletion',
      }),
    ).toBe('failed');
    expect(send).not.toHaveBeenCalled();
    expect(
      await checkEmailedCode(db, {
        email: EMAIL,
        purpose: 'account_deletion',
        code: '11112222',
        now: secondsAfter(NOW, 60),
      }),
    ).toBe('claimed');
  });

  it('answers failed for a send that threw or was refused after the ask', async () => {
    mailer.database = db;
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      mailer.current = {
        mayDeliver: () => true,
        send: () => Promise.reject(new Error('down')),
      };
      expect(await send()).toBe('failed');
      mailer.current = {
        mayDeliver: () => true,
        send: () => Promise.resolve('refused'),
      };
      expect(await send()).toBe('failed');
    } finally {
      quiet.mockRestore();
    }
  });

  it('needs a mail for a purpose with no mail of its own', async () => {
    mailer.database = db;
    mailer.current = allowing();
    await expect(
      sendEmailedCode({ email: EMAIL, now: NOW, purpose: 'admin_action' }),
    ).rejects.toThrow('no mail for a admin_action code');
    const mail = allowing();
    mailer.current = mail;
    expect(
      await sendEmailedCode({
        email: EMAIL,
        now: NOW,
        purpose: 'admin_action',
        binding: 'x',
        mail: (to, code) => ({ to, subject: 's', html: code, text: code }),
      }),
    ).toBe('sent');
    expect(mail.sent[0]).toMatch(/^\d{8}$/);
  });
});
