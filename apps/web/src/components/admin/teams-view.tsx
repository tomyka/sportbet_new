import type { JSX } from 'react';
import type { AdminTeamsPage } from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { TeamInsertForm } from './team-insert-view';
import { TeamsTable, type TeamsMay } from './teams-table';
import { TournamentContextNote } from './tournament-context-note';

/**
 * admin/teams.blade.php: "Komandos" with their count, the tournament they
 * belong to, the one-time message and the facts form (TeamsTable). With no
 * team the page is the insert form (a superadmin's, as sportbet's), and a
 * results manager is told there are none yet.
 */
export function TeamsView({
  tournament,
  page,
  may,
  flash,
}: {
  tournament: Tournament | null;
  page: AdminTeamsPage;
  may: TeamsMay;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="people" /> Komandos
          <span
            data-testid="team-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {page.teams.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      <Body tournament={tournament} page={page} may={may} />
    </div>
  );
}

function Body({
  tournament,
  page,
  may,
}: {
  tournament: Tournament | null;
  page: AdminTeamsPage;
  may: TeamsMay;
}): JSX.Element | null {
  if (tournament === null) return null;
  if (page.teams.length > 0) return <TeamsTable page={page} may={may} />;
  return may.rename ? (
    <TeamInsertForm />
  ) : (
    <p className="text-[0.85rem] text-muted">Šiame turnyre komandų dar nėra.</p>
  );
}
