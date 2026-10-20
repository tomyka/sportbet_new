'use client';

import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import { Icon } from './icon';
import { activeLeagueName, ITEM, ITEM_CURRENT, SwitchTo } from './league-list';
import type { ShellLeagues, ShellTournament } from './shell-view';
import { invitesSentence } from './nav-badge';
import { useMenu } from './use-menu';

const CONTROL =
  'flex w-full items-center gap-2.5 rounded-sm border border-rail-line bg-rail-raised px-2.5 py-2 text-left text-on-rail';
const CONTROL_BUTTON = `${CONTROL} cursor-pointer hover:bg-rail-wash-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;

// Bootstrap 5.0's .badge.bg-danger.ms-1 with sportbet's inline size
// (partials/league-switcher): the pending invites, on the control.
const INVITES =
  'ml-1 inline-block rounded-sm bg-bad px-[5px] py-[2px] text-center align-baseline text-[0.55rem] leading-none font-bold whitespace-nowrap text-on-state';

/** The panel's section label, as sportbet's .sb-rail-card-label. */
const SECTION_LABEL =
  'mb-[3px] block text-[0.62rem] font-bold tracking-[0.14em] text-dim uppercase';

/** The pending invites: the number as drawn, sportbet's sentence for a screen reader. */
function InvitesBadge({ count }: { count: number }): JSX.Element | null {
  if (count === 0) return null;
  return (
    <>
      {' '}
      <span data-invites aria-hidden="true" className={INVITES}>
        {count}
      </span>
      <span className="sr-only">{invitesSentence(count)}</span>
    </>
  );
}

/** What the control says: the tournament over the league, or the league alone. */
function Face({
  tournament,
  leagueName,
  invites,
  interactive,
}: {
  tournament: ShellTournament | null;
  leagueName: string | null;
  invites: number;
  interactive: boolean;
}): JSX.Element {
  const title = tournament === null ? leagueName : tournament.name;
  const subtitle = tournament === null ? null : leagueName;
  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-accent-tint text-[1rem] text-accent">
        <Icon name="trophy" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.82rem] leading-[1.3] font-bold">
          {title}
        </span>
        {subtitle === null ? null : (
          <>
            {' '}
            <span className="block truncate text-[0.72rem] leading-[1.3] text-rail-dim">
              {subtitle}
            </span>
          </>
        )}
      </span>
      <InvitesBadge count={invites} />
      {interactive ? (
        <span className="shrink-0 text-[0.9rem] text-rail-dim">
          <Icon name="chevron-expand" />
        </span>
      ) : null}
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="px-4 py-1.5">
      <span className={SECTION_LABEL}>{label}</span>
      {children}
    </div>
  );
}

/** The tournament's full name, wrapped, and the way out of it (a plain link: a GET that changes the session must never be prefetched). */
function TournamentSection({
  tournament,
  exitHref,
}: {
  tournament: ShellTournament;
  exitHref: string | null;
}): JSX.Element {
  return (
    <Section label="Turnyras">
      <span className="block text-[0.82rem] leading-[1.3] font-bold wrap-anywhere text-text">
        {tournament.name}
      </span>
      {exitHref === null ? null : (
        <a
          href={exitHref}
          className="mt-[7px] inline-flex items-center gap-[5px] rounded-sm text-[0.72rem] font-bold tracking-[0.04em] text-accent no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="arrow-left-right" /> Keisti turnyrą
        </a>
      )}
    </Section>
  );
}

/** Every league in order, the active one ticked where it falls, each other a form posting its id. */
function LeagueSection({ leagues }: { leagues: ShellLeagues }): JSX.Element {
  return (
    <Section label="Lyga">
      <ul className="-mx-4 list-none">
        {leagues.items.map((league) => (
          <li key={league.id}>
            {league.active ? (
              <span aria-current="true" className={`${ITEM} ${ITEM_CURRENT}`}>
                <span className="mr-1">
                  <Icon name="check2" />
                </span>
                {league.name}
              </span>
            ) : (
              <SwitchTo league={league} />
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The panel under the control: its sections, shut with `hidden` so the links work without a script. */
function Panel({
  id,
  open,
  tournament,
  leagues,
  exitHref,
}: {
  id: string;
  open: boolean;
  tournament: ShellTournament | null;
  leagues: ShellLeagues | null;
  exitHref: string | null;
}): JSX.Element {
  return (
    <div
      id={id}
      hidden={!open}
      className="absolute inset-x-0 top-full z-[1000] mt-1 rounded-sm border border-border bg-card py-1.5 text-text shadow-[0_4px_16px_var(--color-shadow)]"
    >
      {tournament === null ? null : (
        <TournamentSection tournament={tournament} exitHref={exitHref} />
      )}
      {tournament !== null && leagues !== null ? (
        <div className="mx-4 my-1 h-px bg-border" />
      ) : null}
      {leagues === null ? null : <LeagueSection leagues={leagues} />}
    </div>
  );
}

/**
 * The one control that says where the player is and changes it, on the
 * rail's top card and the phone menu's: the tournament over the league,
 * with the pending league invites counted on it, opening a panel with a
 * "Turnyras" section (the tournament in full and "Keisti turnyrą", when
 * `exitHref` is set) and a "Lyga" section (every league, the active one
 * ticked). A section with no data is left out, and a tournament alone with
 * no way out is a plain card. Opens on a click; closes on a click outside
 * it or Escape, which returns the focus to the control. The panel is in
 * the page when shut (`hidden`), so the links work without a script.
 */
export function ContextSwitch({
  tournament,
  leagues,
  exitHref,
  invites,
}: {
  tournament: ShellTournament | null;
  leagues: ShellLeagues | null;
  exitHref: string | null;
  invites: number;
}): JSX.Element {
  const { open, toggle, root, trigger } = useMenu();
  const panelId = useId();
  const leagueName = leagues === null ? null : activeLeagueName(leagues);
  const interactive =
    leagues !== null || (tournament !== null && exitHref !== null);
  if (!interactive)
    return (
      <div className={CONTROL}>
        <Face
          tournament={tournament}
          leagueName={leagueName}
          invites={invites}
          interactive={false}
        />
      </div>
    );
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={CONTROL_BUTTON}
      >
        <Face
          tournament={tournament}
          leagueName={leagueName}
          invites={invites}
          interactive
        />
      </button>
      <Panel
        id={panelId}
        open={open}
        tournament={tournament}
        leagues={leagues}
        exitHref={exitHref}
      />
    </div>
  );
}
