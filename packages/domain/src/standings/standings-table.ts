import type { StandingsDeadline } from '../round/season';
import type { TeamId } from '../shared/ids';
import type { Instant } from '../shared/instant';
import { ok, refuse, type Result } from '../shared/result';
import {
  afterTick,
  finalFourWithoutPlayOffs,
  finalPlaceOpen,
  finalPlaceWithoutFinalFour,
  keptChain,
  stageFull,
  tickOpen,
} from './chain';
import {
  isEnteredFinalPlace,
  STANDINGS_COUNTS,
  type EnteredFinalPlace,
  type StandingsStage,
  type TeamPick,
} from './standings-prediction';
import {
  sportbetOrder,
  standingsCounts,
  type StandingsCloses,
  type StandingsView,
  type StandingsViewRow,
} from './standings-view';

export type {
  StandingsBoxes,
  StandingsCloses,
  StandingsCounts,
  StandingsView,
  StandingsViewRow,
} from './standings-view';

export type StandingsRowRefusal =
  | 'not-yours'
  | 'place-out-of-table'
  | 'place-taken'
  | 'play-offs-full'
  | 'final-four-full'
  | 'final-place-taken'
  | 'final-four-without-play-offs'
  | 'final-place-without-final-four'
  | 'closed';

export type ReorderRefusal = 'not-yours' | 'closed' | 'mismatch';

/** A posted row: a TeamPick whose final place is one an entry may name. */
export interface StandingsEntry extends Omit<TeamPick, 'finalPlace'> {
  readonly finalPlace: EnteredFinalPlace | null;
}

export interface PlacedTeam {
  readonly team: TeamId;
  readonly place: number;
}

/** A team of the tournament, as the table lists it. */
export interface StandingsTeam {
  readonly id: TeamId;
  readonly name: string;
}

interface TableState {
  /** Each team's name, by id: the table's teams. */
  readonly names: ReadonlyMap<TeamId, string>;
  /** The teams in the order shown. */
  readonly order: readonly TeamId[];
  /** The order last saved (withSavedOrder), else the order built in. */
  readonly savedOrder: readonly TeamId[];
  /** Each team's row as stored (or as the page changed it); blank for none. */
  readonly rows: ReadonlyMap<TeamId, TeamPick>;
  /** R-80, and whether the table is open (ST-2): open unless closed. */
  readonly closes: StandingsCloses;
}

const blankRow = (team: TeamId): TeamPick => ({
  team,
  place: null,
  playOffs: null,
  finalFour: null,
  finalPlace: null,
});

/** Each team its place, 1.. in `order`: what a saved order writes. */
const numbered = (order: readonly TeamId[]): readonly PlacedTeam[] =>
  order.map((team, index) => ({ team, place: index + 1 }));

const pickOf = (row: TeamPick): TeamPick => ({
  team: row.team,
  place: row.place,
  playOffs: row.playOffs,
  finalFour: row.finalFour,
  finalPlace: row.finalPlace,
});

/**
 * The posted place's refusal, or null: judged only when it changes from
 * the row as shown - within the table (the rules' `min:1|max:positionMax`)
 * and not another row's.
 */
function placeRefusal(
  entry: StandingsEntry,
  shown: TeamPick,
  others: readonly TeamPick[],
  tableSize: number,
): StandingsRowRefusal | null {
  if (entry.place === null || entry.place === shown.place) return null;
  if (entry.place < 1 || entry.place > tableSize) return 'place-out-of-table';
  return others.some((row) => row.place === entry.place) ? 'place-taken' : null;
}

/**
 * StandingsRules::rowConflicts' stages and final place, or null: a new
 * tick on a full stage, a changed final place another row holds.
 */
function conflictRefusal(
  entry: StandingsEntry,
  shown: TeamPick,
  others: readonly TeamPick[],
): StandingsRowRefusal | null {
  const full = (stage: StandingsStage) =>
    entry[stage] === true && shown[stage] !== true && stageFull(others, stage);
  if (full('playOffs')) return 'play-offs-full';
  if (full('finalFour')) return 'final-four-full';
  const finalTaken =
    entry.finalPlace !== null &&
    entry.finalPlace !== shown.finalPlace &&
    others.some((row) => row.finalPlace === entry.finalPlace);
  return finalTaken ? 'final-place-taken' : null;
}

/** R-78's chain broken by the posted row, or null. */
function chainRefusal(entry: StandingsEntry): StandingsRowRefusal | null {
  if (finalFourWithoutPlayOffs(entry)) return 'final-four-without-play-offs';
  if (finalPlaceWithoutFinalFour(entry))
    return 'final-place-without-final-four';
  return null;
}

/**
 * One player's standings table in one tournament (decision 10: a
 * standings table knows its deadline): the tournament's teams, the
 * player's rows - as stored, and mended to R-78's chain as sportbet's page
 * mends them on load (keptChain) - and whether it is open (ST-2, asked of
 * the season once, at the moment the table is judged at). It decides both
 * saves, and shows the page (view) the boxes those saves accept.
 */
