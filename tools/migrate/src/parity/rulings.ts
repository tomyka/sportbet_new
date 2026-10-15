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
import { RULINGS, type RuleField } from './ruling-table';
import {
  differing,
  keyedRows,
  PARITY_TABLES,
  type SurvivalKey,
} from './compare';

export { RULINGS, type RuleField } from './ruling-table';

/** A ruling as the report names it: "CO-5, CO-7: odds from the votes, ...". */
export const rulingLabel = (field: RuleField): string =>
  `${RULINGS[field].rules}: ${RULINGS[field].ruling}`;

export const FIELDS = Object.keys(RULINGS).filter(
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

interface FieldImpact {
  readonly field: RuleField;
  readonly label: string;
  /**
   * The prerequisite it is measured on top of, and its catalogue rules, or
   * null: against sportbetRules.
   */
  readonly measuredWith: {
    readonly field: RuleField;
    readonly rules: string;
  } | null;
  readonly effect: Effect;
}

export interface RulingsImpact {
  /** Plain sportbetRules, in memory: the rankings are compared on its totals. */
  readonly base: TournamentPoints;
  readonly fields: readonly FieldImpact[];
  /** Every ruling at once (the ruledRules run the reader stored). */
  readonly ruled: Effect;
  /**
   * The points of `ruled` no line explains, in ten-thousandths: rulings
   * acting together beyond a prerequisite. The lines' points plus this are
   * `ruled`'s; rows and players overlap, so they do not add up. Null when
   * a run was refused.
   */
  readonly remainder: number | null;
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

/** The rows that differ between two runs, each table's; their players noted. */
function changedRows(
  runs: { readonly base: TournamentPoints; readonly other: TournamentPoints },
  scored: ReadonlySet<GameId>,
  players: Set<PlayerId>,
): number {
  let rows = 0;
  for (const table of PARITY_TABLES) {
    const before = keyedRows(runs.base, table, scored, byPlayerAndRound());
    const after = keyedRows(runs.other, table, scored, byPlayerAndRound());
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
  return rows;
}

/** How far the players' totals moved between two runs; the players noted. */
function changedPoints(
  base: TournamentPoints,
  other: TournamentPoints,
  players: Set<PlayerId>,
): number {
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
  return points;
}

function effectOf(
  base: TournamentPoints,
  other: TournamentPoints,
  scored: ReadonlySet<GameId>,
): Effect {
  const players = new Set<PlayerId>();
  const rows = changedRows({ base, other }, scored, players);
  const points = changedPoints(base, other, players);
  return { kind: 'changes', rows, players: players.size, points };
}

/**
 * Spec 3: for each field recalculateTournament reads, one recalculation
 * under sportbetRules with only that field set to its ruledRules value,
 * each reading what its own rule set reads, compared in memory with plain
 * sportbetRules; then every ruling at once. Nothing is stored. A field
 * that needs another (the crowd votes count only where the odds come from
 * the votes) is measured with that one on, against it alone. What the
 * lines leave of the whole's points is the remainder.
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
  const between = (
    from: Result<TournamentPoints, string>,
    to: Result<TournamentPoints, string>,
  ): Effect => {
    if (!from.ok) return { kind: 'refused', refusal: from.refusal };
    if (!to.ok) return { kind: 'refused', refusal: to.refusal };
    return effectOf(from.value, to.value, scored);
  };
  // One run per set of switched fields: a prerequisite runs once.
  const runs = new Map<string, Promise<Result<TournamentPoints, string>>>();
  const runWithRulings = (...switched: readonly RuleField[]) => {
    const key = switched.toSorted().join(',');
    let result = runs.get(key);
    if (result === undefined) {
      let rules: RuleSet = sportbetRules;
      for (const field of switched) {
        rules = { ...rules, [field]: ruledRules[field] };
      }
      result = run(Object.freeze(rules));
      runs.set(key, result);
    }
    return result;
  };
  const fields: FieldImpact[] = [];
  for (const field of FIELDS) {
    fields.push(
      await fieldImpact(field, {
        between: (to) => between(base, to),
        betweenRuns: between,
        runWithRulings,
      }),
    );
  }
  const ruled = between(base, await run(ruledRules));
  return ok({
    base: base.value,
    fields,
    ruled,
    remainder: remainderOf(ruled, fields),
  });
}

type Run = Result<TournamentPoints, string>;

/**
 * One field's effect: none without a stored row it scores; else against
 * plain sportbetRules, or on top of the field it needs.
 */
async function fieldImpact(
  field: RuleField,
  measure: {
    readonly between: (to: Run) => Effect;
    readonly betweenRuns: (from: Run, to: Run) => Effect;
    readonly runWithRulings: (
      ...switched: readonly RuleField[]
    ) => Promise<Run>;
  },
): Promise<FieldImpact> {
  const { scoring, needs } = RULINGS[field];
  const label = rulingLabel(field);
  if (!scoring) {
    return {
      field,
      label,
      measuredWith: null,
      effect: { kind: 'no-stored-row' },
    };
  }
  if (needs === null) {
    return {
      field,
      label,
      measuredWith: null,
      effect: measure.between(await measure.runWithRulings(field)),
    };
  }
  return {
    field,
    label,
    measuredWith: { field: needs, rules: RULINGS[needs].rules },
    effect: measure.betweenRuns(
      await measure.runWithRulings(needs),
      await measure.runWithRulings(needs, field),
    ),
  };
}

/** What the lines leave of all the rulings' points: null once any is refused. */
function remainderOf(
  ruled: Effect,
  fields: readonly FieldImpact[],
): number | null {
  let remainder: number | null = ruled.kind === 'changes' ? ruled.points : null;
  for (const { effect } of fields) {
    if (remainder === null || effect.kind === 'no-stored-row') continue;
    remainder = effect.kind === 'changes' ? remainder - effect.points : null;
  }
  return remainder;
}
