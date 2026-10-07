import Image from 'next/image';
import Link from 'next/link';
import { MAIN_PATH } from './shell-paths';

// sportbet's mark (public/img/logo.png, 1024 x 1024 and 1.5 MB), served
// resized by next/image from the app itself.
const LOGO = { src: '/img/logo.png', width: 1024, height: 1024 };

/** Where a brand leads: a player to the game page, a guest to the tournaments (rail.blade.php, rail-guest.blade.php, header.blade.php). */
const homeOf = (player: boolean): string => (player ? MAIN_PATH : '/');

/**
 * The brand at the top of the rail (.sb-rail-brand). The hover colour is
 * sportbet's base a:hover, which its rail brand never overrode.
 */
export function RailBrand({ player }: { player: boolean }) {
  return (
    <Link
      href={homeOf(player)}
      className="flex items-center gap-2 px-4 pb-4 text-[1.22rem] font-extrabold tracking-[0.02em] text-on-rail uppercase no-underline hover:text-accent-hover"
    >
      <Image
        src={LOGO.src}
        width={LOGO.width}
        height={LOGO.height}
        sizes="26px"
        alt=""
        className="h-[26px] w-auto"
      />
      <span>
        Sport<i className="text-rail-accent not-italic">Bet</i>
      </span>
    </Link>
  );
}

/** The brand on the phone bar (.sb-topnav .sb-brand): a smaller mark below 576px, no wordmark below 360px (sportbet issue 130). */
export function PhoneBrand({ player }: { player: boolean }) {
  return (
    <Link
      href={homeOf(player)}
      className="flex shrink-0 items-center gap-1.5 text-[1.1rem] font-extrabold tracking-[-0.3px] text-on-rail no-underline"
    >
      <Image
        src={LOGO.src}
        width={LOGO.width}
        height={LOGO.height}
        sizes="32px"
        alt="SportBet"
        className="h-8 w-auto max-sm:h-7"
      />
      <span className="max-[360px]:hidden">
        Sport<span className="text-rail-accent">Bet</span>
      </span>
    </Link>
  );
}
