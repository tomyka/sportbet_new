import type { JSX } from 'react';
import type { AdminUser } from '@sportbet/db';
import type { PlayerId, Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { TournamentContextNote } from './tournament-context-note';
import { UsersTable } from './users-table';

/**
 * admin/users.blade.php: "Vartotojai" with their count, the tournament the
 * hide is for (R-115: sportbet hid everywhere; here it is the admin's
 * tournament), the one-time message, and the table (UsersTable).
 */
export function UsersView({
  users,
  viewer,
  tournament,
  flash,
}: {
  users: readonly AdminUser[];
  viewer: PlayerId;
  tournament: Tournament | null;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="people" /> Vartotojai
          <span
            data-testid="user-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {users.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      <UsersTable users={users} viewer={viewer} />
    </div>
  );
}
