import { saveNotifications } from '../../../server/profile/notifications';
import { answerProfilePost } from '../../../server/profile/profile-action';
import { profilePorts } from '../../../server/profile/profile-worlds';

/**
 * UserProfileController::updateNotifications: the reminder switch, written
 * through setReceiveReminders for the signed-in account only. The unsubscribe
 * pages beneath this path are slice 16's.
 */
export function POST(request: Request): Promise<Response> {
  return answerProfilePost(request, (input) =>
    saveNotifications(input, profilePorts()),
  );
}
