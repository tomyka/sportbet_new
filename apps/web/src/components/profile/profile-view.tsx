import type { JSX } from 'react';
import type { Profile } from '@sportbet/db';
import type { Flash } from '../../server/flash';
import { AccountCard } from './account-card';
import { DangerZone } from './danger-zone';
import { NotificationsCard } from './notifications-card';
import { ProfileAlert } from './profile-alert';
import { ProfileHeader } from './profile-header';
import { refusalTexts } from './profile-texts';
import { SignInCard } from './sign-in-card';
import { ThemeCard } from './theme-card';

/** The danger zone starts open after a sent code or a refusal in it (userProfile.blade.php). */
function dangerOpens(flash: Flash | null): boolean {
  return (
    flash?.kind === 'deletion-code-sent' ||
    (flash?.kind === 'code-refused' && flash.bag === 'userDeletion')
  );
}

/**
 * /userProfile (userProfile.blade.php): the one-time message, the header
 * card, the account form beside the sign-in card, the reminders, the theme
 * and the danger zone. sportbet's "Kalba" card is dropped (decision 13).
 */
export function ProfileView({
  profile,
  flash,
}: {
  profile: Profile;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className="mx-auto max-w-[960px]">
      <h1 className="sr-only">Profilis</h1>
      <ProfileAlert flash={flash} />
      <ProfileHeader profile={profile} />
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <AccountCard profile={profile} flash={flash} />
        <SignInCard />
      </div>
      <NotificationsCard receiveReminders={profile.receiveReminders} />
      <ThemeCard />
      <DangerZone
        initiallyOpen={dangerOpens(flash)}
        refusals={refusalTexts(flash, 'userDeletion')}
      />
    </div>
  );
}
