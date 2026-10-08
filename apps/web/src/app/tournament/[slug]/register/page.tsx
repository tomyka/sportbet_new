import type { JSX } from 'react';
import { loadRegistrationForm } from '@sportbet/db';
import { ruledRules, slugSchema } from '@sportbet/domain';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { RegisterFormView } from '../../../../components/tournament/register-form-view';
import { now } from '../../../../server/clock';
import { getDb } from '../../../../server/db';
import { readFlash } from '../../../../server/flash';
import {
  confirmRequiredOf,
  formOrElsewhere,
} from '../../../../server/joining/form-step';
import { signInAndReturn } from '../../../../server/sign-in/guarded-pages';
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
}): Promise<JSX.Element> {
  await connection();
  const slug = slugSchema.safeParse((await params).slug);
  if (!slug.success) notFound();
  const viewer = await playerViewer();
  if (viewer === null) {
    redirect(signInAndReturn('registerForm', slug.data));
  }
  const form = await loadRegistrationForm(getDb(), {
    slug: slug.data,
    viewer,
    now: now(),
    rules: ruledRules,
  });
  if (form === null) notFound();
  const step = formOrElsewhere(form, slug.data);
  if ('elsewhere' in step) redirect(step.elsewhere);
  return (
    <RegisterFormView
      form={step.form}
      error={confirmRequiredOf(await readFlash())}
    />
  );
}
