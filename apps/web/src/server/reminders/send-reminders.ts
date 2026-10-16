import type { JobLease, ReminderGame, ReminderRecipient } from '@sportbet/db';
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
 * next one, 15 minutes on. It is far inside the lease (`LEASE_MINUTES`, 30):
 * no run can still be sending when its lease has run out and another run has
 * taken the job; a test holds the budget under the lease.
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
  /** Which of the player's games are still due, read just before their mail. */
  readonly stillDue: (due: {
    readonly player: PlayerId;
    readonly games: readonly GameId[];
  }) => Promise<readonly GameId[]>;
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
  /** A mail went out but its marks were not written: the player is mailed again next run. */
  readonly unmarked: number;
  /** Nothing to send any more: the player answered, was reminded or the game began since the candidates were read. */
  readonly stale: number;
  /** Players left for the next run: the run ran out of time. */
  readonly deferred: number;
}

export type RunResult = RunSummary | { readonly skipped: 'running' };

type Verdict = keyof Omit<RunSummary, 'deferred'> | 'stop';

/** The kind of a failed send, for the log: a service and a status, or an error's name. Never its message, which can name an address. */
function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

function kindOf(error: unknown): string {
  if (error instanceof MailDeliveryError) {
    return `${error.service} HTTP ${String(error.status)}`;
  }
  return errorKind(error);
}

function failureOf(world: RemindersWorld, error: unknown): 'failed' | 'stop' {
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
 * Sends one mail, then reports how it went. A refusal for the key or the rate
 * stops the run; any other failure is this player's alone.
 */
async function sendOne(
  world: RemindersWorld,
  mail: OutgoingMail,
): Promise<MailOutcome | 'failed' | 'stop'> {
  try {
    return await world.send(mail);
  } catch (error) {
    return failureOf(world, error);
  }
}

/**
 * Writes the marks of a mail that went out. A failure here is logged by kind
 * and answered as `unmarked`, never thrown: the run goes on to the next
 * player instead of leaving the rest unmailed.
 */
async function markSent(
  world: RemindersWorld,
  recipient: ReminderRecipient,
  games: readonly GameId[],
): Promise<boolean> {
  try {
    await world.mark({ player: recipient.player, games });
    return true;
  } catch (error) {
    world.logError(
      `reminders: a mail went out but was not marked (${errorKind(error)})`,
    );
    return false;
  }
}

/** The games of the recipient that are still due, read just before the send; none left, or a failed read, is no mail. */
async function gamesStillDue(
  world: RemindersWorld,
  recipient: ReminderRecipient,
): Promise<readonly ReminderGame[] | 'failed'> {
  try {
    const due = new Set(
      await world.stillDue({
        player: recipient.player,
        games: recipient.games.map(({ game }) => game),
      }),
    );
    return recipient.games.filter(({ game }) => due.has(game));
  } catch (error) {
    world.logError(`reminders: a due check failed (${errorKind(error)})`);
    return 'failed';
  }
}

/**
 * One recipient's whole step - re-check, send, mark, classify - and the one
 * place that keeps the run going whatever happens to a single player. The
 * marks are written only after the mail went out, so a failed send marks
 * nothing and is retried 15 minutes on. A mail the staging allow-list refused
 * is marked too, or every seeded fake player would be retried every 15
 * minutes. The window that remains: a mark that fails after a mail that went
 * out (`unmarked`) re-mails that one player on the next run, at most once a
 * run until a mark succeeds; the database failing that moment is the only
 * way in, and it is counted and logged, never hidden.
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
  const due = await gamesStillDue(world, recipient);
  if (due === 'failed') return 'failed';
  const [first, ...rest] = due;
  if (first === undefined) return 'stale';
  const links = unsubscribeLinks(world.appUrl, recipient.player, world.secret);
  const mail = reminderMail(to.value, [first, ...rest], {
    appUrl: world.appUrl,
    ...links,
  });
  const outcome = await sendOne(world, mail);
  if (outcome === 'failed' || outcome === 'stop') return outcome;
  const marked = await markSent(
    world,
    recipient,
    due.map(({ game }) => game),
  );
  return marked ? outcome : 'unmarked';
}

async function mailAll(
  world: RemindersWorld,
  recipients: readonly ReminderRecipient[],
): Promise<RunSummary> {
  const tally = {
    sent: 0,
    refused: 0,
    failed: 0,
    unmarked: 0,
    stale: 0,
    deferred: 0,
  };
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
