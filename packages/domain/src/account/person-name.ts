import { defineInvariant } from '../invariant/invariant';

/**
 * sportbet's `max:255` on a username, a name and a surname (each a
 * varchar(255)), counted in characters as PHP's mb_strlen counts them: the
 * one limit registration checks and the stored rows hold.
 */
export const ANSWER_MAX_LENGTH = 255;

/**
 * A player's name or surname: at most 255 characters, possibly empty.
 * sportbet asks for a name on its form, but stores an empty one when
 * Google gives none, and an empty surname for every Google sign-up and
 * every form that leaves it blank (GoogleAuthController,
 * RegisteredUserController), so only the length is held.
 */
export const personNameInvariant = defineInvariant({
  name: 'person name',
  pattern: '^',
  maxLength: ANSWER_MAX_LENGTH,
  accepts: [
    { label: 'a first name', value: 'Jonas' },
    { label: 'a Lithuanian name', value: 'Žilvinas' },
    { label: 'empty, as a Google sign-up stores a missing surname', value: '' },
    { label: 'the maximum length', value: 'a'.repeat(ANSWER_MAX_LENGTH) },
  ],
  refuses: [{ label: 'too long', value: 'a'.repeat(ANSWER_MAX_LENGTH + 1) }],
});
