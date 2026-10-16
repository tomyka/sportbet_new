import { emailAddress } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowListMailer } from './allow-list';
import { createMailer } from './create-mailer';
import {
  MailDeliveryError,
  SEND_TIMEOUT_MS,
  type Fetch,
  type OutgoingMail,
} from './mail';
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
    const inner = {
      mayDeliver: () => true,
      send: vi.fn(() => Promise.resolve('sent' as const)),
    };
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

  it('says beforehand whether it would deliver, so a refusal can precede the issue of a code', () => {
    const warn = vi.fn();
    const mailer = allowListMailer(
      { mayDeliver: () => true, send: vi.fn() },
      [OWNER],
      warn,
    );
    expect(mailer.mayDeliver(OWNER)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(mailer.mayDeliver(unwrap(emailAddress('stranger@example.lt')))).toBe(
      false,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

it('the open transports would deliver to anyone', () => {
  const fetchFn = fetchAnswering(200).fetchFn;
  const stranger = unwrap(emailAddress('stranger@example.lt'));
  expect(
    mailpitMailer(
      'http://mailpit:8025',
      'noreply@sportbet.test',
      fetchFn,
    ).mayDeliver(stranger),
  ).toBe(true);
  expect(
    resendMailer('re_test_123', 'noreply@sportbet.lt', fetchFn).mayDeliver(
      stranger,
    ),
  ).toBe(true);
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

// Slice 16 (R-98): the reminder carries RFC 8058's List-Unsubscribe pair.
describe('a mail with headers', () => {
  const HEADERS = {
    'List-Unsubscribe': '<https://sportbet.lt/u/1>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  it('Mailpit gets them as `Headers`, Resend as `headers`, and a mail without any sends none', async () => {
    const mailpit = fetchAnswering(200);
    await mailpitMailer(
      'http://mailpit:8025',
      'noreply@sportbet.test',
      mailpit.fetchFn,
    ).send({ ...MAIL, headers: HEADERS });
    expect(bodyOf(mailpit.calls[0]?.init)).toMatchObject({ Headers: HEADERS });
    const resend = fetchAnswering(200);
    await resendMailer(
      're_test_123',
      'noreply@sportbet.lt',
      resend.fetchFn,
    ).send({ ...MAIL, headers: HEADERS });
    expect(bodyOf(resend.calls[0]?.init)).toMatchObject({ headers: HEADERS });
    await mailpitMailer(
      'http://mailpit:8025',
      'noreply@sportbet.test',
      mailpit.fetchFn,
    ).send(MAIL);
    expect(bodyOf(mailpit.calls[1]?.init)).not.toHaveProperty('Headers');
  });
});

// A mail service that hangs must fail the delivery, not hold the caller.
describe.each([
  [
    'mailpitMailer',
    (fetchFn: Fetch) =>
      mailpitMailer('http://mailpit:8025', 'noreply@sportbet.test', fetchFn),
  ],
  [
    'resendMailer',
    (fetchFn: Fetch) =>
      resendMailer('re_test_123', 'noreply@sportbet.lt', fetchFn),
  ],
])('%s with a service that never answers', (_name, build) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A fetch that answers nothing, ever, until its signal aborts. */
  const hanging: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      const { signal } = init;
      const fail = () => {
        reject(new DOMException('timed out', 'TimeoutError'));
      };
      if (signal?.aborted === true) fail();
      signal?.addEventListener('abort', fail);
    });

  it(`asks fetch to give up after ${String(SEND_TIMEOUT_MS)} ms and fails with the timeout, not a delivery refusal`, async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(
        AbortSignal.abort(new DOMException('timed out', 'TimeoutError')),
      );
    const sending = build(hanging).send(MAIL);
    await expect(sending).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(sending).rejects.not.toBeInstanceOf(MailDeliveryError);
    expect(timeout).toHaveBeenCalledWith(SEND_TIMEOUT_MS);
  });
});
