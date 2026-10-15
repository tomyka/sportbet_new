import type { JSX } from 'react';
import type { AdminMessages } from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { MessagesTable } from './messages-table';
import { TournamentContextNote } from './tournament-context-note';

/**
 * admin/messages.blade.php: "Žinutės" with their count, the tournament whose
 * leagues the messages belong to (R-95), the one-time message, and the table
 * (MessagesTable). Without a chosen tournament there is nothing to write
 * into, so nothing is offered. `canDelete` is the superadmin's alone (R-116).
 */
export function MessagesView({
  data,
  tournament,
  canDelete,
  flash,
}: {
  data: AdminMessages;
  tournament: Tournament | null;
  canDelete: boolean;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="chat-left-text-fill" /> Žinutės
          <span
            data-testid="message-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {data.messages.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament === null ? null : (
        <MessagesTable data={data} canDelete={canDelete} />
      )}
    </div>
  );
}
