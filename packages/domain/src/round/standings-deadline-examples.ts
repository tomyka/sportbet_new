/** What a season's standings do under ST-2, as plain data. */
type StandingsClosesExample =
  | { readonly state: 'never' }
  | { readonly state: 'closed' }
  /** Open until the round's last game (ISO-8601 UTC, to the second) is scored. */
  | { readonly state: 'open'; readonly lastTipOff: string };

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
  /** The round whose results close standings, or null: standings never close. */
  readonly round: number | null;
  readonly closes: StandingsClosesExample;
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
 * (packages/db/src/season/standings-deadline-sql.ts), so the two cannot
 * drift.
 */
export const standingsDeadlineExamples: readonly StandingsDeadlineExample[] = [
  {
    label:
      'round 5 open while one of its games has no result, to its last tip-off',
    rounds: ROUNDS_4_TO_6,
    games: [
      ROUND_4,
      { round: 5, tipOff: '2026-10-21T17:00:00Z', scored: true },
      { round: 5, tipOff: '2026-10-22T18:00:00Z', scored: false },
      ROUND_6,
    ],
    deadlineRound: null,
    round: 5,
    closes: { state: 'open', lastTipOff: '2026-10-22T18:00:00Z' },
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
    round: 5,
    closes: { state: 'open', lastTipOff: '2026-10-22T18:00:00Z' },
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
    round: 5,
    closes: { state: 'closed' },
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
    round: 5,
    closes: { state: 'open', lastTipOff: '2026-10-22T18:00:00Z' },
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
    round: 5,
    closes: { state: 'open', lastTipOff: '2026-10-21T17:00:00Z' },
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
    round: 6,
    closes: { state: 'closed' },
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
    round: 6,
    closes: { state: 'open', lastTipOff: '2026-10-28T18:00:00Z' },
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
    round: 2,
    closes: { state: 'closed' },
  },
  {
    label: 'no game in the deadline round or later: never',
    rounds: [1, 4],
    games: [
      { round: 1, tipOff: '2026-10-02T18:00:00Z', scored: true },
      ROUND_4,
    ],
    deadlineRound: null,
    round: null,
    closes: { state: 'never' },
  },
  {
    label: 'no game at all: never',
    rounds: [5],
    games: [],
    deadlineRound: null,
    round: null,
    closes: { state: 'never' },
  },
];
