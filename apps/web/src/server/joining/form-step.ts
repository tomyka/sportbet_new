import type { RegistrationForm } from '@sportbet/db';
import { registerPath } from '../../components/shell/shell-paths';
import type { Flash } from '../flash';
import { signInAndReturn } from '../sign-in/guarded-pages';

/**
 * TournamentController::registerForm's step: the form while it is open;
 * else elsewhere - a member taken in (R-53, through enter's GET), a closed
 * one through register/closed, which leaves "Registracija į šį turnyrą
 * jau pasibaigė." and goes home.
 */
export function formOrElsewhere(
  form: RegistrationForm,
  slug: string,
):
  | { readonly form: Extract<RegistrationForm, { step: 'open' }> }
  | { readonly elsewhere: string } {
  if (form.step === 'member') return { elsewhere: `/tournament/${slug}/enter` };
  if (form.step === 'closed') {
    return { elsewhere: `${registerPath(slug)}/closed` };
  }
  return { form };
}

/** The one-time message the form shows: only the unconfirmed submit's (the others are the hub's). */
export function confirmRequiredOf(
  flash: Flash | null,
): Extract<Flash, { kind: 'confirm-required' }> | null {
  return flash?.kind === 'confirm-required' ? flash : null;
}

/** Where a guest's submit goes: to sign in and back to the form, or with no readable slug to sign-in alone. */
export function signInFor(slug: string | null): string {
  return slug === null ? '/login' : signInAndReturn('registerForm', slug);
}
