import {
  findVisibleTournament,
  registerForTournament,
  setLastTournament,
} from '@sportbet/db';
import { isAdmin, ruledRules, slugSchema } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { PLAYER_HOME } from '../../../../../components/shell/shell-paths';
import { env } from '../../../../../env';
import { now } from '../../../../../server/clock';
import { getDb } from '../../../../../server/db';
import { cryptoDice } from '../../../../../server/dice';
import { writeFlash } from '../../../../../server/flash';
import { signedInPlayer } from '../../../../../server/request-context';
import { formText } from '../../../../../server/request/form-input';
import { isSameOrigin } from '../../../../../server/request/same-origin';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } });

/** Laravel's `accepted`: what a ticked box or an agreeing answer sends. */
const ACCEPTED: ReadonlySet<string> = new Set(['1', 'on', 'yes', 'true']);

/**
 * TournamentController::register, from this site only (#16). A guest goes
 * to sign in and back to the form; a tournament the player may not see is
 * not found (R-50); unconfirmed, back to the form with "Patvirtinkite, kad
 * norite dalyvauti šiame turnyre."; a player already in it is taken in
 * whether or not registration has closed (sportbet checks the deadline
 * only for a newcomer); a newcomer joins through registerForTournament
 * (4c: the rows, R-9's fill-ins) or, closed meanwhile, goes home with
 * "Registracija į šį turnyrą jau pasibaigė.". Joined: the tournament is
 * the one they used last (R-28), and home with "Užsiregistravote į
 * turnyrą: {name}".
 */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  if (!isSameOrigin(request.headers)) {
    return new Response(null, { status: 403 });
  }
  const slug = slugSchema.safeParse((await params).slug);
  const signedIn = await signedInPlayer();
  if (signedIn === null) {
    return seeOther(
      slug.success
        ? `/login?intended=${encodeURIComponent(`/tournament/${slug.data}/register`)}`
        : '/login',
    );
  }
  if (!slug.success) return new Response(null, { status: 404 });
  const db = getDb();
  const at = now();
  const found = await findVisibleTournament(
    db,
    slug.data,
    { player: signedIn.player, isAdmin: isAdmin(signedIn.adminLevel) },
    ruledRules,
  );
  if (found === null) return new Response(null, { status: 404 });
  const jar = await cookies();
  const secret = env().AUTH_SECRET;
  const form = await request.formData();
  if (!ACCEPTED.has(formText(form, 'confirm'))) {
    writeFlash(jar, { kind: 'confirm-required' }, at, secret);
    return seeOther(`/tournament/${slug.data}/register`);
  }
  if (!found.member) {
    const joined = await registerForTournament(db, {
      player: signedIn.player,
      tournament: found.tournament,
      rules: ruledRules,
      now: at,
      dice: cryptoDice,
    });
    if (!joined.ok) {
      writeFlash(jar, { kind: 'registration-closed' }, at, secret);
      return seeOther('/');
    }
  }
  await setLastTournament(db, signedIn.player, found.tournament.id);
  writeFlash(
    jar,
    { kind: 'registered', tournament: found.tournament.name },
    at,
    secret,
  );
  return seeOther(PLAYER_HOME);
}
