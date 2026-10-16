import { requestDeletionCode } from '../../../server/profile/delete-account';
import { answerProfilePost } from '../../../server/profile/profile-action';
import { deletionWorld } from '../../../server/profile/profile-worlds';

/** UserProfileController::requestDeletionCode (#43): the code that authorises a deletion, mailed to the account's own address. */
export function POST(request: Request): Promise<Response> {
  return answerProfilePost(request, (input) =>
    requestDeletionCode(input, deletionWorld()),
  );
}
