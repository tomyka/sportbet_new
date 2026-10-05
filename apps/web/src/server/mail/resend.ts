import {
  MailDeliveryError,
  SENDER_NAME,
  type Fetch,
  type Mailer,
} from './mail';

const RESEND_EMAILS = 'https://api.resend.com/emails';

/**
 * Resend's REST API (POST /emails), as sportbet sends through its Laravel
 * driver: one request, so no SDK. The key goes in the header only.
 */
export function resendMailer(
  apiKey: string,
  from: string,
  fetchFn: Fetch,
): Mailer {
  return {
    send: async (mail) => {
      const response = await fetchFn(new URL(RESEND_EMAILS), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${SENDER_NAME} <${from}>`,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      await response.text();
      if (!response.ok) throw new MailDeliveryError('resend', response.status);
      return 'sent';
    },
  };
}