export class StandingsTable {
  readonly #state: TableState;
  /** The rows as the page shows them: each mended to R-78's chain. */
  readonly #mended: ReadonlyMap<TeamId, TeamPick>;

  private constructor(state: TableState) {
    this.#state = state;
    this.#mended = new Map(
      [...state.rows].map(([team, row]) => [team, keptChain(row)]),
    );
    Object.freeze(this);
  }

  /**
   * The table of the tournament's teams with the player's stored rows (a
   * row of a team not among them is not the table's), judged at `now`.
   * Shown in sportbet's order.
   */
  static at(input: {
    readonly teams: readonly StandingsTeam[];
    readonly rows: readonly TeamPick[];
    readonly season: StandingsDeadline;
    readonly now: Instant;
  }): StandingsTable {
    const { teams, season, now } = input;
    const stored = new Map(input.rows.map((row) => [row.team, row]));
    const rows = new Map(
      teams.map(({ id }) => [id, pickOf(stored.get(id) ?? blankRow(id))]),
    );
    const open = season.isStandingsOpenAt(now);
    const deadline = season.standingsDeadline();
    const order = sportbetOrder(
      teams.map(({ id, name }) => ({
        team: id,
        name,
        place: rows.get(id)?.place ?? null,
      })),
    );
    return new StandingsTable({
      names: new Map(teams.map(({ id, name }) => [id, name])),
      order,
      savedOrder: order,
      rows,
      closes:
        deadline === null
          ? { state: 'never' }
          : open
            ? { state: 'open', at: deadline }
            : { state: 'closed' },
    });
  }

  /** The table a view shows, rebuilt (the page's copy: no season needed). */
  static fromView(view: StandingsView): StandingsTable {
    const order = view.rows.map((row) => row.team);
    return new StandingsTable({
      names: new Map(view.rows.map((row) => [row.team, row.name])),
      order,
      savedOrder: order,
      rows: new Map(view.rows.map((row) => [row.team, pickOf(row)])),
      closes: view.closes,
    });
  }

  /**
   * updatePredictionStandingsUser once the form has passed. A team not in
   * the table is not the player's. Then the place within the table (the
   * rules' `min:1|max:positionMax`) and not another row's;
   * StandingsRules::rowConflicts' stages and final place against the other
   * rows as the page shows them (mended to R-78's chain; the Euroleague
   * format enforces them); the stage chain (R-78); the deadline (ST-2).
   * A place, a tick and a final place are judged against the other rows
   * only when they change from the row as shown: the page posts a row back
   * whole, and stored values are sportbet's (a place 0, two rows sharing a
   * place or a final place, a place past a table since shrunk, a stage
   * holding more than its count), kept as they are until changed - a
   * reorder rewrites every place. Accepted: the row to store, as posted -
   * a blank place or final place null, a posted tick as posted, a tick not
   * posted null.
   */
  saveRow(entry: StandingsEntry): Result<TeamPick, StandingsRowRefusal> {
    // The row as the page shows it (mended): what it posts back unchanged.
    const shown = this.#mended.get(entry.team);
    if (shown === undefined) return refuse('not-yours');
    const others = [...this.#mended.values()].filter(
      (row) => row.team !== entry.team,
    );
    const refusal =
      placeRefusal(entry, shown, others, this.#state.names.size) ??
      conflictRefusal(entry, shown, others) ??
      chainRefusal(entry) ??
      (this.#isOpen() ? null : 'closed');
    return refusal === null ? ok(entry) : refuse(refusal);
  }

  /**
   * reorderPredictionStandingsUser: the whole table in its new order.
   * Closed from the deadline (ST-2); the order must name every team of the
   * table once (StandingsReorder::accepts). Accepted: each team's place,
   * 1.. in posted order - only places: ticks and final places are
   * untouched.
   */
  reorder(
    order: readonly TeamId[],
  ): Result<readonly PlacedTeam[], ReorderRefusal> {
    if (!this.#isOpen()) return refuse('closed');
    if (!this.#isWholeTable(order)) return refuse('mismatch');
    return ok(numbered(order));
  }

  /** The table with a row's box changed as the page changes it (R-78). */
  withTick(
    team: TeamId,
    stage: StandingsStage,
    checked: boolean,
  ): StandingsTable {
    return this.#withRow(afterTick(this.#mendedRow(team), stage, checked));
  }

  /** The table with a row's final place named or cleared. */
  withFinalPlace(
    team: TeamId,
    place: EnteredFinalPlace | null,
  ): StandingsTable {
    return this.#withRow(
      keptChain({ ...this.#mendedRow(team), finalPlace: place }),
    );
  }

  /**
   * The table after an accepted reorder (what reorder decides): each team's
   * place its index + 1 in `order`, shown in that order. Anything but the
   * whole table is an impossible state.
   */
  withSavedOrder(order: readonly TeamId[]): StandingsTable {
    const shown = this.withOrder(order).#state;
    const rows = new Map(shown.rows);
    for (const { team, place } of numbered(order)) {
      const row = rows.get(team);
      if (row !== undefined) rows.set(team, { ...row, place });
    }
    return new StandingsTable({ ...shown, rows, savedOrder: [...order] });
  }

  /**
   * The table shown in its last saved order again (a refused reorder's
   * rollback); with none saved yet, the order it was built in.
   */
  withLastSavedOrder(): StandingsTable {
    return this.withOrder(this.#state.savedOrder);
  }

  /**
   * The table with a row's ticks and final place put back as `before` held
   * them (a refused row save's rollback), its place the table's own, the
   * row kept mended to R-78's chain.
   */
  withBoxesOf(team: TeamId, before: TeamPick): StandingsTable {
    return this.#withRow(
      keptChain({
        ...this.#mendedRow(team),
        playOffs: before.playOffs,
        finalFour: before.finalFour,
        finalPlace: before.finalPlace,
      }),
    );
  }

  /**
   * The table shown in another order (a move on the ladder, or back to the
   * last saved order). No place changes until the order is saved
   * (withSavedOrder). Anything but the whole table is an impossible state.
   */
  withOrder(order: readonly TeamId[]): StandingsTable {
    if (!this.#isWholeTable(order)) {
      throw new Error('StandingsTable.withOrder: not the whole table');
    }
    return new StandingsTable({ ...this.#state, order: [...order] });
  }

  /**
   * What the page shows: the rows in the shown order, mended to R-78's
   * chain, each with the boxes the saves accept (all shut once closed),
   * whether the ladder may be reordered and whether to offer saving the
   * shown order (R-79), the counters and totals - from the table's own
   * teams and rows, never from a view it was rebuilt from - and R-80's
   * line.
   */
  view(): StandingsView {
    const mended = [...this.#mended.values()];
    const open = this.#isOpen();
    const rows = this.#state.order.map((team): StandingsViewRow => {
      const row = this.#mendedRow(team);
      return {
        ...row,
        name: this.#nameOf(team),
        boxes: {
          playOffs: open && tickOpen(mended, row, 'playOffs'),
          finalFour: open && tickOpen(mended, row, 'finalFour'),
          finalPlace: open && finalPlaceOpen(row),
        },
      };
    });
    const counts = standingsCounts(mended);
    const placesSaved = counts.places > 0;
    return {
      rows,
      placesSaved,
      reorderable: open,
      offerSaveShown: open && !placesSaved,
      counts,
      totals: {
        places: this.#state.names.size,
        playOffs: STANDINGS_COUNTS.playOffs,
        finalFour: STANDINGS_COUNTS.finalFour,
        finalPlaces: STANDINGS_COUNTS.finalPlaces,
      },
      closes: this.#state.closes,
    };
  }

  /**
   * The row as the page posts it: as shown (mended to R-78's chain), its
   * place as last saved, each tick as its box is - ticked or not, so a
   * never-saved tick goes as unticked (sportbet's `cb.checked ? 1 : 0`) -
   * and a blank place or final place blank. A stored final place 3 or 4
   * (football's box) is no Euroleague entry: an impossible state, as is a
   * team not in the table.
   */
  entryOf(team: TeamId): StandingsEntry {
    const row = this.#mendedRow(team);
    const { finalPlace } = row;
    if (finalPlace !== null && !isEnteredFinalPlace(finalPlace)) {
      throw new Error(
        `StandingsTable.entryOf: team ${team}'s final place ${String(finalPlace)} is no entry`,
      );
    }
    return {
      team: row.team,
      place: row.place,
      playOffs: row.playOffs === true,
      finalFour: row.finalFour === true,
      finalPlace,
    };
  }

  #isOpen(): boolean {
    return this.#state.closes.state !== 'closed';
  }

  #nameOf(team: TeamId): string {
    const name = this.#state.names.get(team);
    if (name === undefined) {
      throw new Error(`StandingsTable: team ${team} has no name`);
    }
    return name;
  }

  #isWholeTable(order: readonly TeamId[]): boolean {
    const named = new Set(order);
    return (
      named.size === order.length &&
      order.length === this.#state.names.size &&
      order.every((team) => this.#state.names.has(team))
    );
  }

  #mendedRow(team: TeamId): TeamPick {
    const row = this.#mended.get(team);
    if (row === undefined) {
      throw new Error(`StandingsTable: team ${team} is not in the table`);
    }
    return row;
  }

  #withRow(row: TeamPick): StandingsTable {
    const rows = new Map(this.#state.rows);
    rows.set(row.team, pickOf(row));
    return new StandingsTable({ ...this.#state, rows });
  }
}
