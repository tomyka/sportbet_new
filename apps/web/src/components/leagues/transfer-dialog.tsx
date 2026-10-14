'use client';

import type { JSX } from 'react';
import type { LeagueCard, PlayerId } from '@sportbet/domain';
import { BUTTON_PRIMARY } from '../hub/styles';
import { LEAGUE_TRANSFER } from './league-paths';
import { Modal } from './modal';

type People = NonNullable<LeagueCard['people']>;

/**
 * R-23, R-119: the owner hands the league to another member. A form of its
 * own to `/leagues/transfer`, the members (other than the owner) in a list
 * to pick from, posted as `memberID`; the answer is a message on the league
 * page. sportbet has no hand-over; the texts are the owner's (R-119).
 */
export function TransferDialog({
  league,
  people,
  viewer,
  close,
}: {
  league: { readonly id: number; readonly name: string };
  people: People;
  viewer: PlayerId;
  close: () => void;
}): JSX.Element {
  const others = people.members.filter((member) => member.player !== viewer);
  return (
    <Modal
      open
      close={close}
      title="Perduoti valdymą"
      icon="arrow-left-right"
      narrow
    >
      <p className="mb-2 text-[0.85rem] font-semibold">{league.name}</p>
      <form method="post" action={LEAGUE_TRANSFER}>
        <input type="hidden" name="leagueID" value={String(league.id)} />
        <select
          name="memberID"
          aria-label="Narys"
          className="mb-3 w-full rounded-md border border-border bg-card px-2 py-1 text-[0.85rem] text-text"
        >
          {others.map((member) => (
            <option key={member.player} value={member.player}>
              {`${member.display} (${member.username})`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={others.length === 0}
          className={BUTTON_PRIMARY}
        >
          Perduoti valdymą
        </button>
      </form>
    </Modal>
  );
}
