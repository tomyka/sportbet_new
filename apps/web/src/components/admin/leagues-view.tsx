import type { JSX } from 'react';
import type { AdminLeagueRow } from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { LeaguesList } from './leagues-list';
import { TournamentContextNote } from './tournament-context-note';

/**
 * admin/leagues.blade.php: "Lygos" with their count, the tournament they are
 * the leagues of (R-95: sportbet listed every tournament's), the one-time
 * message, and the list (LeaguesList).
 */
export function LeaguesView({
  rows,
  tournament,
  flash,
}: {
  rows: readonly AdminLeagueRow[];
  tournament: Tournament | null;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="trophy-fill" /> Lygos
          <span
            data-testid="league-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {rows.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament === null ? null : <LeaguesList rows={rows} />}
    </div>
  );
}
