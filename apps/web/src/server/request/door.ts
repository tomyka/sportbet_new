import { busyResponse, refuseCrossSite } from './route-responses';
import { readForm } from './form-input';
import { busyAnswer, isContended, isLockTimeout } from './save-answers';

/**
 * Who is asking, as far as a lock failure's answer goes: a form post (the
 * admin's and the profile's) is answered in words (busyResponse) for any
 * contention, a lost race of an account deletion included; a fetch (the
 * leagues' autosaves) is answered in JSON for a lock timeout alone, since
 * no league action deletes an account.
 */
export type DoorKind = 'form' | 'fetch';

/** What one area of POSTs adds to the common door: who is let in, and what it answers. */
export interface Door<Entrant extends object> {
  readonly kind: DoorKind;
  /** The one let in, or the response that turns the request away (home, sign-in, 401). */
  readonly enter: () => Promise<Entrant | Response>;
  /** The answer to the entrant's post, the writer's own failures aside. */
  readonly answer: (entrant: Entrant, form: FormData) => Promise<Response>;
}

function busyFor(kind: DoorKind, error: unknown): Response | null {
  if (kind === 'form') return isContended(error) ? busyResponse() : null;
  if (!isLockTimeout(error)) return null;
  const busy = busyAnswer();
  return Response.json(busy.body, { status: busy.status });
}

/**
 * The common skeleton of a POST: from this site only (#16); the area's own
 * `enter` decides who passes; the body is read as a form (anything else as
 * an empty one); the area answers, and a write that waited past its lock
 * timeout is a 503 in the kind's own shape. Any other failure is thrown on.
 */
export async function throughDoor<Entrant extends object>(
  request: Request,
  door: Door<Entrant>,
): Promise<Response> {
  const crossSite = refuseCrossSite(request);
  if (crossSite !== null) return crossSite;
  const entrant = await door.enter();
  if (entrant instanceof Response) return entrant;
  const form = await readForm(request);
  try {
    return await door.answer(entrant, form);
  } catch (error) {
    const busy = busyFor(door.kind, error);
    if (busy !== null) return busy;
    throw error;
  }
}
