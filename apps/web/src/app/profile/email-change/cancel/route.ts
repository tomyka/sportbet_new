import { cancelAddressChange } from '../../../../server/profile/email-change';
import { answerProfilePost } from '../../../../server/profile/profile-action';
import { profilePorts } from '../../../../server/profile/profile-worlds';

/** UserProfileController::cancelEmailChange: abandons a pending change and keeps the current address. */
export function POST(request: Request): Promise<Response> {
  return answerProfilePost(request, (input) =>
    cancelAddressChange(input, profilePorts()),
  );
}
