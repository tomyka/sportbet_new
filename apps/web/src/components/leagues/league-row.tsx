'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { LeagueCard, PlayerId } from '@sportbet/domain';
import { Icon, type IconName } from '../shell/icon';
import { InviteDialog } from './invite-dialog';
import { EditLeagueDialog } from './league-form-dialog';
import {
  LEAGUE_LEAVE,
  LEAGUE_SWITCH,
  leaguePaymentsPath,
} from './league-paths';
import { TransferDialog } from './transfer-dialog';

const ACTION =
  'inline-grid size-8 cursor-pointer place-items-center rounded-md border border-border bg-transparent p-0 text-[1rem] hover:border-accent hover:text-accent';

/** What a row's buttons open. */
type Opened = 'invite' | 'edit' | 'transfer' | null;

function Action({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: IconName;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`${ACTION} text-muted`}
    >
      <Icon name={icon} />
    </button>
  );
}

/** The name, the owner's or member's badge, the member count and the description. */
function Main({ league }: { league: LeagueCard }): JSX.Element {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{league.name}</span>
        {league.isOwner ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-[0.7rem] font-bold text-accent">
            <Icon name="star-fill" />
            Savininkas
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-bold text-muted">
            Narys
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[0.8rem] text-muted">
          <Icon name="people" />
          {league.memberCount}
        </span>
      </div>
      {league.description === null ? null : (
        <div className="mt-0.5 text-[0.82rem] text-muted">
          {league.description}
        </div>
      )}
    </div>
  );
}

/** "Perjungti į šią lygą": a plain form to `/leagues/switch`. */
function SwitchButton({ league }: { league: LeagueCard }): JSX.Element {
  return (
    <form method="post" action={LEAGUE_SWITCH}>
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button
        type="submit"
        title="Perjungti į šią lygą"
        aria-label="Perjungti į šią lygą"
        className={`${ACTION} text-accent`}
      >
        <Icon name="toggle-off" />
      </button>
    </form>
  );
}

/** "Mokėjimai": the way to the league's payments page (an admin of a private league, R-105). */
function PaymentsLink({ league }: { league: LeagueCard }): JSX.Element {
  return (
    <a
      href={leaguePaymentsPath(league.id)}
      title="Mokėjimai"
      aria-label="Mokėjimai"
      className={`${ACTION} text-accent`}
    >
      <Icon name="cash-coin" />
    </a>
  );
}

/** "Palikti lygą": a plain form to `/leagues/leave`, asked "Palikti lygą <name>?" first. */
function LeaveButton({ league }: { league: LeagueCard }): JSX.Element {
  return (
    <form
      method="post"
      action={LEAGUE_LEAVE}
      onSubmit={(event) => {
        if (!window.confirm(`Palikti lygą ${league.name}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button
        type="submit"
        title="Palikti lygą"
        aria-label="Palikti lygą"
        className={`${ACTION} text-bad`}
      >
        <Icon name="box-arrow-right" />
      </button>
    </form>
  );
}

/** The league's dialog the buttons opened, if any: only an admin's card has the people they list. */
function Dialog({
  league,
  viewer,
  opened,
  close,
}: {
  league: LeagueCard;
  viewer: PlayerId;
  opened: Opened;
  close: () => void;
}): JSX.Element | null {
  if (opened === 'edit')
    return <EditLeagueDialog league={league} close={close} />;
  if (league.people === null) return null;
  if (opened === 'invite') {
    return (
      <InviteDialog league={league} people={league.people} close={close} />
    );
  }
  if (opened === 'transfer') {
    return (
      <TransferDialog
        league={league}
        people={league.people}
        viewer={viewer}
        close={close}
      />
    );
  }
  return null;
}

/**
 * One league of "Mano lygos" (index.blade.php's `.lg-row`): the name and
 * badges, and the buttons the card says the player may use - switch to it,
 * invite, payments (an admin of a private league), edit (and for its owner,
 * hand it over), leave. The selected
 * league's row is marked.
 */
export function LeagueRow({
  league,
  viewer,
}: {
  league: LeagueCard;
  viewer: PlayerId;
}): JSX.Element {
  const [opened, setOpened] = useState<Opened>(null);
  const open = (what: Opened) => () => {
    setOpened(what);
  };
  return (
    <div
      data-testid="league-row"
      data-selected={league.selected}
      className={`mb-2 flex items-center gap-3 rounded-[10px] border p-3 ${league.selected ? 'border-accent bg-accent-tint' : 'border-border bg-surface-2'}`}
    >
      <Main league={league} />
      <div className="flex items-center gap-1.5">
        {league.may.switch ? <SwitchButton league={league} /> : null}
        {league.may.invite ? (
          <Action
            title="Pakviesti narį"
            icon="person-plus"
            onClick={open('invite')}
          />
        ) : null}
        {league.may.payments ? <PaymentsLink league={league} /> : null}
        {league.may.edit ? (
          <Action title="Redaguoti lygą" icon="gear" onClick={open('edit')} />
        ) : null}
        {league.may.delete ? (
          <Action
            title="Perduoti valdymą"
            icon="arrow-left-right"
            onClick={open('transfer')}
          />
        ) : null}
        {league.may.leave ? <LeaveButton league={league} /> : null}
      </div>
      <Dialog
        league={league}
        viewer={viewer}
        opened={opened}
        close={open(null)}
      />
    </div>
  );
}
