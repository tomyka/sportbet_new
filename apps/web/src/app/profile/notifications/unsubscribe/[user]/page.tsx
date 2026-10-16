import type { JSX } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { UnsubscribeConfirm } from '../../../../../components/reminders/unsubscribe-confirm';
import { env } from '../../../../../env';
import { unsubscribeViewOf } from '../../../../../server/reminders/unsubscribe';

/** The address carries a signature: no Referer leaves with it, and no search engine lists it. */
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false },
};

/**
 * UserProfileController::unsubscribe's address
 * (`/profile/notifications/unsubscribe/{user}?signature=...`), public: the
 * signature in a reminder is the authority. It only shows the confirmation
 * (R-98); the button posts to ./confirm, which changes the setting.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  await connection();
  const { user } = await params;
  const { signature } = await searchParams;
  return (
    <UnsubscribeConfirm
      view={unsubscribeViewOf(
        user,
        typeof signature === 'string' ? signature : undefined,
        env().AUTH_SECRET,
      )}
    />
  );
}
