import { defineInvariant } from '../invariant/invariant';
import type { PlayerId } from '../shared/ids';
import { tournamentNameInvariant } from '../tournament/tournament';
import type { EmailAddress } from '../account/email';
import { ANSWER_MAX_LENGTH } from '../account/person-name';

/**
 * A username holds at least one character that is not whitespace (the
 * tournament name's rule) and at most 255, as sportbet validates it on both
 * registration paths (`required|string|max:255`; Google sign-up takes the
 * email's non-empty local part), so every migrated username is valid.
 */
export const usernameInvariant = defineInvariant({
  name: 'username',
  pattern: tournamentNameInvariant.pattern,
  maxLength: ANSWER_MAX_LENGTH,
  accepts: [
    { label: 'a realistic username', value: 'jonas' },
    { label: 'an email local part', value: 'jonas.k-2' },
    { label: 'a Lithuanian letter', value: 'Jonė' },
    { label: 'the maximum length', value: 'a'.repeat(ANSWER_MAX_LENGTH) },
  ],
  refuses: [
    { label: 'empty', value: '' },
    { label: 'only spaces', value: '   ' },
    { label: 'too long', value: 'a'.repeat(ANSWER_MAX_LENGTH + 1) },
  ],
});

/**
 * A player as stored: the id and the username scoring names them by, and
 * the account sign-in needs (spec 4b) - the address, matched exactly, and
 * the name and surname the rail shows as "Jonas P.".
 */
export interface StoredPlayer {
  readonly id: PlayerId;
  readonly username: string;
  readonly email: EmailAddress;
  readonly name: string;
  readonly surname: string;
}
