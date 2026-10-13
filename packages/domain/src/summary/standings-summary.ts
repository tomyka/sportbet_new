import type { LeagueTableRow } from '../dashboard/league-table-rows';
import { formatUnits, roundUnits } from '../points/fixed-point';
import type { PointsRows } from '../recalculation/recalculation';
import type { PlayerId, TeamId } from '../shared/ids';
import type {
  StandingsStage,
  StandingsPrediction,
  TeamPick,
} from '../standings/standings-prediction';
import type { StandingsLine } from '../standings/standings-scoring';
import type { TeamOutcome, TeamOutcomes } from '../standings/team-outcomes';
import { standingsVerdict, type StandingsVerdict } from './verdict';

/** A stage's points, with what they were made from when the crowd bonus applied. */
export interface PointsBreakdown {
  readonly pointsCents: number;
  /** "Spėjimo taškai": the points before the bonus, one decimal ("190.0"); null without a bonus to show. */
  readonly base: string | null;
  /** "Koeficientas": 1 + the odds, two decimals ("2.00"); the view puts "×" before it. */
  readonly multiplier: string | null;
}

export type StandingsLineKey = 'place' | 'playOffs' | 'finalFour' | 'final';

export interface StageBreakdown extends PointsBreakdown {
  readonly stage: StandingsLineKey;
}

export interface StandingsBadge {
  /** The place or final place, "✓" / "✗" for a tick, "-" for nothing. */
  readonly shown: string;
  readonly verdict: StandingsVerdict;
  /** Null: the view shows only a title (sportbet's `title=` branch). */
  readonly popover: PointsBreakdown | null;
}

export interface StandingsCell {
  readonly place: StandingsBadge;
  /** "1/4". */
  readonly playOffs: StandingsBadge;
  /** "1/2". */
  readonly finalFour: StandingsBadge;
  readonly final: StandingsBadge;
  /** Shown above 0. */
  readonly totalCents: number;
  /** The total's popover: one line per stage with points; empty while the total is 0. */
  readonly totalLines: readonly StageBreakdown[];
}

export interface StandingsSummary {
  /** R-102: the league table's order. */
  readonly columns: readonly { player: PlayerId; username: string }[];
  /** In the order given; a player with no row for a team has no cell. */
  readonly teams: readonly {
    team: TeamId;
    name: string;
    cells: ReadonlyMap<PlayerId, StandingsCell>;
  }[];
}

const NO_LINE: StandingsLine = Object.freeze({ points: null, odds: null });

const LINE_KEYS: readonly StandingsLineKey[] = [
  'place',
  'playOffs',
  'finalFour',
  'final',
];

/**
 * `sstBadgePopover` and `sstPopover`'s "Spėjimo taškai" and "Koeficientas",
 * without a float: the odds are ten-thousandths and the points were made as
 * base x (10000 + odds), so the base is the points over 1 + odds, rounded to
 * a tenth, and the multiplier 1 + odds rounded to a hundredth, both half
 * away from zero in integers.
 */
function breakdown(line: StandingsLine, withBonus: boolean): PointsBreakdown {
  const points = line.points?.tenThousandths ?? 0;
  const factor = 10_000 + (line.odds?.tenThousandths ?? 0);
  return Object.freeze({
    pointsCents: line.points?.toCents() ?? 0,
    base: withBonus
      ? formatUnits(Math.floor((20 * points + factor) / (2 * factor)), 1)
      : null,
    multiplier: withBonus ? formatUnits(roundUnits(factor, 2), 2) : null,
  });
}

/** A badge's popover: the bonus is shown only when the odds and the points are above 0. */
function badgePopover(line: StandingsLine): PointsBreakdown {
  const bonus =
    line.odds !== null &&
    line.odds.tenThousandths > 0 &&
    (line.points?.toCents() ?? 0) > 0;
  return breakdown(line, bonus);
}

const noneIfUnset = (value: number | null): string =>
  value === null ? '-' : String(value);

/** A place or final place badge: popover whenever one was predicted. */
function numberBadge(
  predicted: number | null,
  verdict: StandingsVerdict,
  line: StandingsLine,
): StandingsBadge {
  return Object.freeze({
    shown: noneIfUnset(predicted),
    verdict,
    popover: predicted === null ? null : badgePopover(line),
  });
}

/** A tick badge: "✓" or "✗" when ticked (pending shows "✓"), "-" when not. */
function tickBadge(
  ticked: boolean,
  actual: boolean | null,
  line: StandingsLine,
): StandingsBadge {
  const verdict = standingsVerdict.advanced(ticked, actual);
  return Object.freeze({
    shown: !ticked ? '-' : verdict === 'miss' ? '✗' : '✓',
    verdict,
    popover: ticked ? badgePopover(line) : null,
  });
}

