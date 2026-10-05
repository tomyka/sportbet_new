import { Icon } from './icon';
import { NavLink } from './nav-link';
import { RAIL_LABEL, RAIL_LINK } from './nav-styles';
import { ADMIN_PATH, PROFILE_PATH } from './shell-paths';
import type { ShellPlayer } from './shell-view';
import { SignOut } from './sign-out';

/**
 * The signed-in rail's foot (sportbet's partials/rail-account, issue 135):
 * a labelled "Paskyra" section of plain links - the player's own name,
 * administration for an admin, and sign-out, which submits this rail's own
 * hidden form (a POST, served by 4b).
 */
export function RailAccount({ player }: { player: ShellPlayer }) {
  return (
    <div className="mt-auto border-t border-rail-line pt-3">
      <div className={RAIL_LABEL}>Paskyra</div>
      <nav className="flex flex-col">
        <NavLink
          href={PROFILE_PATH}
          styles={RAIL_LINK}
          className="tracking-normal normal-case"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[0.6rem] font-bold tracking-[-0.2px] text-on-accent"
          >
            {player.initials}
          </span>
          <span className="sr-only">Profilis:</span>{' '}
          <span className="truncate">{player.name}</span>
        </NavLink>
        {player.isAdmin ? (
          <NavLink
            href={ADMIN_PATH}
            styles={RAIL_LINK}
            className={RAIL_LINK.caps}
          >
            <Icon name="database-gear" /> Administravimas
          </NavLink>
        ) : null}
        <SignOut
          formId="logout-form-rail"
          className={`${RAIL_LINK.base} ${RAIL_LINK.caps} ${RAIL_LINK.idle} w-full cursor-pointer bg-transparent text-left`}
        />
      </nav>
    </div>
  );
}
