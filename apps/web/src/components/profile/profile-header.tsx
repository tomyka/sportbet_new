import type { JSX } from 'react';
import type { Profile } from '@sportbet/db';
import { displayInitials, utcDay } from '@sportbet/domain';
import { CARD } from '../hub/styles';
import { Icon } from '../shell/icon';

/** sportbet's `.profile-avatar`: the initials of the name and the surname in a disc. */
function Avatar({ profile }: { profile: Profile }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-[1rem] font-bold text-on-accent"
    >
      {displayInitials(profile)}
    </div>
  );
}

/**
 * The header card of userProfile.blade.php: the avatar, "name surname",
 * "@username - address", an "Admin" badge for any role but a player, and on
 * a wide screen "Narys nuo" with the account's creation day (R-114).
 */
export function ProfileHeader({ profile }: { profile: Profile }): JSX.Element {
  return (
    <div className={`${CARD} mb-4`}>
      <div className="flex items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[1rem] leading-none font-bold">
            {profile.name} {profile.surname}
          </div>
          <div className="text-[0.82rem] break-words text-muted">
            <Icon name="person" /> {profile.username}
            <span className="mx-1 opacity-50">&bull;</span>
            <Icon name="envelope" /> {profile.email}
          </div>
          {profile.role === 'player' ? null : (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[0.7rem] font-semibold text-on-accent">
              <Icon name="shield-check" /> Admin
            </span>
          )}
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-0.5 text-[0.75rem] text-muted md:flex">
          <div>
            <Icon name="calendar3" /> Narys nuo
          </div>
          <div className="font-semibold text-text">
            {utcDay(profile.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
