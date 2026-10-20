import type { JSX } from 'react';
import { LEAGUE_SWITCH_PATH } from './shell-paths';
import type { ShellLeague, ShellLeagues } from './shell-view';

// Bootstrap 5.0's .dropdown-item as sportbet re-skins it (custom.css
// :265-270), shared by every list of the player's leagues in the shell.
export const ITEM =
  'block w-full px-4 py-1 text-left text-base whitespace-nowrap';
const ITEM_IDLE =
  'cursor-pointer border-none bg-transparent text-text hover:bg-surface-2';
export const ITEM_CURRENT = 'bg-accent text-on-accent';

/** The name of the active league, or "Lyga" when none is (the toggles' label). */
export function activeLeagueName(leagues: ShellLeagues): string {
  return leagues.items.find((league) => league.active)?.name ?? 'Lyga';
}

/** A league other than the active one: a form posting its id to the switch route. */
export function SwitchTo({ league }: { league: ShellLeague }): JSX.Element {
  return (
    <form method="post" action={LEAGUE_SWITCH_PATH}>
      <input type="hidden" name="leagueID" value={String(league.id)} />
      <button type="submit" className={`${ITEM} ${ITEM_IDLE}`}>
        {league.name}
      </button>
    </form>
  );
}
