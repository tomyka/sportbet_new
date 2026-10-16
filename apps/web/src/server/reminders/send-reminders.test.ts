import type { JobLease, ReminderGame, ReminderRecipient } from '@sportbet/db';
import {
  gameId,
  instantFrom,
  playerId,
  type DueReminder,
  type GameId,
  type Instant,
  type PlayerId,
  type ReminderCandidate,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  MailDeliveryError,
  type MailOutcome,
  type OutgoingMail,
} from '../mail/mail';
import {
  LEASE_MINUTES,
  sendReminders,
  SEND_GAP_MS,
  TIME_BUDGET_MS,
  type RemindersWorld,
} from './send-reminders';

const NOW = unwrap(instantFrom('2026-10-20T15:00:00Z'));
const LEASE: JobLease = { job: 'reminders', runId: 'run-1' };
const player = (id: number): PlayerId => unwrap(playerId(String(id)));
const game = (id: number) => unwrap(gameId(id));

// Tip-off 15:30Z, 30 minutes after NOW: due at once (an hour before has passed).
const TIP_OFF: Instant = unwrap(instantFrom('2026-10-20T15:30:00Z'));
const candidate = (p: number, g: number): ReminderCandidate => ({
  player: player(p),
  game: game(g),
  tipOff: TIP_OFF,
});
const reminderGame = (id: number): ReminderGame => ({
  game: game(id),
  home: 'Žalgiris',
  away: 'Real Madrid',
  tipOff: TIP_OFF,
});
const recipient = (p: number, g: number): ReminderRecipient => ({
  player: player(p),
  email: `player${String(p)}@example.lt`,
  games: [reminderGame(g)],
});

interface Spies {
  readonly world: RemindersWorld;
  readonly calls: string[];
  readonly sent: OutgoingMail[];
  readonly marks: { player: PlayerId; games: number[] }[];
  readonly errors: string[];
  readonly sleeps: number[];
}

