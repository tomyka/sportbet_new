import type { JSX } from 'react';
import type { Dashboard } from '@sportbet/db';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { MedalsPanel } from '../hub/widgets';
import { ActivityFeed } from './activity-feed';
import { FixtureDeck } from './fixture-deck';
import { gameRowOf } from './game-row';
import { GamesList } from './games-list';
import { LeagueTable } from './league-table';
import { ProgressLine } from './progress-line';
import { StatTiles } from './stat-tiles';

/** The one-time message, the round's progress line and the player's tiles, each when there is one. */
function Heading({
  dashboard,
  flash,
}: {
  dashboard: Dashboard;
  flash: Flash | null;
}): JSX.Element {
  const { progress, me } = dashboard;
  return (
    <>
      {flash === null ? null : <FlashAlert flash={flash} />}
      {progress === null ? null : (
        <ProgressLine
          name={progress.name}
          scored={progress.scored}
          total={progress.total}
          today={progress.today}
        />
      )}
      {me === null ? null : <StatTiles me={me} />}
    </>
  );
}

/** "Finalų dalyvių prognozės" (once someone has picked) beside "Aktyvumas". */
function MedalsAndFeed({
  medals,
  feed,
}: Pick<Dashboard, 'medals' | 'feed'>): JSX.Element {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <div>
        {medals === null || medals.length === 0 ? null : (
          <div data-panel="medals">
            <MedalsPanel medals={medals} variant="league" />
          </div>
        )}
      </div>
      <div>
        <ActivityFeed feed={feed} />
      </div>
    </div>
  );
}

/**
 * main.blade.php: the one-time message, the round's progress line, the
 * player's tiles, "Artimiausios rungtynės", "Taškų lentelė", then "Finalų dalyvių prognozės" (once
 * the first game has tipped off and someone has picked) beside
 * "Aktyvumas", then "Visos rungtynės"; the games only with a current
 * round. The fee panel and league messages are slices 13-14's.
 */
export function DashboardView({
  dashboard,
  flash,
}: {
  dashboard: Dashboard;
  flash: Flash | null;
}): JSX.Element {
  const { me, table, medals, feed } = dashboard;
  const games = dashboard.games?.map(gameRowOf) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Heading dashboard={dashboard} flash={flash} />
      {games === null ? null : <FixtureDeck games={games} />}
      <LeagueTable table={table} me={me?.row.player ?? null} />
      <MedalsAndFeed medals={medals} feed={feed} />
      {games === null ? null : <GamesList games={games} />}
    </div>
  );
}
