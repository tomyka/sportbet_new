import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { allowListMailer } from './allow-list';
import { createMailer } from './create-mailer';
import { MailDeliveryError, type Fetch, type OutgoingMail } from './mail';
import { mailpitMailer } from './mailpit';
import { resendMailer } from './resend';

const OWNER = unwrap(emailAddress('owner@example.lt'));
const MAIL: OutgoingMail = {
  to: OWNER,
  subject: 'Jūsų prisijungimo kodas',
  html: '<p>12345678</p>',
  text: '12345678',
};

/** A fetch that answers `status` and records what it was asked. */
function fetchAnswering(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn: Fetch = (url, init) => {
    calls.push({ url: url.toString(), init });
    return Promise.resolve(new Response('{}', { status }));
  };
  return { calls, fetchFn };
}

const bodyOf = (init: RequestInit | undefined): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '');

describe('mailpitMailer', () => {
  it("posts the message to Mailpit's send API, from SportBet", async () => {
    const { calls, fetchFn } = fetchAnswering(200);
    await expect(
      mailpitMailer(
        'http://mailpit:8025',
        'noreply@sportbet.test',
        fetchFn,
      ).send(MAIL),
    ).resolves.toBe('sent');
    expect(calls[0]?.url).toBe('http://mailpit:8025/api/v1/send');
    expect(bodyOf(calls[0]?.init)).toEqual({
      From: { Email: 'noreply@sportbet.test', Name: 'SportBet' },
      To: [{ Email: 'owner@example.lt' }],
      Subject: 'Jūsų prisijungimo kodas',
      HTML: '<p>12345678</p>',
      Text: '12345678',
    });
  });

  it('throws its status only when Mailpit refuses', async () => {
    const { fetchFn } = fetchAnswering(500);
    await expect(
      mailpitMailer(
        'http://mailpit:8025',
        'noreply@sportbet.test',
        fetchFn,
      ).send(MAIL),
    ).rejects.toThrow(new MailDeliveryError('mailpit', 500));
  });
});

describe('resendMailer', () => {
  it("posts the message to Resend's API with the key, from SportBet", async () => {
    const { calls, fetchFn } = fetchAnswering(200);
    await resendMailer('re_test_123', 'noreply@sportbet.lt', fetchFn).send(
      MAIL,
    );
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer re_test_123',
    });
    expect(bodyOf(calls[0]?.init)).toEqual({
      from: 'SportBet <noreply@sportbet.lt>',
      to: ['owner@example.lt'],
      subject: 'Jūsų prisijungimo kodas',
      html: '<p>12345678</p>',
      text: '12345678',
    });
  });

  it('throws with the status, and never the address, when Resend refuses', async () => {
    const { fetchFn } = fetchAnswering(422);
    const sending = resendMailer(
      're_test_123',
      'noreply@sportbet.lt',
      fetchFn,
    ).send(MAIL);
    await expect(sending).rejects.toThrow(
      'resend refused the message: HTTP 422',
    );
    await expect(sending).rejects.not.toThrow(/owner@/);
  });
});

describe('allowListMailer', () => {
  it('passes a message to an allowed address on, and refuses any other, logging no address', async () => {
    const inner = { send: vi.fn(() => Promise.resolve('sent' as const)) };
    const warn = vi.fn();
    const mailer = allowListMailer(inner, [OWNER], warn);
    await expect(mailer.send(MAIL)).resolves.toBe('sent');
    const stranger = unwrap(emailAddress('stranger@example.lt'));
    await expect(mailer.send({ ...MAIL, to: stranger })).resolves.toBe(
      'refused',
    );
    expect(inner.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'mail: refused a message to an address not on the staging allow-list',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('@');
  });
});

it('createMailer builds the allow-listed Resend mailer for staging', async () => {
  const { calls, fetchFn } = fetchAnswering(200);
  const warn = vi.fn();
  const mailer = createMailer(
    {
      MAIL_TRANSPORT: 'resend-allow-list',
      RESEND_API_KEY: 're_test_123',
      MAIL_FROM_ADDRESS: 'noreply@sportbet.lt',
      MAIL_ALLOWED_RECIPIENTS: [OWNER],
    },
    fetchFn,
    warn,
  );
  await mailer.send(MAIL);
  await mailer.send({ ...MAIL, to: unwrap(emailAddress('x@example.lt')) });
  expect(calls.map(({ url }) => url)).toEqual([
    'https://api.resend.com/emails',
  ]);
  expect(warn).toHaveBeenCalledTimes(1);
});
