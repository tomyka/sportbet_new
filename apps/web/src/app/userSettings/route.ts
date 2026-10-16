import { PROFILE_PATH } from '../../components/shell/shell-paths';

/** `/userSettings`: sportbet's deprecated address, kept for bookmarks - a permanent redirect to the profile. */
export function GET(): Response {
  return new Response(null, {
    status: 308,
    headers: { Location: PROFILE_PATH },
  });
}