/** A world of fakes: `sending` answers each mail in turn (the last answer repeats). */
function fakeWorld(
  options: {
    lease?: JobLease | null;
    candidates?: readonly ReminderCandidate[];
    recipients?: readonly ReminderRecipient[];
    sending?: readonly (MailOutcome | Error)[];
    marking?: readonly (Error | undefined)[];
    stillDue?: (games: readonly GameId[]) => readonly GameId[];
    elapsed?: () => number;
    release?: () => Promise<void>;
  } = {},
): Spies {
  const calls: string[] = [];
  const sent: OutgoingMail[] = [];
  const marks: Spies['marks'] = [];
  const errors: string[] = [];
  const sleeps: number[] = [];
  const answers = options.sending ?? ['sent'];
  let turn = 0;
  let markTurn = 0;
  const world: RemindersWorld = {
    appUrl: 'https://sportbet.lt',
    secret: 'run-tests-only-not-a-secret-0123456789',
    now: () => {
      calls.push('now');
      return NOW;
    },
    elapsedMs: options.elapsed ?? (() => 0),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    takeLease: () => {
      calls.push('take');
      return Promise.resolve(
        options.lease === undefined ? LEASE : options.lease,
      );
    },
    releaseLease: (lease) => {
      calls.push(`release ${lease.runId}`);
      return options.release?.() ?? Promise.resolve();
    },
    loadCandidates: (at) => {
      calls.push(`candidates ${String(at)}`);
      return Promise.resolve(options.candidates ?? []);
    },
    loadRecipients: (due: readonly DueReminder[]) => {
      calls.push(`recipients ${String(due.length)}`);
      return Promise.resolve(options.recipients ?? []);
    },
    send: (mail) => {
      const answer = answers[Math.min(turn, answers.length - 1)] ?? 'sent';
      turn += 1;
      sent.push(mail);
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
    stillDue: ({ games }) =>
      Promise.resolve(options.stillDue?.(games) ?? games),
    mark: (marked) => {
      const failure = options.marking?.[markTurn];
      markTurn += 1;
      if (failure !== undefined) return Promise.reject(failure);
      marks.push({ player: marked.player, games: [...marked.games] });
      return Promise.resolve();
    },
    logError: (message) => {
      errors.push(message);
    },
  };
  return { world, calls, sent, marks, errors, sleeps };
}

describe('sendReminders: the lease (R-97)', () => {
  it('reads nothing and sends nothing while another run holds the lease', async () => {
    const run = fakeWorld({ lease: null, candidates: [candidate(1, 10)] });
    await expect(sendReminders(run.world)).resolves.toEqual({
      skipped: 'running',
    });
    expect(run.calls).toEqual(['take']);
  });

  it('releases the lease it took when the run ends', async () => {
    const run = fakeWorld();
    await sendReminders(run.world);
    expect(run.calls.at(-1)).toBe('release run-1');
  });

  it('releases the lease when a read throws, and lets the failure through', async () => {
    const run = fakeWorld();
    const failing: RemindersWorld = {
      ...run.world,
      loadCandidates: () => Promise.reject(new Error('db down')),
    };
    await expect(sendReminders(failing)).rejects.toThrow('db down');
    expect(run.calls).toContain('release run-1');
  });

  it('does not let a failed release hide the run, and logs the kind only', async () => {
    const run = fakeWorld({
      release: () => Promise.reject(new Error('connection to host 10.0.0.1')),
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({ sent: 0 });
    expect(run.errors).toEqual(['reminders: the lease was not released']);
  });
});

describe('sendReminders: the sends', () => {
  it('reads the candidates at the run clock, mails each due player and marks their games', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11)],
      recipients: [recipient(1, 10), recipient(2, 11)],
    });
    await expect(sendReminders(run.world)).resolves.toEqual({
      sent: 2,
      refused: 0,
      failed: 0,
      unmarked: 0,
      stale: 0,
      deferred: 0,
    });
    expect(run.calls).toContain(`candidates ${String(NOW)}`);
    expect(run.calls).toContain('recipients 2');
    // The run's clock is read once.
    expect(run.calls.filter((call) => call === 'now')).toHaveLength(1);
    expect(run.sent.map(({ to }) => to)).toEqual([
      'player1@example.lt',
      'player2@example.lt',
    ]);
    expect(run.marks).toEqual([
      { player: player(1), games: [10] },
      { player: player(2), games: [11] },
    ]);
  });

  it("mails a player's own unsubscribe links, signed for them", async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10)],
      recipients: [recipient(1, 10)],
    });
    await sendReminders(run.world);
    const [mail] = run.sent;
    expect(mail?.html).toContain(
      'https://sportbet.lt/profile/notifications/unsubscribe/1?signature=',
    );
    expect(mail?.headers?.['List-Unsubscribe']).toMatch(
      /^<https:\/\/sportbet\.lt\/profile\/notifications\/unsubscribe\/1\/confirm\?signature=[\w.-]+>$/,
    );
    expect(mail?.html).toContain('https://sportbet.lt/prediction/game/10');
  });

  it('sends nothing when nobody is due, and marks nothing', async () => {
    const early: ReminderCandidate = {
      ...candidate(1, 10),
      tipOff: unwrap(instantFrom('2026-10-21T15:30:00Z')),
    };
    const run = fakeWorld({ candidates: [early], recipients: [] });
    await expect(sendReminders(run.world)).resolves.toMatchObject({ sent: 0 });
    expect(run.sent).toEqual([]);
    expect(run.marks).toEqual([]);
  });

  it('marks a mail the allow-list refused, so it is not retried every 15 minutes', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10)],
      recipients: [recipient(1, 10)],
      sending: ['refused'],
    });
    await expect(sendReminders(run.world)).resolves.toEqual({
      sent: 0,
      refused: 1,
      failed: 0,
      unmarked: 0,
      stale: 0,
      deferred: 0,
    });
    expect(run.marks).toEqual([{ player: player(1), games: [10] }]);
  });

  it('marks nothing for a failed send and goes on with the next player, logging the status only', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11)],
      recipients: [recipient(1, 10), recipient(2, 11)],
      sending: [new MailDeliveryError('resend', 500), 'sent'],
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 1,
      failed: 1,
    });
    expect(run.marks).toEqual([{ player: player(2), games: [11] }]);
    expect(run.errors).toEqual(['reminders: a mail failed (resend HTTP 500)']);
  });

  it('counts a failure that is no delivery error as failed, logging its name only', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10)],
      recipients: [recipient(1, 10)],
      sending: [new TypeError('fetch failed for player1@example.lt')],
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(run.errors).toEqual(['reminders: a mail failed (TypeError)']);
    expect(JSON.stringify(run.errors)).not.toContain('@');
  });

  it('counts a stored address that is no address as failed, marks it nothing, and goes on', async () => {
    const odd: ReminderRecipient = {
      ...recipient(1, 10),
      email: 'not an address',
    };
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11)],
      recipients: [odd, recipient(2, 11)],
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 1,
      failed: 1,
    });
    expect(run.marks).toEqual([{ player: player(2), games: [11] }]);
    expect(run.errors).toEqual([
      'reminders: a stored address is not an address',
    ]);
  });

  it.each([401, 403, 429])(
    'stops the run at a delivery refused with HTTP %i, once, and leaves the rest unmailed',
    async (status) => {
      const run = fakeWorld({
        candidates: [candidate(1, 10), candidate(2, 11), candidate(3, 12)],
        recipients: [recipient(1, 10), recipient(2, 11), recipient(3, 12)],
        sending: ['sent', new MailDeliveryError('resend', status)],
      });
      const summary = await sendReminders(run.world);
      expect(summary).toMatchObject({ sent: 1, failed: 0 });
      expect(run.sent).toHaveLength(2);
      expect(run.marks).toEqual([{ player: player(1), games: [10] }]);
      expect(run.errors).toEqual([
        `reminders: the run stopped, resend refused with HTTP ${String(status)}`,
      ]);
      expect(run.calls.at(-1)).toBe('release run-1');
    },
  );

  it.each([400, 422, 500, 503])('goes on after HTTP %i', async (status) => {
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11)],
      recipients: [recipient(1, 10), recipient(2, 11)],
      sending: [new MailDeliveryError('resend', status), 'sent'],
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 1,
      failed: 1,
    });
  });

  it('spaces the sends at least half a second apart, none before the first', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11), candidate(3, 12)],
      recipients: [recipient(1, 10), recipient(2, 11), recipient(3, 12)],
    });
    await sendReminders(run.world);
    expect(SEND_GAP_MS).toBeGreaterThanOrEqual(500);
    expect(run.sleeps).toEqual([SEND_GAP_MS, SEND_GAP_MS]);
  });

  it('defers the players it has no time left for to the next run, unmarked', async () => {
    // The clock is looked at before each player: the third is past the budget.
    const readings = [0, 1, TIME_BUDGET_MS + 1];
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(2, 11), candidate(3, 12)],
      recipients: [recipient(1, 10), recipient(2, 11), recipient(3, 12)],
      elapsed: () => readings.shift() ?? TIME_BUDGET_MS + 1,
    });
    await expect(sendReminders(run.world)).resolves.toEqual({
      sent: 2,
      refused: 0,
      failed: 0,
      unmarked: 0,
      stale: 0,
      deferred: 1,
    });
    expect(run.marks.map(({ player: p }) => p)).toEqual([player(1), player(2)]);
  });

  it('puts no address in the summary or the log', async () => {
    const run = fakeWorld({
      candidates: [candidate(1, 10)],
      recipients: [recipient(1, 10)],
      sending: [new MailDeliveryError('resend', 500)],
    });
    const summary = await sendReminders(run.world);
    expect(JSON.stringify([summary, run.errors])).not.toContain('@');
  });
});

