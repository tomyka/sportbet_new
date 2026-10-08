import type { JSX } from 'react';
import type { ResultsPage } from '@sportbet/db';
import { groupResultGames } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { dayHeader, vilniusDate } from '../format/vilnius-time';
import { FlashAlert } from '../hub/flash-alert';
import { Icon } from '../shell/icon';
import { ResultRow } from './result-row';

/**
 * admin/results.blade.php: sportbet's flash, then a block per round
 * (.pred-event) whose header opens and shuts it - shut when every game is
 * scored - and its cards side by side from 600px (.pred-event-groups): a
 * knockout round's Vilnius days, any other round's one "Rungtynės"
 * (decision 5); each game's row.
 */
export function ResultsView({
  page,
  flash,
}: {
  page: ResultsPage;
  flash: Flash | null;
}): JSX.Element {
  const names = new Map(page.rounds.map((round) => [round.number, round.name]));
  const groups = groupResultGames(page.games, page.rounds, vilniusDate);
  return (
    <div>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <details key={group.round} open={!group.finished} className="group">
            <summary className="mb-2.5 flex cursor-pointer list-none items-center justify-between border-b-2 border-accent pb-1 text-[0.8rem] font-bold tracking-[1px] text-accent uppercase group-[:not([open])]:mb-0 group-[:not([open])]:border-border">
              <span>{names.get(group.round)}</span>
              <span className="text-[0.75rem] opacity-60 transition-transform group-[:not([open])]:-rotate-90">
                <Icon name="chevron-down" />
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-2.5 min-[600px]:grid-cols-2">
              {group.cards.map((card) => (
                <div
                  key={card.day ?? 'games'}
                  className="rounded-[8px] border border-border bg-card px-3 py-2.5"
                >
                  <div className="mb-[5px] flex items-center justify-between border-b border-border pb-[7px] text-[0.78rem] font-semibold text-muted">
                    {card.day === null ? 'Rungtynės' : dayHeader(card.day)}
                  </div>
                  {card.games.map((game) => (
                    <ResultRow key={game.game} game={game} />
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
