import { escapeHtml } from '../mail/mail-frame';
import type { FixtureClaims } from './google-fixture';

// The fixture Google's consent page, for the tests and CI's E2E only: env
// refuses the fixture where SPORTBET_ENV is staging or production, and the
// route answers 404 unless it is chosen. Nothing here is meant for people, so
// none of it is Lithuanian text (CLAUDE.md: text lives in components - a
// stand-in for somebody else's page is not the app's).

/** The trip this page is for: what the browser was sent with. */
export interface FixtureTrip {
  readonly state: string;
  readonly nonce: string;
  readonly challenge: string;
}

/** A value of the trip's, as the query gave it: a short string, or nothing. */
const MAX = 200;

/** The trip in the query, or null when any part is missing or oversized. */
export function tripOf(query: URLSearchParams): FixtureTrip | null {
  const state = query.get('state');
  const nonce = query.get('nonce');
  const challenge = query.get('challenge');
  if (state === null || nonce === null || challenge === null) return null;
  const fits = [state, nonce, challenge].every(
    (part) => part.length > 0 && part.length <= MAX,
  );
  return fits ? { state, nonce, challenge } : null;
}

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** How the page lets a test say what `email_verified` is: the boolean, a lookalike, or absent. */
const VERIFIED: Readonly<Record<string, unknown>> = {
  true: true,
  false: false,
  'string-true': 'true',
  number: 1,
  missing: undefined,
};

/**
 * The claims the form stands for: the `sub`, the address (absent when
 * empty), `email_verified` as a choice of the real claim's shapes, the name.
 */
export function claimsOf(form: FormData): FixtureClaims {
  const email = text(form, 'email');
  const choice = text(form, 'verified');
  return {
    sub: text(form, 'sub'),
    email: email === '' ? undefined : email,
    emailVerified: Object.hasOwn(VERIFIED, choice) ? VERIFIED[choice] : false,
    name: text(form, 'name') === '' ? undefined : text(form, 'name'),
  };
}

const hidden = (name: string, value: string): string =>
  `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;

const field = (name: string, label: string, value: string): string =>
  `<label>${label} <input name="${name}" value="${escapeHtml(value)}"></label>`;

/** The page: one form that picks the identity, posted back to the same address. */
export function fixturePage(trip: FixtureTrip): string {
  const options = Object.keys(VERIFIED)
    .map((key) => `<option>${key}</option>`)
    .join('');
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fixture Google</title></head><body>',
    '<h1>Fixture Google (tests only)</h1>',
    '<form method="post" action="/auth/google/fixture">',
    hidden('state', trip.state),
    hidden('nonce', trip.nonce),
    hidden('challenge', trip.challenge),
    field('sub', 'sub', '100000000000000000001'),
    field('email', 'email', 'new.person@example.test'),
    `<label>email_verified <select name="verified">${options}</select></label>`,
    field('name', 'name', 'Nauja Zaideja'),
    '<button type="submit">Continue as this person</button>',
    '</form></body></html>',
  ].join('\n');
}