describe('sendReminders: a failing mark and the re-check', () => {
  const three = {
    candidates: [candidate(1, 10), candidate(2, 11), candidate(3, 12)],
    recipients: [recipient(1, 10), recipient(2, 11), recipient(3, 12)],
  };

  it('goes on to the next players when a mark fails after a mail that went out, counting it and logging its kind only', async () => {
    const run = fakeWorld({
      ...three,
      marking: [
        undefined,
        new Error('update failed for player2@example.lt'),
        undefined,
      ],
    });
    await expect(sendReminders(run.world)).resolves.toEqual({
      sent: 2,
      refused: 0,
      failed: 0,
      unmarked: 1,
      stale: 0,
      deferred: 0,
    });
    expect(run.sent).toHaveLength(3);
    expect(run.marks.map(({ player: p }) => p)).toEqual([player(1), player(3)]);
    expect(run.errors).toEqual([
      'reminders: a mail went out but was not marked (Error)',
    ]);
    expect(run.calls.at(-1)).toBe('release run-1');
  });

  it('marks nothing for the one send that failed, and the others are still marked', async () => {
    const run = fakeWorld({
      ...three,
      sending: ['sent', new MailDeliveryError('resend', 500), 'sent'],
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 2,
      failed: 1,
      unmarked: 0,
    });
    expect(run.marks.map(({ player: p }) => p)).toEqual([player(1), player(3)]);
  });

  it('re-checks each player just before their mail, and mails and marks only the games still due', async () => {
    const two: ReminderRecipient = {
      ...recipient(1, 10),
      games: [reminderGame(10), reminderGame(13)],
    };
    const run = fakeWorld({
      candidates: [candidate(1, 10), candidate(1, 13)],
      recipients: [two],
      stillDue: (games) => games.filter((id) => id === game(13)),
    });
    await sendReminders(run.world);
    expect(run.marks).toEqual([{ player: player(1), games: [13] }]);
    expect(run.sent[0]?.html).toContain('/prediction/game/13');
    expect(run.sent[0]?.html).not.toContain('/prediction/game/10');
  });

  it('sends and marks nothing for a player with nothing still due, counting them stale', async () => {
    const run = fakeWorld({
      ...three,
      stillDue: (games) => games.filter((id) => id !== game(11)),
    });
    await expect(sendReminders(run.world)).resolves.toMatchObject({
      sent: 2,
      stale: 1,
    });
    expect(run.sent).toHaveLength(2);
    expect(run.marks.map(({ player: p }) => p)).toEqual([player(1), player(3)]);
  });

  it('counts a re-check that fails as failed, sends nothing for it and goes on', async () => {
    const run = fakeWorld(three);
    const failing: RemindersWorld = {
      ...run.world,
      stillDue: (due) =>
        due.player === player(2)
          ? Promise.reject(new TypeError('read of player2@example.lt'))
          : run.world.stillDue(due),
    };
    await expect(sendReminders(failing)).resolves.toMatchObject({
      sent: 2,
      failed: 1,
    });
    expect(run.errors).toEqual(['reminders: a due check failed (TypeError)']);
  });
});

describe('sendReminders: the lease', () => {
  it('stops starting sends long before its lease could have run out', () => {
    // A run that is still sending when its lease expires could be joined by
    // another run and mail the same players twice.
    expect(TIME_BUDGET_MS).toBeLessThan((LEASE_MINUTES * 60_000) / 10);
  });
});
