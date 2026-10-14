import type { JSX } from 'react';
import type { InviteCard } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { LEAGUE_ACCEPT, LEAGUE_DECLINE } from './league-paths';

/** One invite's answer: a plain form posting the invite's id (`inviteID`). */
function Answer({
  action,
  invite,
  className,
  children,
}: {
  action: string;
  invite: number;
  className: string;
  children: string;
}): JSX.Element {
  return (
    <form method="post" action={action}>
      <input type="hidden" name="inviteID" value={String(invite)} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/**
 * "Kvietimai" (index.blade.php): the player's pending invites, in every
 * tournament (issue 183), each with who sent it and "Priimti" / "Atmesti";
 * nothing at all when there are none.
 */
export function InviteList({
  invites,
}: {
  invites: readonly InviteCard[];
}): JSX.Element | null {
  if (invites.length === 0) return null;
  return (
    <div className={`${CARD} mb-4`}>
      <div className={`${CARD_TITLE} mb-3 flex items-center`}>
        <CardIcon name="envelope-fill" />
        Kvietimai
        <span
          data-testid="invite-count"
          className="ml-1 rounded-sm bg-bad px-1.5 py-0.5 text-[0.6rem] text-on-state"
        >
          {invites.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {invites.map((invite) => (
          <div
            key={invite.id}
            data-testid="invite-row"
            className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface-2 p-2"
          >
            <div>
              <span className="font-bold">{invite.leagueName}</span>{' '}
              <span className="text-[0.8rem] text-muted">
                {`pakvietė ${invite.invitedBy}`}
              </span>
            </div>
            <div className="flex gap-2">
              <Answer
                action={LEAGUE_ACCEPT}
                invite={invite.id}
                className={BUTTON_PRIMARY}
              >
                Priimti
              </Answer>
              <Answer
                action={LEAGUE_DECLINE}
                invite={invite.id}
                className="cursor-pointer rounded-full border border-border bg-transparent px-3 py-1 text-[0.85rem] font-semibold text-muted hover:text-text"
              >
                Atmesti
              </Answer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
