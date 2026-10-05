import {
  MailDeliveryError,
  SENDER_NAME,
  type Fetch,
  type Mailer,
} from './mail';

/** Mailpit's HTTP send API (POST /api/v1/send), for CI's E2E stack and local runs. */
export function mailpitMailer(
  baseUrl: string,
  from: string,
  fetchFn: Fetch,
): Mailer {
  return {
    send: async (mail) => {
      const response = await fetchFn(new URL('/api/v1/send', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from, Name: SENDER_NAME },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          HTML: mail.html,
          Text: mail.text,
        }),
      });
      await response.text();
      if (!response.ok) throw new MailDeliveryError('mailpit', response.status);
      return 'sent';
    },
  };
}
