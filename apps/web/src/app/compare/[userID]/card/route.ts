import { connection } from 'next/server';
import { compareForRequest } from '../../../../server/compare/compare-for-request';

const NO_STORE = { 'Cache-Control': 'no-store' };

const REFUSED = {
  'not-found': 404,
  'no-tournament': 404,
  guest: 401,
  self: 409,
} as const;

/**
 * The compare page's card for the league table's modal (sportbet answered the
 * same URL with `compare/_card` to an XMLHttpRequest): the comparison as JSON,
 * the markup being the components'. It decides as the page does (the answer is
 * shared); where the page redirects, this refuses with a status, and the modal
 * follows the plain link instead. Never cached: it is the viewer's own.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userID: string }> },
): Promise<Response> {
  await connection();
  const { userID } = await params;
  const answer = await compareForRequest(userID);
  if (answer.kind === 'comparison') {
    return Response.json(answer.comparison, { headers: NO_STORE });
  }
  return Response.json(
    { status: answer.kind },
    { status: REFUSED[answer.kind], headers: NO_STORE },
  );
}
