import type { JSX } from 'react';
import type { AdminGamesPage } from '@sportbet/db';
import type { Tournament } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { TITLE_ROW } from './admin-styles';
import { GamesTable } from './games-table';
import { listedGame } from './listed-game';
import { TournamentContextNote } from './tournament-context-note';

/**
 * admin/games.blade.php: "Žaidimai" with their count, the tournament they
 * are the games of, the one-time message, and the table (GamesTable).
 * R-110: a finished tournament says so, and offers nothing to change.
 */
export function GamesView({
  tournament,
  page,
  flash,
}: {
  tournament: Tournament | null;
  page: AdminGamesPage;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="sports-basketball" /> Žaidimai
          <span
            data-testid="game-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {page.games.length}
          </span>
        </h1>
      </div>
      <TournamentContextNote tournament={tournament} />
      {flash === null ? null : <FlashAlert flash={flash} />}
      {tournament !== null && page.finished ? (
        <p role="note" className="mb-3 text-[0.83rem] text-muted">
          Turnyras baigtas - keisti negalima.
        </p>
      ) : null}
      {tournament === null ? null : (
        <GamesTable page={{ ...page, games: page.games.map(listedGame) }} />
      )}
    </div>
  );
}
