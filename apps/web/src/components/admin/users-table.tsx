'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import type { AdminUser } from '@sportbet/db';
import { ROLES, type PlayerId, type Role } from '@sportbet/domain';
import { Icon } from '../shell/icon';
import {
  auditUserPath,
  DELETE_USER_PATH,
  TOGGLE_HIDDEN_PATH,
  UPDATE_USER_PATH,
} from './admin-paths';
import {
  ACTION_BUTTON,
  DANGER_BUTTON,
  FIELD_INPUT,
  TABLE,
  TD,
  TH,
} from './admin-styles';
import { ConfirmButton } from './confirm-button';
import { ROLE_LABEL } from './role-labels';

const BADGE =
  'ml-1.5 rounded-full border border-border px-1.5 py-px text-[0.66rem] font-bold text-muted';

/** The role select: a change posts its form (au-admin-select's `onchange="this.form.submit()"`); your own is disabled, nobody changes their own role (R-26). */
function RoleForm({
  user,
  own,
}: {
  user: AdminUser;
  own: boolean;
}): JSX.Element {
  return (
    <form method="post" action={UPDATE_USER_PATH} className="m-0">
      <input type="hidden" name="userID" value={user.id} />
      <select
        name="admin"
        aria-label={`Rolė: ${user.username}`}
        defaultValue={user.role}
        disabled={own}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
        className={`${FIELD_INPUT} w-auto`}
      >
        {ROLES.map((role: Role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </form>
  );
}

/** The username with its full name, and what hides it from the tables. */
function Who({ user }: { user: AdminUser }): JSX.Element {
  const fullName = `${user.name} ${user.surname}`.trim();
  return (
    <>
      <div className="font-semibold">
        {user.username}
        {user.standing?.adminHidden === true ? (
          <span title="Neaktyvus - paslėptas nuo lentelių" className={BADGE}>
            neaktyvus
          </span>
        ) : null}
        {user.standing?.switchedOff === true ? (
          <span title="Išjungtas dėl praleistų rungtynių" className={BADGE}>
            išjungtas
          </span>
        ) : null}
      </div>
      {fullName === '' ? null : (
        <div className="text-[0.75rem] text-muted">{fullName}</div>
      )}
    </>
  );
}

/** One account's own post: its id in a hidden box, a button that may ask first. */
function UserForm({
  action,
  user,
  question,
  title,
  className,
  children,
}: {
  action: string;
  user: AdminUser;
  question: string | null;
  title: string;
  className: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <form method="post" action={action} className="inline">
      <input type="hidden" name="userID" value={user.id} />
      {question === null ? (
        <button
          type="submit"
          title={title}
          aria-label={title}
          className={className}
        >
          {children}
        </button>
      ) : (
        <ConfirmButton question={question} title={title} className={className}>
          {children}
        </ConfirmButton>
      )}
    </form>
  );
}

/** "Auditas", the hide ("Aktyvuoti / Deaktyvuoti vartotoją", only where the account plays the admin's tournament, R-115) and "Ištrinti" (never your own). */
function Actions({
  user,
  own,
}: {
  user: AdminUser;
  own: boolean;
}): JSX.Element {
  const hidden = user.standing?.adminHidden === true;
  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      <Link
        href={auditUserPath(user.id)}
        title="Auditas"
        aria-label="Auditas"
        className={ACTION_BUTTON}
      >
        <Icon name="clock-history" />
      </Link>
      {user.standing === null ? null : (
        <UserForm
          action={TOGGLE_HIDDEN_PATH}
          user={user}
          question={null}
          title={hidden ? 'Aktyvuoti vartotoją' : 'Deaktyvuoti vartotoją'}
          className={ACTION_BUTTON}
        >
          <Icon name={hidden ? 'eye' : 'eye-slash'} />
        </UserForm>
      )}
      {own ? null : (
        <UserForm
          action={DELETE_USER_PATH}
          user={user}
          question={`Ištrinti ${user.username}?`}
          title="Ištrinti"
          className={DANGER_BUTTON}
        >
          <Icon name="trash" />
        </UserForm>
      )}
    </div>
  );
}

function UserRow({
  user,
  own,
}: {
  user: AdminUser;
  own: boolean;
}): JSX.Element {
  const dimmed = user.standing?.adminHidden === true;
  return (
    <tr data-testid="user-row" className={dimmed ? 'opacity-60' : undefined}>
      <td className={`${TD} text-muted`}>{user.id}</td>
      <td className={TD}>
        <Who user={user} />
      </td>
      <td className={`${TD} hidden text-[0.8rem] md:table-cell`}>
        {user.email}
      </td>
      <td className={TD}>
        <RoleForm user={user} own={own} />
      </td>
      <td className={`${TD} text-right`}>
        <Actions user={user} own={own} />
      </td>
    </tr>
  );
}

/** The accounts of admin/users.blade.php: every account by id, its role select and its actions. */
export function UsersTable({
  users,
  viewer,
}: {
  users: readonly AdminUser[];
  viewer: PlayerId;
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>#</th>
            <th className={TH}>Vartotojas</th>
            <th className={`${TH} hidden md:table-cell`}>El. paštas</th>
            <th className={TH}>Admin</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} own={user.id === viewer} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
