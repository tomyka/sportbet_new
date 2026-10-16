import { idFromText, playerId, type PlayerId } from '@sportbet/domain';
import type { UnsubscribeView } from '../../components/reminders/unsubscribe-confirm';
import { seeOther } from '../request/route-responses';
import { signatureOpensFor, unsubscribePaths } from './unsubscribe-link';

/** The player a link names, when its signature opens for them (R-98), else null. */
function playerOfLink(
  user: string,
  signature: string | null | undefined,
  secret: string,
): PlayerId | null {
  const id = idFromText(user);
  if (!id.ok) return null;
  const player = playerId(String(id.value));
  return player.ok && signatureOpensFor(player.value, signature, secret)
    ? player.value
    : null;
}

/**
 * What the unsubscribe page shows: the confirmation for a signature that
 * opens for the player the URL names, else "Nuoroda nebegalioja." (forged,
 * another player's, or one of sportbet's own Laravel signatures). Reads
 * nothing and changes nothing.
 */
export function unsubscribeViewOf(
  user: string,
  signature: string | undefined,
  secret: string,
): UnsubscribeView {
  const player = playerOfLink(user, signature, secret);
  return player === null || signature === undefined
    ? { kind: 'invalid' }
    : {
        kind: 'confirm',
        confirmPath: unsubscribePaths(player, signature).confirmPath,
      };
}

/** What answering the confirm handler needs of the world. */
export interface UnsubscribeWorld {
  /** What signs the links (AUTH_SECRET). */
  readonly secret: string;
  /** The write: the player's setting off. `unknown-player` is an account deleted since the mail went out. */
  readonly turnOff: (
    player: PlayerId,
  ) => Promise<'turned-off' | 'unknown-player'>;
  /** Leaves "Pranešimai išjungti sėkmingai." for the next page. */
  readonly leaveMessage: () => Promise<void>;
}

/** RFC 8058's body: what a mail provider posts to the List-Unsubscribe address. */
const ONE_CLICK = 'List-Unsubscribe=One-Click';

const isOneClick = async (request: Request): Promise<boolean> =>
  (await request.text()).trim() === ONE_CLICK;

/**
 * The confirm handler (R-98): the page's button, and RFC 8058's one-click
 * POST to the same address. The signature is the only authority - it binds
 * the player and the purpose - so a bad one answers a bare 403 with the
 * body unread and nothing changed. The same-origin check (#16) is
 * deliberately not made: a mail provider posts with no Origin, and the
 * signature is a secret an attacker's page does not have, so there is no
 * request to forge. Only `receive_reminders` of the signed player changes,
 * and turning off what is off (or an account that is gone) succeeds the
 * same way, so nothing says which accounts exist. The one-click body
 * answers 200; the button's, a real 303 home with sportbet's message.
 */
export async function answerUnsubscribe(
  request: Request,
  user: string,
  world: UnsubscribeWorld,
): Promise<Response> {
  const signature = new URL(request.url).searchParams.get('signature');
  const player = playerOfLink(user, signature, world.secret);
  if (player === null) return new Response(null, { status: 403 });
  const oneClick = await isOneClick(request);
  await world.turnOff(player);
  if (oneClick) return new Response(null, { status: 200 });
  await world.leaveMessage();
  return seeOther('/');
}
