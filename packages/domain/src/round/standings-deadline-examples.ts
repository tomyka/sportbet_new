/** One season and the standings deadline ST-2 gives it. */
export interface StandingsDeadlineExample {
  readonly label: string;
  /** The season's round numbers. */
  readonly rounds: readonly number[];
  /** Its games: each one's round and tip-off (ISO-8601 UTC, to the second). */
  readonly games: readonly {
    readonly round: number;
    readonly tipOff: string;
  }[];
  /** The tournament's own deadline round, or null for the format's (5). */
  readonly deadlineRound: number | null;
  /** The deadline (ISO-8601 UTC), or null: standings never close. */
  readonly deadline: string | null;
}

const ROUNDS_4_TO_6 = [4, 5, 6];
const ROUND_4 = { round: 4, tipOff: '2026-10-16T18:00:00Z' };
const ROUND_6 = { round: 6, tipOff: '2026-10-28T18:00:00Z' };

/**
 * ST-2's rule held by example (as an invariant holds its own): the first
 * tip-off in the deadline round - the tournament's own, else round 5
 * (STANDINGS_DEADLINE_ROUND) - or any later round. Season.standingsDeadline
 * is tested against them, and so is the database's rendering of the rule
 * (packages/db/src/season/standings-deadline-sql.ts), so the two cannot
 * drift.
 */
export const standingsDeadlineExamples: readonly StandingsDeadlineExample[] = [
  {
    label: "round 5's first tip-off, by default",
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z' },
      { round: 5, tipOff: '2026-10-22T18:00:00Z' },
      ROUND_6,
    ],
    deadlineRound: null,
    deadline: '2026-10-21T17:00:00Z',
  },
  {
    label: "round 5's earliest game, whatever order its games are in",
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-22T18:00:00Z' },
      { round: 5, tipOff: '2026-10-21T17:00:00Z' },
    ],
    deadlineRound: null,
    deadline: '2026-10-21T17:00:00Z',
  },
  {
    label:
      "an earlier round's game moved to an hour before round 5 neither closes it nor moves it",
    rounds: ROUNDS_4_TO_6,
    games: [
      { round: 4, tipOff: '2026-10-21T16:00:00Z' },
      { round: 5, tipOff: '2026-10-21T17:00:00Z' },
      { round: 5, tipOff: '2026-10-22T18:00:00Z' },
    ],
    deadlineRound: null,
    deadline: '2026-10-21T17:00:00Z',
  },
  {
    label: 'a later round played first (round 5 rescheduled) closes it',
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-11-05T17:00:00Z' },
      { round: 5, tipOff: '2026-11-05T19:00:00Z' },
      ROUND_6,
    ],
    deadlineRound: null,
    deadline: '2026-10-28T18:00:00Z',
  },
  {
    label: "an admin's later round wins over the format's",
    rounds: ROUNDS_4_TO_6,
    games: [ROUND_4, { round: 5, tipOff: '2026-10-21T17:00:00Z' }, ROUND_6],
    deadlineRound: 6,
    deadline: '2026-10-28T18:00:00Z',
  },
  {
    label: "an admin's earlier round wins over the format's",
    rounds: [1, 2, 5],
    games: [
      { round: 1, tipOff: '2026-10-02T18:00:00Z' },
      { round: 2, tipOff: '2026-10-09T18:45:00Z' },
      { round: 5, tipOff: '2026-10-30T18:00:00Z' },
    ],
    deadlineRound: 2,
    deadline: '2026-10-09T18:45:00Z',
  },
  {
    label: 'no game in the deadline round or later: never',
    rounds: [1, 4],
    games: [{ round: 1, tipOff: '2026-10-02T18:00:00Z' }, ROUND_4],
    deadlineRound: null,
    deadline: null,
  },
  {
    label: 'no game at all: never',
    rounds: [5],
    games: [],
    deadlineRound: null,
    deadline: null,
  },
];
