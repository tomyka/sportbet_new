import type { StandingsLineKey } from '@sportbet/domain';

/** What the standings summary calls one of a cell's four lines. */
interface StageLabel {
  /** A badge popover's heading, sportbet's `sstBadgePopover` label. */
  readonly popover: string;
  /** The title of a badge with no popover: the place and the final say what was predicted, the ticks name their stage. */
  readonly title: (shown: string) => string;
  /** The legend's letters: sportbet's G, QF, SF and F. */
  readonly letters: string;
  /** The legend's name for the stage (Euroleague has no 1/16 or 1/8). */
  readonly legend: string;
}

/**
 * sportbet's labels for the four lines, read by the badge and the legend.
 * The league table's and the total's popovers use the Euroleague names
 * instead (EUROLEAGUE_STAGE_NAMES, R-76), a separate data set.
 */
export const STAGE_LABELS: Readonly<Record<StandingsLineKey, StageLabel>> = {
  place: {
    popover: 'Grupės vieta',
    title: (shown) => `Grupės vieta: spėta ${shown}`,
    letters: 'G',
    legend: 'Grupė',
  },
  playOffs: {
    popover: 'Ketvirtfinalis',
    title: () => '1/4',
    letters: 'QF',
    legend: '1/4',
  },
  finalFour: {
    popover: 'Pusfinalis',
    title: () => '1/2',
    letters: 'SF',
    legend: '1/2',
  },
  final: {
    popover: 'Finalas',
    title: (shown) => `Finalas: spėta ${shown}`,
    letters: 'F',
    legend: 'Finalas',
  },
};
