import { ruledRules, slugSchema } from '@sportbet/domain';
import { cookies } from 'next/headers';
import { registerPath } from '../../../../../components/shell/shell-paths';
import { env } from '../../../../../env';
import { now } from '../../../../../server/clock';
import { getDb } from '../../../../../server/db';
import { cryptoDice } from '../../../../../server/dice';
import { writeFlash } from '../../../../../server/flash';
import { joinFromForm } from '../../../../../server/joining/join-from-form';
import { formText } from '../../../../../server/request/form-input';
import {
  notFound,
  refuseCrossSite,
  seeOther,
} from '../../../../../server/request/route-responses';
import { playerViewer } from '../../../../../server/viewer';

interface Context {
  readonly params: Promise<{ slug: string }>;
}

/**
 * TournamentController::register, from this site only (#16): a guest goes
 * to sign in and back to the form; anyone else's submit is joinFromForm's
 * (server/joining/join-from-form.ts), answered with its one-time message
 * and a 303 to its page, or a 404.
 */
export async function POST(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const refused = refuseCrossSite(request);
  if (refused !== null) return refused;
  const slug = slugSchema.safeParse((await params).slug);
  const viewer = await playerViewer();
  if (viewer === null) {
    return seeOther(
      slug.success
        ? `/login?intended=${encodeURIComponent(registerPath(slug.data))}`
        : '/login',
    );
  }
  if (!slug.success) return notFound();
  const at = now();
  const outcome = await joinFromForm(getDb(), {
    viewer,
    slug: slug.data,
    confirm: formText(await request.formData(), 'confirm'),
    now: at,
    rules: ruledRules,
    dice: cryptoDice,
  });
  if (outcome.kind === 'not-found') return notFound();
  writeFlash(await cookies(), outcome.flash, at, env().AUTH_SECRET);
  return seeOther(outcome.location);
}
