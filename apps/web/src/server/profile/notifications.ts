import type { PlayerId, Result } from '@sportbet/domain';
import { formText } from '../request/form-input';
import {
  profileSaid,
  type ProfileAnswer,
  type ProfileRequest,
} from './profile-action';

/** What saving the reminder switch needs of the world: slice 16's one writer of the setting. */
export interface NotificationsWorld {
  readonly setReminders: (
    player: PlayerId,
    on: boolean,
  ) => Promise<Result<void, 'unknown-player'>>;
}

/** What PHP's `$request->boolean()` reads as true. */
const TRUTHY: ReadonlySet<string> = new Set(['1', 'true', 'on', 'yes']);

/**
 * UserProfileController::updateNotifications: the checkbox is the setting,
 * so an absent one is off (`$request->boolean('receive_reminders')`),
 * written only through setReceiveReminders for the session's own account.
 */
export async function saveNotifications(
  { player, form }: ProfileRequest,
  world: NotificationsWorld,
): Promise<ProfileAnswer> {
  const on = TRUTHY.has(formText(form, 'receive_reminders').toLowerCase());
  const saved = await world.setReminders(player.player, on);
  return saved.ok
    ? profileSaid({ kind: 'notifications-saved' })
    : { kind: 'redirect', to: '/', flash: null };
}
