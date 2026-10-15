'use client';

import type { JSX } from 'react';
import type { AdminMessage, AdminMessages } from '@sportbet/db';
import { MESSAGE_TEXT_MAX } from '@sportbet/domain';
import { Icon } from '../shell/icon';
import { MESSAGE_INSERT_PATH, MESSAGES_SAVE_PATH } from './admin-paths';
import {
  ACTION_BUTTON,
  DANGER_BUTTON,
  FIELD_INPUT,
  PRIMARY_BUTTON,
} from './admin-styles';
import { ConfirmButton } from './confirm-button';

/** The columns of a message's row; the header, every row and the insert row share them. */
const GRID =
  'grid min-w-[40rem] grid-cols-[2.5rem_minmax(12rem,1fr)_11rem_4.5rem_6.5rem] items-center gap-2 border-b border-border py-1.5';

const HEADER = 'text-[0.75rem] font-semibold text-muted';

/** The league box: "- lyga -" for none (a message no dashboard shows), then the admin's tournament's leagues (R-95). */
function LeagueSelect({
  leagues,
  chosen,
}: {
  leagues: AdminMessages['leagues'];
  chosen: string;
}): JSX.Element {
  return (
    <select
      name="leagueID"
      aria-label="Lyga"
      defaultValue={chosen}
      className={FIELD_INPUT}
    >
      <option value="">- lyga -</option>
      {leagues.map((league) => (
        <option key={league.id} value={String(league.id)}>
          {league.name}
        </option>
      ))}
    </select>
  );
}

/** The "Aktyvi" switch: posted as `on` when set, as sportbet's `== 'on'` reads it. */
function ActiveSwitch({ checked }: { checked: boolean }): JSX.Element {
  return (
    <input
      type="checkbox"
      role="switch"
      name="active"
      aria-label="Aktyvi"
      defaultChecked={checked}
      className="h-4 w-4 accent-accent"
    />
  );
}

/** "Išsaugoti" and - for a superadmin only (R-116) - "Ištrinti", which asks first and then for the emailed code. */
function RowButtons({ canDelete }: { canDelete: boolean }): JSX.Element {
  return (
    <span role="cell" className="flex justify-end gap-1.5">
      <button
        type="submit"
        name="update"
        value="1"
        title="Išsaugoti"
        aria-label="Išsaugoti"
        className={ACTION_BUTTON}
      >
        <Icon name="check-lg" />
      </button>
      {canDelete ? (
        <ConfirmButton
          question="Ištrinti žinutę?"
          name="delete"
          value="1"
          title="Ištrinti"
          className={DANGER_BUTTON}
        >
          <Icon name="trash" />
        </ConfirmButton>
      ) : null}
    </span>
  );
}

/** One message: its own form, the text, league and switch, "Išsaugoti" and - for a superadmin only (R-116) - "Ištrinti", which asks first and then for the emailed code. */
function MessageRow({
  listed,
  leagues,
  canDelete,
}: {
  listed: AdminMessage;
  leagues: AdminMessages['leagues'];
  canDelete: boolean;
}): JSX.Element {
  const { message } = listed;
  return (
    <form
      method="post"
      action={MESSAGES_SAVE_PATH}
      role="row"
      data-testid="message-row"
      data-message={String(message.id)}
      className={GRID}
    >
      <input type="hidden" name="messageID" value={String(message.id)} />
      <span
        role="cell"
        data-testid="message-id"
        className="text-[0.8rem] text-muted"
      >
        {message.id}
      </span>
      <span role="cell">
        <input
          type="text"
          name="message"
          aria-label={`Žinutė #${String(message.id)}`}
          defaultValue={message.text}
          maxLength={MESSAGE_TEXT_MAX}
          className={FIELD_INPUT}
        />
      </span>
      <span role="cell">
        <LeagueSelect
          leagues={leagues}
          chosen={message.league === null ? '' : String(message.league)}
        />
      </span>
      <span role="cell" className="text-center">
        <ActiveSwitch checked={message.active} />
      </span>
      <RowButtons canDelete={canDelete} />
    </form>
  );
}

/** The insert row: a new message, its league and switch, "Pridėti žinutę". */
function InsertRow({
  leagues,
}: {
  leagues: AdminMessages['leagues'];
}): JSX.Element {
  return (
    <form
      method="post"
      action={MESSAGE_INSERT_PATH}
      role="row"
      data-testid="message-insert"
      className={GRID}
    >
      <span role="cell" className="text-muted">
        <Icon name="plus-lg" />
      </span>
      <span role="cell">
        <input
          type="text"
          name="message"
          aria-label="Nauja žinutė"
          placeholder="Nauja žinutė…"
          maxLength={MESSAGE_TEXT_MAX}
          className={FIELD_INPUT}
        />
      </span>
      <span role="cell">
        <LeagueSelect leagues={leagues} chosen="" />
      </span>
      <span role="cell" className="text-center">
        <ActiveSwitch checked={false} />
      </span>
      <span role="cell" className="flex justify-end">
        <button
          type="submit"
          name="insert"
          value="1"
          title="Pridėti žinutę"
          aria-label="Pridėti žinutę"
          className={PRIMARY_BUTTON}
        >
          <Icon name="plus-lg" />
        </button>
      </span>
    </form>
  );
}

/** The messages of admin/messages.blade.php: a row each by id, then the insert row. */
export function MessagesTable({
  data,
  canDelete,
}: {
  data: AdminMessages;
  canDelete: boolean;
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label="Žinutės" className="min-w-[40rem]">
        <div role="row" className={`${GRID} ${HEADER}`}>
          <span role="columnheader">#</span>
          <span role="columnheader">Žinutė</span>
          <span role="columnheader">Lygos</span>
          <span role="columnheader" className="text-center">
            Aktyvi
          </span>
          <span role="columnheader" />
        </div>
        {data.messages.map((listed) => (
          <MessageRow
            key={listed.message.id}
            listed={listed}
            leagues={data.leagues}
            canDelete={canDelete}
          />
        ))}
        <InsertRow leagues={data.leagues} />
      </div>
    </div>
  );
}
