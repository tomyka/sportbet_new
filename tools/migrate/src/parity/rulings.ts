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

/**
 * A ruling: its catalogue rules and owner rulings ("CO-5, CO-7"), what it
 * says, whether recalculateTournament reads it, and the field it acts only
 * alongside, or null: a scoring field with no prerequisite of its own.
 */
interface Ruling {
  readonly rules: string;
  readonly ruling: string;
  readonly scoring: boolean;
  readonly needs: RuleField | null;
}

/**
 * Every RuleSet field, named after its catalogue rule and ruling, and
 * whether recalculateTournament reads it (directly, or through the crowd
 * odds, the standings or the survival refold). A field it does not read
 * governs entry or ranking only and changes no stored row. A field read
 * only when another is on needs that one. Checked against
 * every field (`satisfies`), so neither a new field left out nor a stale
 * one left in compiles.
 */
export const RULINGS: Readonly<Record<RuleField, Ruling>> = Object.freeze({
  movedGameReopens: {
    rules: 'LR-2, R-13',
    ruling: 'a moved game reopens only before its tip-off',
    scoring: false,
    needs: null,
  },
  currentRound: {
    rules: 'LR-3, R-6, R-40',
    ruling: 'the current round is the soonest next game',
    scoring: false,
    needs: null,
  },
  stageRates: {
    rules: 'LR-4, R-10',
    ruling: 'each stage carries its rate',
    scoring: false,
    needs: null,
  },
  finishedTournamentsFrozen: {
    rules: 'LR-6, R-21, R-22',
    ruling: 'a finished tournament is frozen',
    scoring: false,
    needs: null,
  },
  missingOddsScoreAtOne: {
    rules: 'CO-5, CO-7',
    ruling: 'odds from the votes, never a missing row at 1.0',
    scoring: true,
    needs: null,
  },
  crowdOddsCountFilledIn: {
    rules: 'CO-6, R-2, R-9',
    ruling: 'filled-in predictions are not crowd votes',
    scoring: true,
    // The votes count only where the odds come from them.
    needs: 'missingOddsScoreAtOne',
  },
  fillInsOfMistakenResultRemoved: {
    rules: 'FI-4, R-5',
    ruling: "a mistaken result's fill-ins are removed",
    scoring: false,
    needs: null,
  },
  survivalPickLocksAtTipOff: {
    rules: 'SU-4, R-4',
    ruling: "a pick locks at its team's tip-off",
    scoring: false,
    needs: null,
  },
  survivalTeamOncePerRun: {
    rules: 'SU-5, R-11',
    ruling: 'a team is used once per run',
    scoring: false,
    needs: null,
  },
  survivalRegularSeasonOnly: {
    rules: 'SU-7, R-10',
    ruling: 'survival in regular-season rounds only',
    scoring: false,
    needs: null,
  },
  survivalScoredFromStoredRows: {
    rules: 'SU-10, R-5',
    ruling: 'survival folded from the pick history',
    scoring: true,
    needs: null,
  },
  positionsGetCrowdBonus: {
    rules: 'ST-4, R-35',
    ruling: 'no crowd bonus on a table position',
    scoring: true,
    needs: null,
  },
  standingsBonusPopulation: {
    rules: 'ST-5, ST-7, R-3, R-36',
    ruling: 'the crowd bonus counts every standings player',
    scoring: true,
    needs: null,
  },
  placesScoredOnlyFromFinalTable: {
    rules: 'ST-8, R-14',
    ruling: 'places paid only from the final table',
    scoring: true,
    needs: null,
  },
  unscoredPlaceStoresNull: {
    rules: 'ST-6, ST-8, R-14',
    ruling: 'an unscored place stores null, not 0',
    scoring: true,
    needs: null,
  },
  everyPageRanksByFullTotal: {
    rules: 'RA-1, R-18',
    ruling: 'every page ranks by the full total',
    scoring: false,
    needs: null,
  },
  tieOrder: {
    rules: 'RA-3, R-30',
    ruling: 'ties listed in Lithuanian order',
    scoring: false,
    needs: null,
  },
  adminHideSeparate: {
    rules: 'RA-4, R-19',
    ruling: 'an admin hide is a state of its own',
    scoring: false,
    needs: null,
  },
  rankHistoryFromWhenEarned: {
    rules: 'RA-5, R-17',
    ruling: 'standings and survival count from when earned',
    scoring: false,
    needs: null,
  },
  leaderboardCountsEachListedTournament: {
    rules: 'RA-4, R-77',
    ruling: 'the leaderboard counts each tournament where a player is listed',
    scoring: false,
    needs: null,
  },
  switchOff: {
    rules: 'PL-1, R-7, R-32',
    ruling: 'switched off after 20 fill-ins in a tournament',
    scoring: false,
    needs: null,
  },
  onlyAScoreSwitchesBackOn: {
    rules: 'PL-1, R-7, R-57',
    ruling: 'only a saved score switches a player back on',
    scoring: false,
    needs: null,
  },
  registrationClosesAt: {
    rules: 'PL-2, R-8',
    ruling: 'registration closes at the standings deadline',
    scoring: false,
    needs: null,
  },
  lateJoinersFilledIn: {
    rules: 'PL-2, R-9',
    ruling: 'a late joiner is filled in for games already played',
    scoring: false,
    needs: null,
  },
  hubFinishedFollowsR21: {
    rules: 'LR-6, R-21, R-55',
    ruling: "the hub's finished group follows R-21",
    scoring: false,
    needs: null,
  },
  nonPublicTournamentsHidden: {
    rules: 'R-50',
    ruling:
      'a non-public tournament is shown only to its players and admins, and sign-up never joins it',
    scoring: false,
    needs: null,
  },
} satisfies Record<RuleField, Ruling>);

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

export interface FieldImpact {
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
    const { scoring, needs } = RULINGS[field];
    const label = rulingLabel(field);
    if (!scoring) {
      fields.push({
        field,
        label,
        measuredWith: null,
        effect: { kind: 'no-stored-row' },
      });
    } else if (needs === null) {
      fields.push({
        field,
        label,
        measuredWith: null,
        effect: between(base, await runWithRulings(field)),
      });
    } else {
      fields.push({
        field,
        label,
        measuredWith: { field: needs, rules: RULINGS[needs].rules },
        effect: between(
          await runWithRulings(needs),
          await runWithRulings(needs, field),
        ),
      });
    }
  }
  const ruled = between(base, await run(ruledRules));
  let remainder: number | null = ruled.kind === 'changes' ? ruled.points : null;
  for (const { effect } of fields) {
    if (remainder === null || effect.kind === 'no-stored-row') continue;
    remainder = effect.kind === 'changes' ? remainder - effect.points : null;
  }
  return ok({ base: base.value, fields, ruled, remainder });
}