/**
 * A stage tick's actual value (ST-6): known once the stage is decided, so
 * before that every tick is pending.
 */
function stageActual(
  outcomes: TeamOutcomes,
  outcome: TeamOutcome | undefined,
  stage: StandingsStage,
): boolean | null {
  return outcomes.stageDecided(stage) ? (outcome?.[stage] ?? false) : null;
}

/** The lines with points, in sportbet's stage order, as the total's popover lists them. */
function totalLinesOf(
  lines: Readonly<Record<StandingsLineKey, StandingsLine>>,
): StageBreakdown[] {
  return LINE_KEYS.flatMap((stage) => {
    const line = lines[stage];
    return (line.points?.toCents() ?? 0) > 0
      ? [{ stage, ...breakdown(line, line.odds !== null) }]
      : [];
  });
}

/** A row's four lines; a team without a stored row has none scored. */
function linesOf(
  row: PointsRows['standings'][number] | undefined,
): Readonly<Record<StandingsLineKey, StandingsLine>> {
  return {
    place: row?.place ?? NO_LINE,
    playOffs: row?.playOffs ?? NO_LINE,
    finalFour: row?.finalFour ?? NO_LINE,
    final: row?.final ?? NO_LINE,
  };
}

/** The final place's badge, judged against whether the team reached the Final Four. */
function finalBadge(
  pick: TeamPick,
  outcome: TeamOutcome | undefined,
  finalFour: boolean | null,
  line: StandingsLine,
): StandingsBadge {
  return numberBadge(
    pick.finalPlace,
    standingsVerdict.final({
      predictedFinal: pick.finalPlace,
      predictedFinalFour: pick.finalFour === true,
      teamFinalFour: finalFour,
      teamFinal: outcome?.finalPlace ?? null,
    }),
    line,
  );
}

function cellOf(
  pick: TeamPick,
  outcomes: TeamOutcomes,
  row: PointsRows['standings'][number] | undefined,
): StandingsCell {
  const outcome = outcomes.outcomeOf(pick.team);
  const lines = linesOf(row);
  const finalFour = stageActual(outcomes, outcome, 'finalFour');
  return Object.freeze({
    place: numberBadge(
      pick.place,
      standingsVerdict.position(pick.place, outcome?.place ?? null),
      lines.place,
    ),
    playOffs: tickBadge(
      pick.playOffs === true,
      stageActual(outcomes, outcome, 'playOffs'),
      lines.playOffs,
    ),
    finalFour: tickBadge(pick.finalFour === true, finalFour, lines.finalFour),
    final: finalBadge(pick, outcome, finalFour, lines.final),
    totalCents: LINE_KEYS.reduce(
      (sum, key) => sum + (lines[key].points?.toCents() ?? 0),
      0,
    ),
    totalLines: totalLinesOf(lines),
  });
}

/**
 * PredictionStandingController::getPredictionStandingSummary and
 * getPredictionStandingProfile, Euroleague's four badges: the place, "1/4",
 * "1/2" and the final place, each with its verdict and popover, and the
 * cell's total. One column per listed player in the league table's order
 * (R-102); shown while standings are still open, on purpose (CONTEXT.md,
 * standings deadline). A stage's tick is judged only once the stage is
 * decided (ST-6).
 */
export function standingsSummary(input: {
  readonly table: readonly LeagueTableRow[];
  /** The tournament's teams, in the order shown (by id). */
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly outcomes: TeamOutcomes;
  /** Listed players only. */
  readonly predictions: readonly StandingsPrediction[];
  readonly rows: Pick<PointsRows, 'standings'>;
}): StandingsSummary {
  const { table, outcomes, rows } = input;
  const columns = table.map(({ player, username }) => ({ player, username }));
  const byPlayer = new Map(
    input.predictions.map((prediction) => [prediction.player, prediction]),
  );
  const rowOf = new Map(
    rows.standings.map((row) => [`${row.player}/${row.team}`, row]),
  );
  return Object.freeze({
    columns,
    teams: input.teams.map(({ id, name }) => {
      const cells = new Map<PlayerId, StandingsCell>();
      for (const { player } of columns) {
        const pick = byPlayer.get(player)?.pick(id);
        if (pick !== undefined) {
          cells.set(
            player,
            cellOf(pick, outcomes, rowOf.get(`${player}/${id}`)),
          );
        }
      }
      return Object.freeze({ team: id, name, cells });
    }),
  });
}
