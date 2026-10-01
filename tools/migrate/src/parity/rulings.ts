import {
  ok,
  recalculateTournament,
  ruledRules,
  sportbetRules,
  type GameId,
  type PlayerId,
  type Result,
  type RuleSet,
  type TournamentInputs,
  type TournamentPoints,
  type TournamentTotal,
} from '@sportbet/domain';
import {
  differing,
  keyedRows,
  PARITY_TABLES,
  type SurvivalKey,
} from './compare';

/** A RuleSet field: one difference between sportbet and the rulings. */
export type RuleField = Exclude<keyof RuleSet, 'name'>;

/** A ruling's catalogue name, and whether recalculateTournament reads it. */
interface Ruling {
  readonly label: string;
  readonly scoring: boolean;
}

/**
 * Every RuleSet field, named after its catalogue rule and ruling, and
 * whether recalculateTournament reads it (directly, or through the crowd
 * odds, the standings or the survival refold). A field it does not read
 * governs entry or ranking only and changes no stored row. Checked against
 * every field (`satisfies`), so neither a new field left out nor a stale
 * one left in compiles.
 */
export const RULINGS: Readonly<Record<RuleField, Ruling>> = Object.freeze({
  movedGameReopens: {
    label: 'LR-2, R-13: a moved game reopens only before its tip-off',
    scoring: false,
  },
  currentRound: {
    label: 'LR-3, R-6, R-40: the current round is the soonest next game',
    scoring: false,
  },
  stageRates: {
    label: 'LR-4, R-10: each stage carries its rate',
    scoring: false,
  },
  finishedTournamentsFrozen: {
    label: 'LR-6, R-21, R-22: a finished tournament is frozen',
    scoring: false,
  },
  levelResultAllowed: {
    label: 'MS-10, R-38: no level Euroleague result',
    scoring: false,
  },
  halfTypedPredictionStored: {
    label: 'MS-1, MS-2, R-15: a half-typed prediction is not stored',
    scoring: false,
  },
  missingOddsScoreAtOne: {
    label: 'CO-5, CO-7: odds from the votes, never a missing row at 1.0',
    scoring: true,
  },
  crowdOddsCountFilledIn: {
    label: 'CO-6, R-2, R-9: filled-in predictions are not crowd votes',
    scoring: true,
  },
  fillInsOfMistakenResultRemoved: {
    label: "FI-4, R-5: a mistaken result's fill-ins are removed",
    scoring: false,
  },
  survivalPickLocksAtTipOff: {
    label: "SU-4, R-4: a pick locks at its team's tip-off",
    scoring: false,
  },
  survivalTeamOncePerRun: {
    label: 'SU-5, R-11: a team is used once per run',
    scoring: false,
  },
  survivalRegularSeasonOnly: {
    label: 'SU-7, R-10: survival in regular-season rounds only',
    scoring: false,
  },
  survivalScoredFromStoredRows: {
    label: 'SU-10, R-5: survival folded from the pick history',
    scoring: true,
  },
  positionsGetCrowdBonus: {
    label: 'ST-4, R-35: no crowd bonus on a table position',
    scoring: true,
  },
  standingsBonusPopulation: {
    label:
      'ST-5, ST-7, R-3, R-36: the crowd bonus counts every standings player',
    scoring: true,
  },
  placesScoredOnlyFromFinalTable: {
    label: 'ST-8, R-14: places paid only from the final table',
    scoring: true,
  },
  unscoredPlaceStoresNull: {
    label: 'ST-6, ST-8, R-14: an unscored place stores null, not 0',
    scoring: true,
  },
  everyPageRanksByFullTotal: {
    label: 'RA-1, R-18: every page ranks by the full total',
    scoring: false,
  },
  tieOrder: {
    label: 'RA-3, R-30: ties listed in Lithuanian order',
    scoring: false,
  },
  adminHideSeparate: {
    label: 'RA-4, R-19: an admin hide is a state of its own',
    scoring: false,
  },
  rankHistoryFromWhenEarned: {
    label: 'RA-5, R-17: standings and survival count from when earned',
    scoring: false,
  },
  switchOff: {
    label: 'PL-1, R-7, R-32: switched off after 20 fill-ins in a tournament',
    scoring: false,
  },
  registrationClosesAt: {
    label: 'PL-2, R-8: registration closes at the standings deadline',
    scoring: false,
  },
  lateJoinersFilledIn: {
    label: 'PL-2, R-9: a late joiner is filled in for games already played',
    scoring: false,
  },
} satisfies Record<RuleField, Ruling>);

