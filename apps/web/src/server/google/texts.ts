/**
 * Google sign-in's three refusals, sportbet's own words (lang/lt.json), by
 * the flash kind that carries each (GoogleAuthController's `->with('error',
 * ...)`). Error tone, drawn by the shell's alert.
 */
export const GOOGLE_TEXT = {
  'google-failed': 'Google prisijungimas nepavyko. Bandykite dar kartą.',
  'google-unverified': 'Google paskyros el. paštas nepatvirtintas.',
  'google-registration-failed':
    'Registracijos užbaigti nepavyko. Bandykite dar kartą.',
} as const;

export type GoogleFlashKind = keyof typeof GOOGLE_TEXT;
