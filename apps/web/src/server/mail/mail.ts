import type { EmailAddress } from '@sportbet/domain';

/** One message to one address. */
export interface OutgoingMail {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Extra message headers (the reminder's List-Unsubscribe pair, RFC 8058). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Sent, or refused by staging's allow-list. */
export type MailOutcome = 'sent' | 'refused';

/** Where mail leaves the app (create-mailer.ts picks the adapter). */
export interface Mailer {
  /**
   * Whether the transport would deliver to this address at all - asked
   * before a one-time code is issued (sportbet's mailerWouldLeakCodes runs
   * before issue), so a send that is bound to be refused does not void the
   * code the person is already holding.
   */
  readonly mayDeliver: (to: EmailAddress) => boolean;
  readonly send: (mail: OutgoingMail) => Promise<MailOutcome>;
}

/** The part of fetch the adapters use, so tests can stand in for it. */
export type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

/** How long one send may take before it counts as a failed delivery: a hung service must not hold a run (or a sign-in) until the platform kills it. */
export const SEND_TIMEOUT_MS = 10_000;

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
