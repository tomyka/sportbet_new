import { findVisibleTournament, setLastTournament } from '@sportbet/db';
import { isAdmin, ruledRules, slugSchema } from '@sportbet/domain';
import { PLAYER_HOME } from '../../../../components/shell/shell-paths';
import { getDb } from '../../../../server/db';
import { signedInPlayer } from '../../../../server/request-context';
import { isSameOrigin } from '../../../../server/request/same-origin';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });

const notFound = () => new Response(null, { status: 404 });

/**
 * TournamentController::enter: a guest goes to sign in, before the slug
 * is looked at; a tournament the player may not see is not found (R-50);
 * a player in it makes it the one they used last (R-28) and goes to their
 * home; anyone else to its page, with nothing written (sportbet keeps a
 * non-member's pick in the session; here the last-used tournament is
 * stored, and R-46 picks only among the player's own). Leagues
 * (sportbet's leagueID) are slice 12's.
 */
async function enter(param: string): Promise<Response> {
  const signedIn = await signedInPlayer();
  if (signedIn === null) return seeOther('/login');
  const slug = slugSchema.safeParse(param);
  if (!slug.success) return notFound();
  const db = getDb();
  const found = await findVisibleTournament(
    db,
    slug.data,
    { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) },
    ruledRules,
  );
  if (found === null) return notFound();
  if (!found.member) return seeOther(`/tournament/${slug.data}`);
  await setLastTournament(db, signedIn.player, found.tournament.id);
  return seeOther(PLAYER_HOME);
}

/** The card's "Žaisti →", "Prisijungti →" and "Peržiūrėti →": a POST from this site only (#16). */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  return enter((await params).slug);
}

/**
 * R-53: the registration form sends a player already in the tournament
 * here (a page cannot write; the plan's decision 7). It changes only that
 * player's own last-used tournament.
 */
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  return enter((await params).slug);
}
