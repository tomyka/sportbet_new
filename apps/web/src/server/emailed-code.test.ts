import { emailAddress, instantFrom } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mailer, OutgoingMail } from './mail/mail';

// sendEmailedCode against stand-ins for the database and the mailer: the
// real thing against Postgres is tests/feature/emailed-code.test.ts.

const world = vi.hoisted(
  (): { mailer: Mailer | undefined; issued: unknown[]; order: string[] } => ({
    mailer: undefined,
    issued: [],
    order: [],
  }),
);

vi.mock('../env', () => ({ env: () => ({}) }));
vi.mock('./db', () => ({ getDb: () => ({}) }));
vi.mock('../server/db', () => ({ getDb: () => ({}) }));
vi.mock('./mail/create-mailer', () => ({
  createMailer: () => world.mailer,
}));
vi.mock('@sportbet/db/account', () => ({
  issueLoginCode: (_db: unknown, code: unknown) => {
    world.order.push('issue');
    world.issued.push(code);
    return Promise.resolve();
  },
  findLiveLoginCode: () => Promise.resolve(undefined),
  claimLoginCode: () => Promise.resolve(true),
}));

const { sendEmailedCode } = await import('./emailed-code');

const EMAIL = unwrap(emailAddress('jonas@example.lt'));
const NOW = unwrap(instantFrom('2026-10-16T12:00:00Z'));

function mailerOf(options: {
  may?: boolean;
  send?: () => Promise<'sent' | 'refused'>;
}): { mailer: Mailer; sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = {
    mayDeliver: () => {
      world.order.push('ask');
      return options.may ?? true;
    },
    send: (mail) => {
      world.order.push('send');
      sent.push(mail);
      return options.send?.() ?? Promise.resolve('sent');
    },
  };
  world.mailer = mailer;
  return { mailer, sent };
}

beforeEach(() => {
  world.issued.length = 0;
  world.order.length = 0;
});

describe('sendEmailedCode', () => {
  it("asks the mailer, then issues, then mails the purpose's own mail with the code", async () => {
    const { sent } = mailerOf({});
    const answer = await sendEmailedCode({
      email: EMAIL,
      now: NOW,
      purpose: 'account_deletion',
    });
    expect(answer).toBe('sent');
    expect(world.order).toEqual(['ask', 'issue', 'send']);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe('Paskyros ištrynimo patvirtinimo kodas');
    expect(sent[0]?.to).toBe(EMAIL);
    expect(world.issued).toHaveLength(1);
  });

  it('issues nothing and mails nothing when the mailer would not deliver', async () => {
    const { sent } = mailerOf({ may: false });
    const answer = await sendEmailedCode({
      email: EMAIL,
      now: NOW,
      purpose: 'email_change',
    });
    expect(answer).toBe('failed');
    expect(world.order).toEqual(['ask']);
    expect(world.issued).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('answers failed for a message the mailer refused after the ask', async () => {
    mailerOf({ send: () => Promise.resolve('refused') });
    expect(
      await sendEmailedCode({ email: EMAIL, now: NOW, purpose: 'login' }),
    ).toBe('failed');
  });

  it('answers failed, logging by kind only, for a send that threw', async () => {
    mailerOf({ send: () => Promise.reject(new Error('down')) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        await sendEmailedCode({
          email: EMAIL,
          now: NOW,
          purpose: 'registration',
        }),
      ).toBe('failed');
      expect(JSON.stringify(log.mock.calls)).not.toContain('jonas@');
    } finally {
      log.mockRestore();
    }
  });

  it('uses the mail it is handed for a purpose with none of its own, and refuses without one', async () => {
    const { sent } = mailerOf({});
    const mail = (to: typeof EMAIL, code: string): OutgoingMail => ({
      to,
      subject: 'x',
      html: code,
      text: code,
    });
    expect(
      await sendEmailedCode({
        email: EMAIL,
        now: NOW,
        purpose: 'admin_action',
        binding: 'b',
        mail,
      }),
    ).toBe('sent');
    expect(sent[0]?.text).toMatch(/^\d{8}$/);
    await expect(
      sendEmailedCode({ email: EMAIL, now: NOW, purpose: 'admin_action' }),
    ).rejects.toThrow('no mail for a admin_action code');
  });
});
