import type { PlayerId } from '@sportbet/domain';
import { LEAGUES_PATH } from '../../components/shell/shell-paths';
import type { LeagueMessage } from '../flash';
import { validationBody } from '../request/laravel-answers';
import { referringPath } from '../request/referring-path';
import {
  forbidden,
  notFound,
  refuseCrossSite,
  seeOther,
} from '../request/route-responses';
import type { IdField } from './id-field';

/** What answering a league action needs of the world: the session and the one-time message. */
export interface LeagueWorld {
  readonly signedIn: () => Promise<{ readonly player: PlayerId } | null>;
  /** Leaves a message for the next page. */
  readonly leaveMessage: (message: LeagueMessage) => Promise<void>;
}

/** What a league action decided; the skeleton turns it into the response. */
export type LeagueAnswer =
  | {
      readonly kind: 'redirect';
      readonly to: string;
      readonly message: LeagueMessage;
    }
  /** `redirect()->back()`: the page the form came from, else the league page. */
  | { readonly kind: 'back'; readonly message: LeagueMessage }
  | {
      readonly kind: 'invalid';
      readonly body: ReturnType<typeof validationBody>;
    }
  /** An autosave's answer to a JSON request: the body, status 200. */
  | { readonly kind: 'json'; readonly body: unknown }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'forbidden' };

/** Done: to the league page, with the message. */
export const toLeagues = (message: LeagueMessage): LeagueAnswer => ({
  kind: 'redirect',
  to: LEAGUES_PATH,
  message,
});

/** Refused or done, back where the form came from, with the message. */
export const backWith = (message: LeagueMessage): LeagueAnswer => ({
  kind: 'back',
  message,
});

/** The posted id Laravel refused (422) or no row has (404). */
export const idAnswer = (
  field: Exclude<IdField, { readonly kind: 'id' }>,
): LeagueAnswer =>
  field.kind === 'refused'
    ? {
        kind: 'invalid',
        body: validationBody([{ field: field.field, message: field.message }]),
      }
    : { kind: 'not-found' };

/** What a league action is given: the signed-in player and the posted form. */
export interface LeagueRequest {
  readonly player: PlayerId;
  readonly form: FormData;
}

/** What a league action asks of the skeleton beyond the common. */
export interface LeagueActionOptions {
  /** A guest's JSON request is answered 401 (`auth` on an autosave), not sent to sign in. */
  readonly unauthenticatedJson?: boolean;
}

/** Laravel's `expectsJson()` as far as an autosave needs it: the request accepts JSON. */
export const expectsJson = (request: Request): boolean =>
  /\/json|\+json/iu.test(request.headers.get('accept') ?? '');

/** A guest's answer: sign in, or - for an autosave asking JSON - Laravel's 401. */
function guestResponse(
  request: Request,
  options: LeagueActionOptions,
): Response {
  return options.unauthenticatedJson === true && expectsJson(request)
    ? Response.json({ message: 'Unauthenticated.' }, { status: 401 })
    : seeOther('/login');
}

/** What a league action decided, as the response: a real 303 with the message, Laravel's 422 or JSON body, or a bare 404 or 403. */
async function respond(
  answer: LeagueAnswer,
  request: Request,
  world: LeagueWorld,
): Promise<Response> {
  switch (answer.kind) {
    case 'not-found':
      return notFound();
    case 'forbidden':
      return forbidden();
    case 'json':
      return Response.json(answer.body);
    case 'invalid':
      return Response.json(answer.body, { status: 422 });
    case 'back':
      await world.leaveMessage(answer.message);
      return seeOther(referringPath(request) ?? LEAGUES_PATH);
    case 'redirect':
      await world.leaveMessage(answer.message);
      return seeOther(answer.to);
  }
}

/**
 * The skeleton of every league POST (LeagueController): from this site only
 * (#16); a guest goes to sign in; the body is read as a form (anything else
 * as an empty one); `run` decides, and the answer is a real 303 with the
 * one-time message, Laravel's 422 body, or a bare 404 or 403.
 */
export async function answerLeagueAction(
  request: Request,
  world: LeagueWorld,
  run: (input: LeagueRequest) => Promise<LeagueAnswer>,
  options: LeagueActionOptions = {},
): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const signedIn = await world.signedIn();
  if (signedIn === null) return guestResponse(request, options);
  const form = await request.formData().catch(() => new FormData());
  return respond(await run({ player: signedIn.player, form }), request, world);
}
