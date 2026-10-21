import { env } from '../../../../env';
import { googleEnv } from '../../../../google-env';
import { now } from '../../../../server/clock';
import {
  claimsOf,
  fixturePage,
  tripOf,
} from '../../../../server/google/fixture-page';
import { fixtureCode } from '../../../../server/google/google-fixture';
import { readForm } from '../../../../server/request/form-input';
import { notFound, seeOther } from '../../../../server/request/route-responses';

export const dynamic = 'force-dynamic';

/** The fixture is on only when GOOGLE_PROVIDER says so, which env refuses where deployed: else this route does not exist. */
const fixtureChosen = (): boolean => googleEnv()?.provider === 'fixture';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The fixture Google's consent page (tests and CI's E2E only): the form that picks an identity. */
export function GET(request: Request): Response {
  if (!fixtureChosen()) return notFound();
  const trip = tripOf(new URL(request.url).searchParams);
  if (trip === null) return new Response(null, { status: 400 });
  return new Response(fixturePage(trip), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE },
  });
}

/** The pick: a code for the identity, bound to the trip, and the browser sent back to the callback as Google would. */
export async function POST(request: Request): Promise<Response> {
  if (!fixtureChosen()) return notFound();
  const form = await readForm(request);
  const trip = tripOf(
    new URLSearchParams(
      ['state', 'nonce', 'challenge'].map((name) => {
        const value = form.get(name);
        return [name, typeof value === 'string' ? value : ''];
      }),
    ),
  );
  if (trip === null) return new Response(null, { status: 400 });
  const code = fixtureCode(
    { claims: claimsOf(form), challenge: trip.challenge, nonce: trip.nonce },
    env().AUTH_SECRET,
    now(),
  );
  const back = new URLSearchParams({ code, state: trip.state });
  const response = seeOther(`/auth/google/callback?${back.toString()}`);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
