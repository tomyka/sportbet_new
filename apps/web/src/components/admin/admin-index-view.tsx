import type { JSX } from 'react';
import Link from 'next/link';
import {
  isSuperadmin,
  mayEditMessages,
  mayEnterStandingsFacts,
  type Role,
} from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import {
  ADMIN_AUDIT_PATH,
  ADMIN_EVENTS_PATH,
  ADMIN_GAMES_PATH,
  ADMIN_IMPORT_PATH,
  ADMIN_LEAGUES_PATH,
  ADMIN_MESSAGES_PATH,
  ADMIN_TEAMS_PATH,
  ADMIN_TOURNAMENTS_PATH,
  ADMIN_USERS_PATH,
} from './admin-paths';
import {
  ADMIN_RESULTS_ALL_PATH,
  ADMIN_RESULTS_PATH,
  RECALCULATE_PATH,
} from '../shell/shell-paths';
import { Icon, type IconName } from '../shell/icon';
import { CardIcon } from '../hub/card-icon';
import { CARD_TITLE } from '../hub/styles';
import { ConfirmForm } from './confirm-form';

/** .admin-tile: a card-sized link or button, its icon in accent over its label. */
const TILE =
  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-5 text-text no-underline transition hover:-translate-y-0.5 hover:text-accent hover:shadow-[0_4px_16px_var(--color-shadow)]';

function TileBody({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <span className="text-[1.8rem] text-accent">
        <Icon name={icon} />
      </span>
      <span className="text-center text-[0.78rem] font-semibold">{label}</span>
    </>
  );
}

/** "Turnyrai", "Turai" and "Žaidimai": a superadmin's (slice 13), and slice 15's "Tvarkaraščio importas". */
function StructureTiles({ role }: { role: Role }): JSX.Element | null {
  if (!isSuperadmin(role)) return null;
  return (
    <>
      <Link href={ADMIN_TOURNAMENTS_PATH} className={TILE}>
        <TileBody icon="globe2" label="Turnyrai" />
      </Link>
      <Link href={ADMIN_EVENTS_PATH} className={TILE}>
        <TileBody icon="calendar3" label="Turai" />
      </Link>
      <Link href={ADMIN_GAMES_PATH} className={TILE}>
        <TileBody icon="sports-basketball" label="Žaidimai" />
      </Link>
      <Link href={ADMIN_IMPORT_PATH} className={TILE}>
        <TileBody icon="cloud-download-fill" label="Tvarkaraščio importas" />
      </Link>
    </>
  );
}

/** Slice 14's tiles: "Vartotojai", "Lygos" and "Auditas" to a superadmin, "Žinutės" to whoever may edit messages (R-116). */
function PeopleTiles({ role }: { role: Role }): JSX.Element {
  const superadmin = isSuperadmin(role);
  return (
    <>
      {superadmin ? (
        <>
          <Link href={ADMIN_USERS_PATH} className={TILE}>
            <TileBody icon="people" label="Vartotojai" />
          </Link>
          <Link href={ADMIN_LEAGUES_PATH} className={TILE}>
            <TileBody icon="trophy-fill" label="Lygos" />
          </Link>
        </>
      ) : null}
      {mayEditMessages(role) ? (
        <Link href={ADMIN_MESSAGES_PATH} className={TILE}>
          <TileBody icon="chat-left-text-fill" label="Žinutės" />
        </Link>
      ) : null}
      {superadmin ? (
        <Link href={ADMIN_AUDIT_PATH} className={TILE}>
          <TileBody icon="clock-history" label="Auditas" />
        </Link>
      ) : null}
    </>
  );
}

/**
 * admin/index.blade.php: "Admin skydelis", the one-time message
 * ("Turnyro kontekstas: ..." after "Dirbti šiame turnyre") and the tiles of
 * the pages this app serves, each shown to the role whose permission opens
 * its page (R-26 amended): the results pages and "Perskaičiuoti taškus"
 * (a POST that asks first, issue 269) to every admin; "Turnyrai", "Turai"
 * "Žaidimai" and "Tvarkaraščio importas" (slice 15) to a superadmin; "Komandos" (the standings facts) to
 * whoever may enter them; and slice 14's people tiles: "Vartotojai", "Lygos"
 * and "Auditas" to a superadmin, "Žinutės" to whoever may edit messages
 * (R-116). "Eigos taškai" is gone (R-65); the other tiles come with their
 * slices.
 */
export function AdminIndexView({
  role,
  flash,
}: {
  role: Role;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
      <h1 className={`col-span-full ${CARD_TITLE}`}>
        <CardIcon name="gear-fill" /> Admin skydelis
      </h1>
      {flash === null ? null : (
        <div className="col-span-full">
          <FlashAlert flash={flash} />
        </div>
      )}
      <Link href={ADMIN_RESULTS_PATH} className={TILE}>
        <TileBody icon="trophy" label="Rezultatai (turas)" />
      </Link>
      <Link href={ADMIN_RESULTS_ALL_PATH} className={TILE}>
        <TileBody icon="trophy-fill" label="Visi rezultatai" />
      </Link>
      <StructureTiles role={role} />
      <PeopleTiles role={role} />
      {mayEnterStandingsFacts(role) ? (
        <Link href={ADMIN_TEAMS_PATH} className={TILE}>
          <TileBody icon="people" label="Komandos" />
        </Link>
      ) : null}
      <ConfirmForm
        action={RECALCULATE_PATH}
        question="Perskaičiuoti visų rungtynių taškus? Tai gali užtrukti."
      >
        <button type="submit" className={TILE}>
          <TileBody icon="arrow-repeat" label="Perskaičiuoti taškus" />
        </button>
      </ConfirmForm>
    </div>
  );
}
