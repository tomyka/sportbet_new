import { confirmAddressChange } from '../../../../server/profile/email-change';
import { answerProfilePost } from '../../../../server/profile/profile-action';
import { profilePorts } from '../../../../server/profile/profile-worlds';

/** UserProfileController::confirmEmailChange (issue 289, R-24): the code mailed to the new address moves it. */
export function POST(request: Request): Promise<Response> {
  return answerProfilePost(request, (input) =>
    confirmAddressChange(input, profilePorts()),
  );
}
