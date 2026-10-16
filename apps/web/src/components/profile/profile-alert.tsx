import type { JSX } from 'react';
import type { Flash } from '../../server/flash';
import {
  profileInfoSchema,
  type ProfileInfo,
} from '../../server/profile/profile-messages';
import { Alert } from '../hub/alert';
import { infoText } from './profile-texts';

/** The profile's messages: its info, and its refusals. */
export type ProfileFlash =
  ProfileInfo | Extract<Flash, { kind: 'account-refused' | 'code-refused' }>;

const isProfileInfo = (flash: Flash): flash is ProfileInfo =>
  profileInfoSchema.safeParse(flash).success;

/** Whether a one-time message is the profile's: an info message, or a refusal its page draws in a card. */
export const isProfileFlash = (flash: Flash): flash is ProfileFlash =>
  isProfileInfo(flash) ||
  flash.kind === 'account-refused' ||
  flash.kind === 'code-refused';

/**
 * sportbet's `alert alert-success` (`session('info')`) at the top of the
 * profile: one message, shown once. A refusal is no info - the page draws it
 * in its own card - so it, and no message, draw nothing.
 */
export function ProfileAlert({
  flash,
}: {
  flash: Flash | null;
}): JSX.Element | null {
  if (flash === null || !isProfileInfo(flash)) return null;
  return (
    <Alert tone="ok" icon="check-circle-fill">
      {infoText(flash)}
    </Alert>
  );
}
