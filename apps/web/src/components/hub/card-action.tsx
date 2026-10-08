import type { JSX } from 'react';
import type { CardAction } from '@sportbet/domain';
import Link from 'next/link';
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from './styles';

const ENTER_LABEL = {
  play: 'Žaisti →',
  join: 'Prisijungti →',
  view: 'Peržiūrėti →',
} as const;

/**
 * hub.blade.php's button. Entering is a POST to the tournament's enter
 * (a plain form: the next page reads the session's tournament fresh);
 * the form is a plain link, never prefetched (the plan's decision 9).
 */
export function CardActionButton({
  action,
  slug,
}: {
  action: CardAction;
  slug: string;
}): JSX.Element {
  switch (action) {
    case 'play':
    case 'join':
    case 'view':
      return (
        <form method="post" action={`/tournament/${slug}/enter`}>
          <button type="submit" className={BUTTON_PRIMARY}>
            {ENTER_LABEL[action]}
          </button>
        </form>
      );
    case 'register':
      return (
        <a href={`/tournament/${slug}/register`} className={BUTTON_PRIMARY}>
          Registruotis į turnyrą →
        </a>
      );
    case 'view-results':
      return (
        <Link href={`/tournament/${slug}`} className={BUTTON_SECONDARY}>
          Peržiūrėti rezultatus →
        </Link>
      );
  }
}
