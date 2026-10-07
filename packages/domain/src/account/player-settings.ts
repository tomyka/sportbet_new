import { defineInvariant } from '../invariant/invariant';
import { defineRangeInvariant } from '../invariant/range-invariant';
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

const ADMIN_LEVEL_MAX = 127;

/**
 * sportbet's `user_settings.admin`, carried as it is: a signed tinyint its
 * admin form fills with 0, 1, 5, 8 or 9 (UserController::updateUser). The
 * CHECK holds the column's non-negative range, so no stored level is
 * refused; the reader maps it to a role (roleOfSportbetLevel, R-26
 * amended).
 */
export const adminLevelInvariant = defineRangeInvariant({
  name: 'admin level',
  min: 0,
  max: ADMIN_LEVEL_MAX,
  accepts: [
    { label: 'a player', value: 0 },
    { label: "sportbet's top level", value: 9 },
    { label: 'the tinyint maximum', value: ADMIN_LEVEL_MAX },
  ],
  refuses: [
    { label: 'negative', value: -1 },
    { label: 'past the tinyint', value: ADMIN_LEVEL_MAX + 1 },
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
