'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import type { AuditPageQuery } from '@sportbet/domain';
import { Icon } from '../shell/icon';
import { ADMIN_AUDIT_PATH } from './admin-paths';
import { auditHref } from './audit-links';
import { ACTION_BUTTON, FIELD_INPUT } from './admin-styles';

/**
 * The "- Visi vartotojai -" select of admin/audit.blade.php: a GET form that
 * submits on change (`onchange="this.form.submit()"`), keeping the tab, with
 * a link that clears the filter beside it once one is set.
 */
export function AuditFilter({
  query,
  users,
}: {
  query: AuditPageQuery;
  users: readonly { readonly id: number; readonly username: string }[];
}): JSX.Element {
  return (
    <form
      method="get"
      action={ADMIN_AUDIT_PATH}
      className="m-0 flex items-center gap-2"
    >
      <input type="hidden" name="tab" value={query.tab} />
      <select
        name="user"
        aria-label="Vartotojas"
        defaultValue={query.user === null ? '' : String(query.user)}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
        className={`${FIELD_INPUT} w-auto`}
      >
        <option value="">- Visi vartotojai -</option>
        {users.map((user) => (
          <option key={user.id} value={String(user.id)}>
            {user.username}
          </option>
        ))}
      </select>
      {query.user === null ? null : (
        <Link
          href={auditHref(query, { user: null })}
          title="Visi vartotojai"
          aria-label="Visi vartotojai"
          className={ACTION_BUTTON}
        >
          <Icon name="x-lg" />
        </Link>
      )}
    </form>
  );
}
