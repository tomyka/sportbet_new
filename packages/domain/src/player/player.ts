import { defineInvariant } from '../invariant/invariant';
import type { PlayerId } from '../shared/ids';
import { tournamentNameInvariant } from '../tournament/tournament';

const USERNAME_MAX_LENGTH = 255;

/**
 * A username holds at least one character that is not whitespace (the
 * tournament name's rule) and at most 255, as sportbet validates it on both
 * registration paths (`required|string|max:255`; Google sign-up takes the
 * email's non-empty local part), so every migrated username is valid.
 */
export const usernameInvariant = defineInvariant({
  name: 'username',
  pattern: tournamentNameInvariant.pattern,
  maxLength: USERNAME_MAX_LENGTH,
  accepts: [
    { label: 'a realistic username', value: 'jonas' },
    { label: 'an email local part', value: 'jonas.k-2' },
    { label: 'a Lithuanian letter', value: 'Jonė' },
    { label: 'the maximum length', value: 'a'.repeat(USERNAME_MAX_LENGTH) },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'only spaces', value: '   ' },
    { label: 'too long', value: 'a'.repeat(USERNAME_MAX_LENGTH + 1) },
  ],
});

/**
 * A player as 2.2 stores one: the id and the username, nothing else - no
 * name, email or sign-in detail (spec 2.2, where production data may go).
 */
export interface StoredPlayer {
  readonly id: PlayerId;
  readonly username: string;
}
