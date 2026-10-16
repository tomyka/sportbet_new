import type { JSX } from 'react';
import type { Flash } from '../../server/flash';
import { Alert } from '../hub/alert';

/** The profile's one-time messages that are sportbet's `session('info')`: each its own text. */
export type ProfileInfo = Extract<
  Flash,
  {
    kind:
      | 'profile-updated'
      | 'email-change-requested'
      | 'email-changed'
      | 'email-change-cancelled'
      | 'deletion-code-sent'
      | 'notifications-saved';
  }
>;

const INFO_KINDS: readonly string[] = [
  'profile-updated',
  'email-change-requested',
  'email-changed',
  'email-change-cancelled',
  'deletion-code-sent',
  'notifications-saved',
];

/** The profile's messages: its info, and its refusals. */
export type ProfileFlash =
  ProfileInfo | Extract<Flash, { kind: 'profile-refused' }>;

const isProfileInfo = (flash: Flash): flash is ProfileInfo =>
  INFO_KINDS.includes(flash.kind);

/** Whether a one-time message is the profile's: an info message, or a refusal its page draws in a card. */
export const isProfileFlash = (flash: Flash): flash is ProfileFlash =>
  isProfileInfo(flash) || flash.kind === 'profile-refused';

function textOf(flash: ProfileInfo): string {
  switch (flash.kind) {
    case 'profile-updated':
      return 'Profilis atnaujintas.';
    case 'email-change-requested':
      return `Patvirtinimo kodas išsiųstas į ${flash.email}. Senasis adresas galioja, kol kodo neįvesite.`;
    case 'email-changed':
      return 'El. paštas pakeistas. Apie pakeitimą pranešėme senuoju adresu.';
    case 'email-change-cancelled':
      return 'El. pašto keitimas atšauktas.';
    case 'deletion-code-sent':
      return 'Patvirtinimo kodas išsiųstas į jūsų el. pašto adresą.';
    case 'notifications-saved':
      return 'Pranešimų nustatymai atnaujinti.';
  }
}

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
      {textOf(flash)}
    </Alert>
  );
}
