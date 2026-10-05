import { Icon } from './icon';
import { NavLink } from './nav-link';
import { RAIL_LABEL, RAIL_LINK } from './nav-styles';
import type { ShellLinks } from './shell-paths';
import type { ShellPlayer } from './shell-view';
import { SignOut } from './sign-out';

/** .sb-rail-avatar */
function Initials({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[0.6rem] font-bold tracking-[-0.2px] text-on-accent"
    >
      {initials}
    </span>
  );
}

/**
 * The signed-in rail's foot (sportbet's partials/rail-account, issue 135):
 * a labelled "Paskyra" section - the player's own name (a link to the
 * profile once it exists), administration for an admin once it exists,
 * and sign-out, which submits this rail's own hidden form (POST /logout).
 */
export function RailAccount({
  player,
  links,
}: {
  player: ShellPlayer;
  links: ShellLinks;
}) {
  return (
    <div className="mt-auto border-t border-rail-line pt-3">
      <div className={RAIL_LABEL}>Paskyra</div>
      <nav className="flex flex-col">
        {links.profile === null ? (
          <div
            className={`${RAIL_LINK.base} border-transparent tracking-normal text-rail-dim normal-case`}
          >
            <Initials initials={player.initials} />
            <span className="truncate">{player.name}</span>
          </div>
        ) : (
          <NavLink
            href={links.profile}
            styles={RAIL_LINK}
            className="tracking-normal normal-case"
          >
            <Initials initials={player.initials} />
            <span className="sr-only">Profilis:</span>{' '}
            <span className="truncate">{player.name}</span>
          </NavLink>
        )}
        {player.isAdmin && links.admin !== null ? (
          <NavLink
            href={links.admin}
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
