import type { JSX } from 'react';
import type { HubCard } from '@sportbet/db';
import type { ReactNode } from 'react';
import { CardActionButton } from './card-action';
import { headerLine } from './header-line';
import { CARD } from './styles';
import {
  HowItWorks,
  LeadersPanel,
  MedalsPanel,
  StatsPanel,
  UpcomingGames,
} from './widgets';

/** Bootstrap's `row g-3`: twelve columns, a widget full width below md. */
const ROW = 'grid grid-cols-12 gap-4';

const WHOLE = 'col-span-12';

/** col-md-N. */
const MD = {
  4: 'col-span-12 md:col-span-4',
  5: 'col-span-12 md:col-span-5',
  6: 'col-span-12 md:col-span-6',
  7: 'col-span-12 md:col-span-7',
} as const;

function Column({ span, children }: { span: string; children: ReactNode }) {
  return <div className={span}>{children}</div>;
}

/**
 * One tournament card of the hub: its header, its button, its widgets,
 * each in the column hub.blade.php gives it - which depends on what else
 * the card shows.
 */
export function TournamentCard({ card }: { card: HubCard }): JSX.Element {
  const { tournament, profile, upcomingGames, guestPanels } = card;
  const hasGames = upcomingGames.length > 0;
  return (
    <article data-testid="tournament-card" className={`${CARD} mb-6`}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-[1.15rem] font-bold">{tournament.name}</h3>
          <div className="text-[0.8rem] text-muted">
            {headerLine(profile, tournament.endsOn)}
          </div>
          {profile.description === null ? null : (
            <p className="mt-2 mb-0 text-[0.85rem] text-muted">
              {profile.description}
            </p>
          )}
        </div>
        {card.action === null ? null : (
          <div className="shrink-0">
            <CardActionButton action={card.action} slug={tournament.slug} />
          </div>
        )}
      </div>
      {card.howItWorks ? (
        <div className={ROW}>
          <Column span={hasGames ? MD[7] : WHOLE}>
            <HowItWorks />
          </Column>
          {hasGames ? (
            <Column span={MD[5]}>
              <UpcomingGames games={upcomingGames} />
            </Column>
          ) : null}
        </div>
      ) : null}
      {guestPanels === null ? null : (
        <GuestRow
          panels={guestPanels}
          games={hasGames ? upcomingGames : null}
        />
      )}
    </article>
  );
}

/** A guest's active card: leaders, medals, next games, stats. */
function GuestRow({
  panels,
  games,
}: {
  panels: NonNullable<HubCard['guestPanels']>;
  games: HubCard['upcomingGames'] | null;
}) {
  const hasLeaders = panels.leaders.length > 0;
  const hasMedals = panels.medals.length > 0;
  const both = hasLeaders && hasMedals;
  return (
    <div className={ROW}>
      {hasLeaders ? (
        <Column span={MD[4]}>
          <LeadersPanel leaders={panels.leaders} />
        </Column>
      ) : null}
      {hasMedals ? (
        <Column span={MD[4]}>
          <MedalsPanel medals={panels.medals} />
        </Column>
      ) : null}
      {games === null ? null : (
        <Column span={both ? MD[4] : MD[6]}>
          <UpcomingGames games={games} />
        </Column>
      )}
      <Column span={both && games !== null ? WHOLE : MD[4]}>
        <StatsPanel
          participants={panels.participants}
          predictions={panels.predictions}
        />
      </Column>
    </div>
  );
}
