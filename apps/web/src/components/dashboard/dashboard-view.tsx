import type { JSX } from 'react';
import type { Dashboard } from '@sportbet/db';
import type { FeePanel as FeePanelView } from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { CARD } from '../hub/styles';
import { MedalsPanel } from '../hub/widgets';
import { ActivityFeed } from './activity-feed';
import { FeePanel } from './fee-panel';
import { FixtureDeck } from './fixture-deck';
import { gameRowOf } from './game-row';
import { GamesList } from './games-list';
import { LeagueMessages } from './league-messages';
import { LeagueTable } from './league-table';
import { ProgressLine } from './progress-line';
import { StatTiles } from './stat-tiles';

/** What the viewer's selected league adds to the page: its fee panel (null: no fee, or no membership) and its active messages. */
export interface DashboardLeague {
  readonly panel: FeePanelView | null;
  readonly messages: readonly string[];
}

/** The league's fee panel and messages in a card, when it has either (R-122: messages with or without a fee). */
function LeagueCard({
  league,
}: {
  league: DashboardLeague;
}): JSX.Element | null {
  const { panel, messages } = league;
  if (panel === null && messages.length === 0) return null;
  return (
    <div className={`${CARD} grid gap-2`} data-panel="league">
      {panel === null ? null : <FeePanel panel={panel} />}
      <LeagueMessages messages={messages} />
    </div>
  );
}

/** The one-time message, the league's fee panel and messages, the round's progress line and the player's tiles, each when there is one. */
function Heading({
  dashboard,
  league,
  flash,
}: {
  dashboard: Dashboard;
  league: DashboardLeague;
  flash: Flash | null;
}): JSX.Element {
  const { progress, me } = dashboard;
  return (
    <>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <LeagueCard league={league} />
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
 * main.blade.php: the one-time message, the league's fee panel and messages
 * (one card), the round's progress line, the player's tiles, "Artimiausios rungtynės", "Taškų lentelė", then "Finalų dalyvių prognozės" (once
 * the first game has tipped off and someone has picked) beside
 * "Aktyvumas", then "Visos rungtynės"; the games only with a current
 * round.
 */
export function DashboardView({
  dashboard,
  league,
  flash,
}: {
  dashboard: Dashboard;
  league: DashboardLeague;
  flash: Flash | null;
}): JSX.Element {
  const { me, table, medals, feed } = dashboard;
  const games = dashboard.games?.map(gameRowOf) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <Heading dashboard={dashboard} league={league} flash={flash} />
      {games === null ? null : <FixtureDeck games={games} />}
      <LeagueTable table={table} me={me?.row.player ?? null} />
      <MedalsAndFeed medals={medals} feed={feed} />
      {games === null ? null : <GamesList games={games} />}
    </div>
  );
}
