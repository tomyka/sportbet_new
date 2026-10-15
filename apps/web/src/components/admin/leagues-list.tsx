'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import type { AdminLeagueRow } from '@sportbet/db';
import type { League } from '@sportbet/domain';
import { vilniusDate } from '../format/vilnius-time';
import { Modal } from '../leagues/modal';
import { Icon } from '../shell/icon';
import {
  ADMIN_LEAGUE_DELETE_PATH,
  ADMIN_LEAGUE_UPDATE_PATH,
  adminLeagueMembersPath,
  adminLeaguePaymentsPath,
} from './admin-paths';
import {
  ACTION_BUTTON,
  DANGER_BUTTON,
  FIELD_INPUT,
  FIELD_LABEL,
  PRIMARY_BUTTON,
} from './admin-styles';
import { ConfirmButton } from './confirm-button';

const QUIET =
  'cursor-pointer rounded-md border border-border bg-transparent px-3 py-1 text-[0.8rem] font-semibold text-muted hover:text-text';

const BADGE =
  'rounded-full border px-2 py-px text-[0.66rem] font-bold tracking-[0.05em] uppercase';

/** "#9 · savininkas (Jonas Petraitis) · 2026-09-30", or "be savininko": which league this is, whose it is and when it started. */
function metaOf(row: AdminLeagueRow): string {
  const { league, owner } = row;
  const whose =
    owner === null
      ? 'be savininko'
      : owner.fullName === ''
        ? owner.username
        : `${owner.username} (${owner.fullName})`;
  const parts = [`#${String(league.id)}`, whose];
  if (league.createdAt !== null) parts.push(vilniusDate(league.createdAt));
  return parts.join(' · ');
}

const feeText = (fee: number | null): string =>
  fee === null ? '' : String(fee);

/** The owner's boxes (sportbet issue 128): name, description and the two fees, filled with the league's own. */
function LeagueFields({ league }: { league: League }): JSX.Element {
  return (
    <div className="grid gap-3">
      <label className={FIELD_LABEL}>
        <span>
          Pavadinimas <span className="text-bad">*</span>
        </span>
        <input
          type="text"
          name="name"
          defaultValue={league.name}
          required
          maxLength={100}
          className={FIELD_INPUT}
        />
      </label>
      <label className={FIELD_LABEL}>
        Aprašymas
        <input
          type="text"
          name="description"
          defaultValue={league.description ?? ''}
          maxLength={500}
          className={FIELD_INPUT}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={FIELD_LABEL}>
          Mokestis
          <input
            type="number"
            name="base_fee"
            defaultValue={feeText(league.fee.base)}
            min={0}
            className={FIELD_INPUT}
          />
        </label>
        <label className={FIELD_LABEL}>
          Baudos žingsnis
          <input
            type="number"
            name="penalty_step"
            defaultValue={feeText(league.fee.penaltyStep)}
            min={0}
            className={FIELD_INPUT}
          />
        </label>
      </div>
    </div>
  );
}

/** The owner's form (sportbet issue 128): name, description and the two fees, filled with the league's own; the public league's carries a warning. */
function EditDialog({
  row,
  close,
}: {
  row: AdminLeagueRow;
  close: () => void;
}): JSX.Element {
  const { league } = row;
  return (
    <Modal open close={close} title={league.name} icon="pencil" narrow>
      <form method="post" action={ADMIN_LEAGUE_UPDATE_PATH}>
        <input type="hidden" name="leagueID" value={String(league.id)} />
        {league.kind.public ? (
          <p
            role="note"
            className="mb-3 rounded-[6px] border border-warn bg-warn-tint px-3 py-2 text-[0.74rem]"
          >
            Tai vieša lyga - pakeitimai matomi visiems žaidėjams.
          </p>
        ) : null}
        <LeagueFields league={league} />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={close} className={QUIET}>
            Atšaukti
          </button>
          <button type="submit" className={PRIMARY_BUTTON}>
            Išsaugoti
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "Redaguoti", "Nariai", "Mokėjimai" and - for a private league - "Ištrinti", which asks first and then for the emailed code (R-118). */
function Actions({
  row,
  edit,
}: {
  row: AdminLeagueRow;
  edit: () => void;
}): JSX.Element {
  const { league } = row;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        title="Redaguoti"
        aria-label="Redaguoti"
        onClick={edit}
        className={ACTION_BUTTON}
      >
        <Icon name="gear" />
      </button>
      <Link
        href={adminLeagueMembersPath(league.id)}
        title="Nariai"
        aria-label="Nariai"
        className={ACTION_BUTTON}
      >
        <Icon name="people" />
      </Link>
      <Link
        href={adminLeaguePaymentsPath(league.id)}
        title="Mokėjimai"
        aria-label="Mokėjimai"
        className={ACTION_BUTTON}
      >
        <Icon name="cash-coin" />
      </Link>
      {league.kind.public ? null : (
        <form
          method="post"
          action={ADMIN_LEAGUE_DELETE_PATH}
          className="inline"
        >
          <input type="hidden" name="leagueID" value={String(league.id)} />
          <ConfirmButton
            question={`Ištrinti lygą "${league.name}"?`}
            title="Ištrinti"
            className={DANGER_BUTTON}
          >
            <Icon name="trash" />
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}

function LeagueRow({
  row,
  edit,
}: {
  row: AdminLeagueRow;
  edit: () => void;
}): JSX.Element {
  const { league } = row;
  return (
    <div
      data-testid="league-row"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
    >
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{league.name}</span>
          {league.kind.public ? (
            <span className={`${BADGE} border-accent text-accent`}>Vieša</span>
          ) : (
            <span className={`${BADGE} border-border text-muted`}>Privati</span>
          )}
          <span className="inline-flex items-center gap-1 text-[0.8rem] text-muted">
            <Icon name="people" />
            {row.memberCount}
          </span>
        </div>
        {league.description === null ? null : (
          <span className="text-[0.8rem] text-muted">{league.description}</span>
        )}
        <span data-testid="league-meta" className="text-[0.8rem] text-muted">
          {metaOf(row)}
        </span>
      </div>
      <Actions row={row} edit={edit} />
    </div>
  );
}

/** The leagues of admin/leagues.blade.php, as the player's own `lg-row`s: a row each, public first then newest. */
export function LeaguesList({
  rows,
}: {
  rows: readonly AdminLeagueRow[];
}): JSX.Element {
  const [editing, setEditing] = useState<AdminLeagueRow | null>(null);
  if (rows.length === 0) {
    return <p className="py-3 text-[0.9rem] text-muted">Nėra lygų</p>;
  }
  return (
    <>
      {rows.map((row) => (
        <LeagueRow
          key={row.league.id}
          row={row}
          edit={() => {
            setEditing(row);
          }}
        />
      ))}
      {editing === null ? null : (
        <EditDialog
          row={editing}
          close={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
