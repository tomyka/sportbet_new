import { crestPath } from './crests';

/**
 * Where a crest is drawn, and so its size and shape. sportbet's
 * x-team-crest always puts it on the .sb-crest plate - white, a hairline,
 * 2px of padding, 6px corners, the artwork contained - so a dark-ink crest
 * stays legible on the dark card (issue #79); each caller sizes it.
 */
export type CrestSize = 'hub' | 'line' | 'row' | 'large';

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
};

/** sportbet's x-team-crest: the team's crest (TeamLogo), its name as the alternative text. */
export function TeamCrest({
  team,
  size = 'hub',
}: {
  team: string;
  size?: CrestSize;
}) {
  const { px, className } = SIZES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local file drawn at a fixed small size: next/image would add nothing
    <img
      src={crestPath(team)}
      alt={team}
      width={px}
      height={px}
      className={className}
    />
  );
}
