import type { SignedInPlayer } from '@sportbet/db';
import type { Instant } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { PROFILE_PATH } from '../../components/shell/shell-paths';
import { env } from '../../env';
import { now } from '../clock';
import { writeFlash, type Flash } from '../flash';
import { clientIp } from '../request/client-ip';
import { throttledBody } from '../request/laravel-answers';
import { refuseCrossSite, seeOther } from '../request/route-responses';
import { signedInPlayer } from '../request-context';

/**
 * What a profile POST decided: a real 303 to `to` (the profile, or home
 * after a deletion) with the one-time message, if any, or Laravel's 429 for
 * a throttle that is route middleware in sportbet (the minutes it names).
 */
export type ProfileAnswer =
  | {
      readonly kind: 'redirect';
      readonly to: string;
      readonly flash: Flash | null;
    }
  | { readonly kind: 'throttled'; readonly minutes: number };

/** Back to the profile with `flash`: the answer of almost every handler. */
export const profileSaid = (flash: Flash): ProfileAnswer => ({
  kind: 'redirect',
  to: PROFILE_PATH,
  flash,
});

/** What answering a profile POST needs of the world: the session and the one-time message. */
export interface ProfileWorld {
  readonly signedIn: () => Promise<SignedInPlayer | null>;
  /** Leaves a message for the next page. */
  readonly leaveMessage: (flash: Flash) => Promise<void>;
  readonly now: () => Instant;
}

/** The real session, the real cookie and the real clock. */
const profileWorld: ProfileWorld = {
  signedIn: signedInPlayer,
  leaveMessage: async (flash) => {
    writeFlash(await cookies(), flash, now(), env().AUTH_SECRET);
  },
  now,
};

/** What a profile use case is given: the signed-in player, the posted form, the client's address and the moment. */
export interface ProfileRequest {
  readonly player: SignedInPlayer;
  readonly form: FormData;
  readonly ip: string;
  readonly at: Instant;
}

/**
 * The skeleton of every profile POST: from this site only (#16); a guest
 * goes home (sportbet's `auth`); the body is read as a form (anything else
 * as an empty one); `run` decides; the answer is a real 303 with the
 * one-time message, or Laravel's 429 (its body from laravel-answers.ts,
 * Retry-After in seconds). Every write is the signed-in account's own: the
 * player is the session's, never a posted field.
 */
export async function answerProfilePost(
  request: Request,
  run: (input: ProfileRequest) => Promise<ProfileAnswer>,
  world: ProfileWorld = profileWorld,
): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const player = await world.signedIn();
  if (player === null) return seeOther('/');
  const form = await request.formData().catch(() => new FormData());
  const answer = await run({
    player,
    form,
    ip: clientIp(request.headers),
    at: world.now(),
  });
  if (answer.kind === 'throttled') {
    return Response.json(throttledBody(answer.minutes), {
      status: 429,
      headers: { 'Retry-After': String(answer.minutes * 60) },
    });
  }
  if (answer.flash !== null) await world.leaveMessage(answer.flash);
  return seeOther(answer.to);
}
