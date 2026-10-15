'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { vilniusDateTime } from '../format/vilnius-time';
import { BUTTON_PRIMARY } from '../hub/styles';
import { Icon } from '../shell/icon';
import { ACTION_BUTTON, TABLE, TD, TH } from './admin-styles';
import { GameDialog, type GameDialogTarget } from './game-dialog';
import type { GamesPageData, ListedGame } from './listed-game';

/** One game: its number, Vilnius time, home, "vs", away and round; a double click or its button opens it, unless R-110 froze the tournament. */
function GameRow({
  game,
  open,
}: {
  game: ListedGame;
  open: (() => void) | null;
}): JSX.Element {
  return (
    <tr
      data-testid="game-row"
      data-game={game.id}
      onDoubleClick={open ?? undefined}
    >
      <td className={`${TD} text-muted`}>{game.id}</td>
      <td className={TD}>{vilniusDateTime(game.tipOff)}</td>
      <td className={`${TD} text-right`}>{game.homeName || '-'}</td>
      <td className={`${TD} text-center text-muted`}>vs</td>
      <td className={TD}>{game.awayName || '-'}</td>
      <td className={TD}>{game.roundName}</td>
      <td className={`${TD} text-right`}>
        {open === null ? null : (
          <button
            type="button"
            aria-label={`Redaguoti žaidimą #${String(game.id)}`}
            onClick={open}
            className={ACTION_BUTTON}
          >
            <Icon name="pencil" />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * The games of admin/games.blade.php: a row each, newest id first, which
 * opens the edit modal (sportbet's double click; here a button as well,
 * for a phone), and "Naujas" for the insert modal. R-110: on a finished
 * tournament nothing can be added or changed, so neither is offered.
 */
export function GamesTable({ page }: { page: GamesPageData }): JSX.Element {
  const [target, setTarget] = useState<GameDialogTarget | null>(null);
  return (
    <>
      {page.finished ? null : (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setTarget({ kind: 'new' });
            }}
            className={BUTTON_PRIMARY}
          >
            <Icon name="plus-lg" /> Naujas
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={`${TH} text-muted`}>#</th>
              <th className={TH}>Data / laikas</th>
              <th className={`${TH} text-right`}>Šeimininkai</th>
              <th className={TH} />
              <th className={TH}>Svečiai</th>
              <th className={TH}>Etapas</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {page.games.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                open={
                  page.finished
                    ? null
                    : () => {
                        setTarget({ kind: 'edit', game });
                      }
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {target === null ? null : (
        <GameDialog
          target={target}
          page={page}
          close={() => {
            setTarget(null);
          }}
        />
      )}
    </>
  );
}
