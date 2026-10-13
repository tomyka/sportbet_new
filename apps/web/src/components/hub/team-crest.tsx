import type { JSX } from 'react';
import Image from 'next/image';
import { crestPath } from './crests';

/**
 * Where a crest is drawn, and so its size and shape. sportbet's
 * x-team-crest always puts it on the .sb-crest plate - white, a hairline,
 * 2px of padding, 6px corners, the artwork contained - so a dark-ink crest
 * stays legible on the dark card (issue #79); each caller sizes it.
 */
export type CrestSize =
  'hub' | 'line' | 'row' | 'large' | 'pick' | 'chip' | 'tile';

const PLATE =
  'box-border inline-block shrink-0 border border-crest-plate-line bg-crest-plate p-[2px]';

const SIZES: Readonly<
  Record<CrestSize, { readonly px: number; readonly className: string }>
> = {
  // The hub's .standing-flag: 20px and round, the artwork covering it.
  hub: { px: 20, className: `${PLATE} size-5 rounded-full object-cover` },
  // .upcoming-flag: a scored row of the predictions page.
  line: {
    px: 22,
    className: `${PLATE} size-[22px] rounded-[6px] object-contain`,
  },
  // .pred-flag: an open or locked row.
  row: {
    px: 26,
    className: `${PLATE} size-[26px] rounded-[6px] object-contain`,
  },
  // game-single.blade.php's width="52" height="52".
  large: {
    px: 52,
    className: `${PLATE} size-[52px] rounded-[6px] object-contain`,
  },
  // The survival grid's .sv-crest.
  pick: {
    px: 28,
    className: `${PLATE} size-[28px] rounded-[6px] object-contain`,
  },
  // A survival run chip's .sv-chip-crest (x-team-crest small).
  chip: {
    px: 18,
    className: `${PLATE} size-[18px] rounded-[6px] object-contain`,
  },
  // .svs-tile .sb-crest: the tile is the plate, so the crest drops its
  // hairline and padding and fills it.
  tile: {
    px: 32,
    className:
      'box-border block size-full rounded-[2px] bg-crest-plate object-contain',
  },
};

/** sportbet's x-team-crest: the team's crest (TeamLogo), its name as the alternative text. */
export function TeamCrest({
  team,
  size = 'hub',
}: {
  team: string;
  size?: CrestSize;
}): JSX.Element {
  const { px, className } = SIZES[size];
  return (
    // A local file at a fixed small size: drawn as it is, never through
    // the image optimiser (no resizing to gain; the placeholder is an SVG).
    <Image
      unoptimized
      src={crestPath(team)}
      alt={team}
      width={px}
      height={px}
      className={className}
    />
  );
}
