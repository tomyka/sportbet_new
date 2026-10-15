import type { StandingsCloses } from '../standings/standings-view';

/** One season and how ST-2 closes its standings. */
export interface StandingsDeadlineExample {
  readonly label: string;
  /** The season's round numbers. */
  readonly rounds: readonly number[];
  /** Its games: each one's round, tip-off (ISO-8601 UTC, to the second) and whether it has a result. */
  readonly games: readonly {
    readonly round: number;
    readonly tipOff: string;
    readonly scored: boolean;
  }[];
  /** The tournament's own deadline round, or null for the format's (5). */
  readonly deadlineRound: number | null;
  /** What ST-2 does to its standings: open, closed, or never closes. */
  readonly closes: StandingsCloses['state'];
}

const ROUNDS_4_TO_6 = [4, 5, 6];
const ROUND_4 = { round: 4, tipOff: '2026-10-16T18:00:00Z', scored: true };
const ROUND_6 = { round: 6, tipOff: '2026-10-28T18:00:00Z', scored: false };

/**
 * ST-2's rule held by example (as an invariant holds its own): standings
 * close once every game of the first round at or after the deadline round
 * - the tournament's own, else round 5 (STANDINGS_DEADLINE_ROUND) - that
 * has any game has a result (sportbet a4618c6; before it, at that round's
 * first tip-off). Season.standingsCloses is tested against them, and so is
 * the database's rendering of the rule
 * (packages/db/src/season/standings-closes-sql.ts), so the two cannot
 * drift.
 */
export const standingsDeadlineExamples: readonly StandingsDeadlineExample[] = [
  {
    label: 'round 5 open while one of its games has no result',
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: true },
      { round: 5, tipOff: '2026-10-22T18:00:00Z', scored: false },
      ROUND_6,
    ],
    deadlineRound: null,
    closes: 'open',
  },
  {
    label: 'round 5 not yet played: open, whatever order its games are in',
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-22T18:00:00Z', scored: false },
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: false },
    ],
    deadlineRound: null,
    closes: 'open',
  },
  {
    label: "round 5's games all scored: closed",
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: true },
      { round: 5, tipOff: '2026-10-22T18:00:00Z', scored: true },
      ROUND_6,
    ],
    deadlineRound: null,
    closes: 'closed',
  },
  {
    label:
      "an earlier round's unscored game neither keeps round 5 open nor closes it",
    rounds: ROUNDS_4_TO_6,
    games: [
      { round: 4, tipOff: '2026-10-21T16:00:00Z', scored: false },
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: false },
      { round: 5, tipOff: '2026-10-22T18:00:00Z', scored: false },
    ],
    deadlineRound: null,
    closes: 'open',
  },
  {
    label: "a later round's results do not close round 5",
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: false },
      { round: 6, tipOff: '2026-10-28T18:00:00Z', scored: true },
    ],
    deadlineRound: null,
    closes: 'open',
  },
  {
    label:
      'a round with no games is skipped: the next round with any is the one',
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 6, tipOff: '2026-10-28T18:00:00Z', scored: true },
      { round: 6, tipOff: '2026-10-29T18:00:00Z', scored: true },
    ],
    deadlineRound: null,
    closes: 'closed',
  },
  {
    label: "an admin's later round wins over the format's",
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: true },
      ROUND_6,
    ],
    deadlineRound: 6,
    closes: 'open',
  },
  {
    label: "an admin's earlier round wins over the format's",
    rounds: [1, 2, 5],
    games: [
      { round: 1, tipOff: '2026-10-02T18:00:00Z', scored: true },
      { round: 2, tipOff: '2026-10-09T18:45:00Z', scored: true },
      { round: 5, tipOff: '2026-10-30T18:00:00Z', scored: false },
    ],
    deadlineRound: 2,
    closes: 'closed',
  },
  {
    label: 'no game in the deadline round or later: never',
    rounds: [1, 4],
    games: [
      { round: 1, tipOff: '2026-10-02T18:00:00Z', scored: true },
      ROUND_4,
    ],
    deadlineRound: null,
    closes: 'never',
  },
  {
    label: 'no game at all: never',
    rounds: [5],
    games: [],
    deadlineRound: null,
    closes: 'never',
  },
];