const FIELDS = Object.keys(RULINGS).filter(
  (field): field is RuleField => field in RULINGS,
);

/** What a rule set changes against plain sportbetRules. */
export type Effect =
  | { readonly kind: 'no-stored-row' }
  | { readonly kind: 'refused'; readonly refusal: string }
  | {
      readonly kind: 'changes';
      /** Rows added, removed or with a column changed, over the four tables. */
      readonly rows: number;
      /** Players with a changed row or total. */
      readonly players: number;
      /** The players' totals added up, variant minus sportbet, in ten-thousandths. */
      readonly points: number;
    };

export interface FieldImpact {
  readonly field: RuleField;
  readonly label: string;
  readonly effect: Effect;
}

export interface RulingsImpact {
  /** Plain sportbetRules, in memory: the rankings are compared on its totals. */
  readonly base: TournamentPoints;
  readonly fields: readonly FieldImpact[];
  /** Every ruling at once (the ruledRules run the reader stored). */
  readonly ruled: Effect;
}

/**
 * A tournament's inputs as a rule set reads them (the db's
 * loadInputsUnderRuleSet), or why they cannot be read.
 */
export type InputsUnder = (
  rules: RuleSet,
) => Promise<Result<TournamentInputs, string>>;

/**
 * Survival rows by player, round and their order within it: a row folded
 * from the picks rewrites no stored row, so it has no stored id.
 */
const byPlayerAndRound = (): SurvivalKey => {
  const seen = new Map<string, number>();
  return (row) => {
    const key = `${row.player}/${String(row.round)}`;
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    return `${key}/${String(nth)}`;
  };
};

/** A total's four parts in ten-thousandths (RA-1). */
const tenThousandths = (total: TournamentTotal) =>
  (total.match.hundredths +
    total.serija.hundredths +
    total.survival.hundredths) *
    100 +
  total.standings.tenThousandths;

function effectOf(
  base: TournamentPoints,
  other: TournamentPoints,
  scored: ReadonlySet<GameId>,
): Effect {
  const players = new Set<PlayerId>();
  let rows = 0;
  for (const table of PARITY_TABLES) {
    const before = keyedRows(base, table, scored, byPlayerAndRound());
    const after = keyedRows(other, table, scored, byPlayerAndRound());
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(key);
      const b = after.get(key);
      if (differing(a, b).length === 0) continue;
      rows += 1;
      const subject = (b ?? a)?.subject;
      if (subject !== undefined && 'player' in subject) {
        players.add(subject.player);
      }
    }
  }
  const totalOf = (points: TournamentPoints) =>
    new Map(
      points.totals.map((total) => [total.player, tenThousandths(total)]),
    );
  const before = totalOf(base);
  const after = totalOf(other);
  let points = 0;
  for (const player of new Set([...before.keys(), ...after.keys()])) {
    const change = (after.get(player) ?? 0) - (before.get(player) ?? 0);
    if (change !== 0) players.add(player);
    points += change;
  }
  return { kind: 'changes', rows, players: players.size, points };
}

/**
 * Spec 3: for each field recalculateTournament reads, one recalculation
 * under sportbetRules with only that field set to its ruledRules value,
 * each reading what its own rule set reads, compared in memory with plain
 * sportbetRules; then every ruling at once. Nothing is stored. A field
 * whose effect needs another (the crowd votes count only where the odds
 * come from the votes) shows its share only in the difference between the
 * sum and the whole.
 */
export async function rulingsImpact(
  inputsUnder: InputsUnder,
  scored: ReadonlySet<GameId>,
): Promise<Result<RulingsImpact, string>> {
  const run = async (
    rules: RuleSet,
  ): Promise<Result<TournamentPoints, string>> => {
    const inputs = await inputsUnder(rules);
    return inputs.ok ? recalculateTournament(inputs.value, rules) : inputs;
  };
  const base = await run(sportbetRules);
  if (!base.ok) return base;
  const against = (result: Result<TournamentPoints, string>): Effect =>
    result.ok
      ? effectOf(base.value, result.value, scored)
      : { kind: 'refused', refusal: result.refusal };
  const fields: FieldImpact[] = [];
  for (const field of FIELDS) {
    const { label, scoring } = RULINGS[field];
    if (!scoring) {
      fields.push({ field, label, effect: { kind: 'no-stored-row' } });
      continue;
    }
    const variant: RuleSet = Object.freeze({
      ...sportbetRules,
      [field]: ruledRules[field],
    });
    fields.push({ field, label, effect: against(await run(variant)) });
  }
  return ok({
    base: base.value,
    fields,
    ruled: against(await run(ruledRules)),
  });
}
