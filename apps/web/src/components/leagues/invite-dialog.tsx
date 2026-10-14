'use client';

import type { JSX } from 'react';
import type { LeagueCard } from '@sportbet/domain';
import { LEAGUE_INVITE } from './league-paths';
import { Modal } from './modal';
import { usePlayerSearch, type FoundPlayerView } from './use-player-search';

type People = NonNullable<LeagueCard['people']>;

const SECTION_TITLE =
  'mb-1 text-[0.7rem] font-bold tracking-[0.5px] text-muted uppercase';
const PERSON = 'flex items-baseline gap-2 py-1 text-[0.85rem]';
const HANDLE = 'text-[0.78rem] text-muted';

/** The players the search found, each a button that posts the invite for them (`invitedUserID`), or "Nerasta". */
function Results({
  league,
  found,
}: {
  league: number;
  found: readonly FoundPlayerView[];
}): JSX.Element {
  return (
    <form method="post" action={LEAGUE_INVITE} className="mb-3">
      <input type="hidden" name="leagueID" value={String(league)} />
      {found.length === 0 ? (
        <div className="py-2 text-[0.85rem] text-muted">Nerasta</div>
      ) : (
        found.map((player) => (
          <button
            key={player.id}
            type="submit"
            name="invitedUserID"
            value={player.id}
            className="flex w-full cursor-pointer items-baseline gap-2 rounded-sm border-none bg-transparent px-2 py-1.5 text-left text-[0.85rem] text-text hover:bg-surface-2"
          >
            <span className="font-semibold">{`${player.name} ${player.surname}`}</span>
            <span className={HANDLE}>{player.username}</span>
          </button>
        ))
      )}
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: JSX.Element[];
}): JSX.Element | null {
  if (children.length === 0) return null;
  return (
    <div className="mt-3">
      <div className={SECTION_TITLE}>{title}</div>
      <div className="max-h-40 overflow-y-auto">{children}</div>
    </div>
  );
}

/**
 * sportbet's invite modal (leagues/index.blade.php): the league's name, a
 * search box, the players found (a pick posts the invite), the members with
 * their `Admin` badge and those who have not answered. Only an admin's card
 * has the people; the search is asked of `/leagues/searchUsers`.
 */
export function InviteDialog({
  league,
  people,
  close,
}: {
  league: { readonly id: number; readonly name: string };
  people: People;
  close: () => void;
}): JSX.Element {
  const { query, setQuery, found } = usePlayerSearch(league.id);
  return (
    <Modal open close={close} title="Pakviesti narį" icon="person-plus" narrow>
      <p className="mb-2 text-[0.85rem] font-semibold">{league.name}</p>
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="Ieškoti vartotojo..."
        aria-label="Ieškoti vartotojo..."
        autoComplete="off"
        className="mb-2 w-full rounded-md border border-border bg-card px-2 py-1 text-[0.85rem] text-text"
      />
      {found === null ? null : <Results league={league.id} found={found} />}
      <Section title="Nariai">
        {people.members.map((member) => (
          <div key={member.username} className={PERSON}>
            <span className="font-semibold">{member.display}</span>
            <span className={HANDLE}>{member.username}</span>
            {member.isAdmin ? (
              <span className="rounded-sm bg-accent-tint px-1.5 text-[0.65rem] font-bold text-accent">
                Admin
              </span>
            ) : null}
          </div>
        ))}
      </Section>
      <Section title="Laukiama atsakymo">
        {people.pending.map((invitee) => (
          <div key={invitee.username} className={`${PERSON} text-muted`}>
            <span className="font-semibold">{invitee.display}</span>
            <span className={HANDLE}>{invitee.username}</span>
          </div>
        ))}
      </Section>
    </Modal>
  );
}
