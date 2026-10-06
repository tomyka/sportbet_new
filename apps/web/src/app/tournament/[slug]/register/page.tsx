import { loadRegistrationForm } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { registerPath } from '../../../../components/shell/shell-paths';
import { RegisterFormView } from '../../../../components/tournament/register-form-view';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { readFlash } from '../../../../server/flash';
import { playerViewer } from '../../../../server/viewer';

/**
 * TournamentController::registerForm, behind sportbet's `auth`: a guest
 * goes to sign in and comes back here (the return path, #16); a player in
 * the tournament is taken in (R-53, through enter's GET); a closed one
 * goes home with "Registracija į šį turnyrą jau pasibaigė." (through
 * register/closed, which leaves the message); else the form.
 */
export default async function TournamentRegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const here = registerPath(slug.data);
  const viewer = await playerViewer();
  if (viewer === null) {
    redirect(`/login?intended=${encodeURIComponent(here)}`);
  }
  const form = await loadRegistrationForm(
    getDb(),
    slug.data,
    viewer,
    now(),
    ruledRules,
  );
  if (form === null) notFound();
  if (form.step === 'member') redirect(`/tournament/${slug.data}/enter`);
  if (form.step === 'closed') redirect(`${here}/closed`);
  const flash = await readFlash();
  return (
    <RegisterFormView
      form={form}
      error={flash?.kind === 'confirm-required' ? flash : null}
    />
  );
}
