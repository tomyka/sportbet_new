import type { JobLease, ReminderRecipient } from '@sportbet/db';
import {
  dueReminders,
  storedEmailAddress,
  type DueReminder,
  type GameId,
  type Instant,
  type PlayerId,
  type ReminderCandidate,
} from '@sportbet/domain';
import {
  MailDeliveryError,
  type MailOutcome,
  type OutgoingMail,
} from '../mail/mail';
import { reminderMail } from '../mail/reminder-mail';
import { unsubscribeLinks } from './unsubscribe-link';

/** The lease's name in `job_leases`. */
export const REMINDERS_JOB = 'reminders';

/** sportbet's `withoutOverlapping(30)` (R-97): a crashed run frees the job this long after it took it. */
export const LEASE_MINUTES = 30;

/** Resend's default limit is two requests a second: sends are sequential, at least this far apart. */
export const SEND_GAP_MS = 500;

/**
 * How long a run keeps starting sends: the route's `maxDuration` is 60 s, so
 * a run that is out of time stops here and leaves the rest, unmarked, to the
 * next one, 15 minutes on.
 */
export const TIME_BUDGET_MS = 40_000;

/** A delivery refused for the key (Resend 401 or 403) or for the rate (429) stops the run: every mail after it would be refused the same way. */
const STOPPING_STATUSES: ReadonlySet<number> = new Set([401, 403, 429]);

/** What a run needs of the world, so the route supplies the real ones and a test its fakes. */
export interface RemindersWorld {
  /** The site's origin (APP_URL), for the links in a mail. */
  readonly appUrl: string;
  /** What signs an unsubscribe link (AUTH_SECRET). */
  readonly secret: string;
  readonly now: () => Instant;
  /** Milliseconds since the run began, on a monotonic clock. */
  readonly elapsedMs: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly takeLease: () => Promise<JobLease | null>;
  readonly releaseLease: (lease: JobLease) => Promise<void>;
  readonly loadCandidates: (
    now: Instant,
  ) => Promise<readonly ReminderCandidate[]>;
  readonly loadRecipients: (
    due: readonly DueReminder[],
  ) => Promise<readonly ReminderRecipient[]>;
  readonly send: (mail: OutgoingMail) => Promise<MailOutcome>;
  readonly mark: (marked: {
    readonly player: PlayerId;
    readonly games: readonly GameId[];
  }) => Promise<void>;
  /** A failure, by its kind: never an address, a body or a link (a link is a bearer token). */
  readonly logError: (message: string) => void;
}

/** What a run did, in counts: never who it mailed. */
interface RunSummary {
  readonly sent: number;
  readonly refused: number;
  readonly failed: number;
  /** Players left for the next run: the run ran out of time. */
  readonly deferred: number;
}

export type RunResult = RunSummary | { readonly skipped: 'running' };

type Verdict = 'sent' | 'refused' | 'failed' | 'stop';

/** The kind of a failed send, for the log: a service and a status, or an error's name. Never its message, which can name an address. */
function kindOf(error: unknown): string {
  if (error instanceof MailDeliveryError) {
    return `${error.service} HTTP ${String(error.status)}`;
  }
  return error instanceof Error ? error.name : 'unknown';
}

function failureOf(world: RemindersWorld, error: unknown): Verdict {
  if (
    error instanceof MailDeliveryError &&
    STOPPING_STATUSES.has(error.status)
  ) {
    world.logError(
      `reminders: the run stopped, ${error.service} refused with HTTP ${String(error.status)}`,
    );
    return 'stop';
  }
  world.logError(`reminders: a mail failed (${kindOf(error)})`);
  return 'failed';
}

/**
 * One player's mail, then its marks: written only after the mail went out,
 * so a failed send marks nothing and a crash re-sends at most this one. A
 * mail the staging allow-list refused is marked too, or every seeded fake
 * player would be retried every 15 minutes.
 */
async function deliver(
  world: RemindersWorld,
  recipient: ReminderRecipient,
): Promise<Verdict> {
  const to = storedEmailAddress(recipient.email);
  if (!to.ok) {
    world.logError('reminders: a stored address is not an address');
    return 'failed';
  }
  const links = unsubscribeLinks(world.appUrl, recipient.player, world.secret);
  const mail = reminderMail(to.value, recipient.games, {
    appUrl: world.appUrl,
    ...links,
  });
  let outcome: MailOutcome;
  try {
    outcome = await world.send(mail);
  } catch (error) {
    return failureOf(world, error);
  }
  await world.mark({
    player: recipient.player,
    games: recipient.games.map(({ game }) => game),
  });
  return outcome;
}

async function mailAll(
  world: RemindersWorld,
  recipients: readonly ReminderRecipient[],
): Promise<RunSummary> {
  const tally = { sent: 0, refused: 0, failed: 0, deferred: 0 };
  for (const [index, recipient] of recipients.entries()) {
    if (world.elapsedMs() > TIME_BUDGET_MS) {
      tally.deferred = recipients.length - index;
      break;
    }
    if (index > 0) await world.sleep(SEND_GAP_MS);
    const verdict = await deliver(world, recipient);
    if (verdict === 'stop') break;
    tally[verdict] += 1;
  }
  return tally;
}

async function releaseQuietly(
  world: RemindersWorld,
  lease: JobLease,
): Promise<void> {
  try {
    await world.releaseLease(lease);
  } catch {
    // The marks are written; the lease frees itself when its time is up.
    world.logError('reminders: the lease was not released');
  }
}

/**
 * SendPredictionReminders::handle (R-97), under a lease: another run holding
 * it answers `skipped` and reads nothing. Otherwise the clock is read once,
 * the candidates are the domain's to judge (`dueReminders`), and each due
 * player is mailed in turn and marked. The lease is released however the run
 * ends.
 */
export async function sendReminders(world: RemindersWorld): Promise<RunResult> {
  const lease = await world.takeLease();
  if (lease === null) return { skipped: 'running' };
  try {
    const at = world.now();
    const due = dueReminders(await world.loadCandidates(at), at);
    return await mailAll(world, await world.loadRecipients(due));
  } finally {
    await releaseQuietly(world, lease);
  }
}
