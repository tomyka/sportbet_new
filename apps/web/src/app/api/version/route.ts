import { appCommit } from '../../../server/app-commit';

export const dynamic = 'force-dynamic';

// The deploy script compares this with the tag it just deployed. Nothing else
// is in the answer.
export function GET(): Response {
  return Response.json(
    { commit: appCommit(process.env['APP_COMMIT']) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
