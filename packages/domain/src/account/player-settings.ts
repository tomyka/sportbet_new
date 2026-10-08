import { defineInvariant } from '../invariant/invariant';
import type { PlayerId } from '../shared/ids';
import type { Role } from './role';

/**
 * sportbet's two locales (LocaleController: `in:lt,en`). Carried with each
 * player and unused: the app is Lithuanian only (decision 13).
 */
export const localeInvariant = defineInvariant({
  name: 'locale',
  pattern: '^(lt|en)$',
  accepts: [
    { label: 'Lithuanian', value: 'lt' },
    { label: 'English', value: 'en' },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'another language', value: 'de' },
    { label: 'a region', value: 'lt-LT' },
  ],
});

/**
 * A player's settings (sportbet's `user_settings`, the columns 4b reads),
 * their role (R-26 amended) and R-28's last-used tournament, which
 * sportbet kept in the session.
 */
export interface StoredPlayerSettings {
  readonly player: PlayerId;
  readonly locale: string;
  readonly role: Role;
  /** R-28: the tournament the player used last, by id; null until they use one. */
  readonly lastTournament: number | null;
}
