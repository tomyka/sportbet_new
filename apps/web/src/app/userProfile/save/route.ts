import { answerProfilePost } from '../../../server/profile/profile-action';
import { profilePorts } from '../../../server/profile/profile-worlds';
import { updateProfile } from '../../../server/profile/update-profile';

/**
 * UserProfileController::updateUserProfile, at `/userProfile/save` (Next
 * cannot serve a page and a handler at one path, as slice 10's saves):
 * answered by updateProfile (server/profile/update-profile.ts), a real 303
 * back to the profile with the message or the refused fields.
 */
export function POST(request: Request): Promise<Response> {
  return answerProfilePost(request, (input) =>
    updateProfile(input, profilePorts()),
  );
}
