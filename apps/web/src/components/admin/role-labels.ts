import type { Role } from '@sportbet/domain';

/**
 * The three roles in words (R-26 amended; decision 13: new texts, sportbet's
 * "User / Editor / Admin / Super" were its four levels): the users page's
 * select and the confirmation's description.
 */
export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  player: 'Žaidėjas',
  'results-manager': 'Rezultatų tvarkytojas',
  superadmin: 'Superadministratorius',
};
