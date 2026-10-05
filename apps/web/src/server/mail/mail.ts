import type { EmailAddress } from '@sportbet/domain';

/** One message to one address. */
export interface OutgoingMail {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** Sent, or refused by staging's allow-list. */
export type MailOutcome = 'sent' | 'refused';

/** Where mail leaves the app (create-mailer.ts picks the adapter). */
export interface Mailer {
  readonly send: (mail: OutgoingMail) => Promise<MailOutcome>;
}

/** The part of fetch the adapters use, so tests can stand in for it. */
export type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

/** Every mail's sender name, as sportbet's config/mail.php commits it. */
export const SENDER_NAME = 'SportBet';

/**
 * A mail service refused a message. Its message names the service and the
 * HTTP status only: a response body can echo the address.
 */
export class MailDeliveryError extends Error {
  readonly service: string;
  readonly status: number;

  constructor(service: string, status: number) {
    super(`${service} refused the message: HTTP ${String(status)}`);
    this.name = 'MailDeliveryError';
    this.service = service;
    this.status = status;
  }
}
