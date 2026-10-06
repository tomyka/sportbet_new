/**
 * The one-time messages sportbet flashes (`->with('info' | 'error', ...)`),
 * by kind: the texts are FlashAlert's (decision 13), the cookie is
 * server/flash.ts's.
 */
export type Flash =
  | { readonly kind: 'registered'; readonly tournament: string }
  | { readonly kind: 'registration-closed' }
  | { readonly kind: 'confirm-required' };
