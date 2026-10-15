import type { JSX } from 'react';
import type { Tournament } from '@sportbet/domain';
import { Icon } from '../shell/icon';

/**
 * partials/admin/tournament-context.blade.php (issue 272): which tournament
 * the page below writes into - a statement, not a control (the tournament
 * is chosen on /admin/tournaments with "Dirbti šiame turnyre") - or a
 * warning when there is none.
 */
export function TournamentContextNote({
  tournament,
}: {
  tournament: Tournament | null;
}): JSX.Element {
  return tournament === null ? (
    <div
      role="note"
      className="mb-3 flex items-center gap-2 rounded-[6px] border border-warn bg-warn-tint px-3 py-2 text-[0.83rem] text-text"
    >
      <Icon name="exclamation-circle" />
      <span>
        Nepasirinktas turnyras. Pasirinkite jį ir bandykite dar kartą.
      </span>
    </div>
  ) : (
    <div
      role="note"
      className="mb-3 flex items-center gap-2 rounded-[6px] border border-border bg-surface-2 px-3 py-2 text-[0.83rem] text-text"
    >
      <Icon name="globe2" />
      <span>
        Turnyras: <strong>{tournament.name}</strong>
      </span>
    </div>
  );
}
