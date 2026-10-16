import { PROFILE_PATH } from '../../components/shell/shell-paths';
import { refuseCrossSite } from '../../server/request/route-responses';
import { deleteOwnAccount } from '../../server/profile/delete-account';
import { spoofedMethod } from '../../server/profile/method-override';
import { answerProfilePost } from '../../server/profile/profile-action';
import { profilePorts } from '../../server/profile/profile-worlds';

/** Breeze's `GET /profile`, kept as an alias: a permanent redirect to the profile. */
export function GET(): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: PROFILE_PATH },
  });
}

/**
 * `DELETE /profile` as the danger zone's form sends it: a POST with
 * `_method=DELETE` (Laravel's method spoofing). Any other `_method`, or none,
 * is a 405; `PATCH /profile` is not kept (nothing posts to it). Answered by
 * deleteOwnAccount (server/profile/delete-account.ts).
 */
export async function POST(request: Request): Promise<Response> {
  // Before the body is read for its `_method`: another site's post is turned away unread.
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  if ((await spoofedMethod(request)) !== 'DELETE') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  }
  return answerProfilePost(request, (input) =>
    deleteOwnAccount(input, profilePorts()),
  );
}
