import type { SignedInPlayer } from '@sportbet/db';
import type { Role } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { env } from '../../env';
import { now } from '../clock';
import { writeFlash, type Flash } from '../flash';
import { throughDoor } from '../request/door';
import { notFound, seeOther } from '../request/route-responses';
import { adminGate } from './gate';
import type { AdminAnswer } from './admin-answer';

/** What answering an admin POST needs of the world: the gate and the one-time message. */
export interface AdminWorld {
  readonly gate: (
    permission: (role: Role) => boolean,
  ) => Promise<SignedInPlayer | null>;
  /** Leaves a message for the next page. */
  readonly leaveMessage: (flash: Flash) => Promise<void>;
}

/** The real session and the real cookie. */
const adminWorld: AdminWorld = {
  gate: adminGate,
  leaveMessage: async (flash) => {
    writeFlash(await cookies(), flash, now(), env().AUTH_SECRET);
  },
};

/** What an admin action is given: the admin the gate let in and the posted form. */
export interface AdminRequest {
  readonly admin: SignedInPlayer;
  readonly form: FormData;
}

async function respond(
  answer: AdminAnswer,
  world: AdminWorld,
): Promise<Response> {
  if (answer.kind === 'not-found') return notFound();
  if (answer.kind === 'home') return seeOther('/');
  if (answer.flash !== null) await world.leaveMessage(answer.flash);
  return seeOther(answer.to);
}

/**
 * The skeleton of every admin POST: from this site only (#16); only a role
 * `permission` lets through, anyone else goes home (decision 2, adminGate);
 * the body is read as a form (anything else as an empty one); `run`
 * decides, and the answer is a real 303 (with the one-time message, if any), a bare 404 or home. A write
 * that waited past its lock timeout is a 503.
 */
export async function answerAdminPost(
  request: Request,
  permission: (role: Role) => boolean,
  run: (input: AdminRequest) => Promise<AdminAnswer>,
  world: AdminWorld = adminWorld,
): Promise<Response> {
  return throughDoor(request, {
    kind: 'form',
    enter: async () => (await world.gate(permission)) ?? seeOther('/'),
    answer: async (admin, form) => respond(await run({ admin, form }), world),
  });
}
