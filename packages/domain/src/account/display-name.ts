/** The name and surname the rail shows a player by. */
export interface PersonName {
  readonly name: string;
  readonly surname: string;
}

/** The first letter (code point) of a text, or '' for an empty one. */
const firstLetter = (text: string) => Array.from(text)[0] ?? '';

/**
 * How the rail names a player (sportbet's partials/rail-account): the name
 * and the surname's first letter, "Jonas P."; the name alone with no
 * surname. By letter, where sportbet's substr took the first byte and
 * drew half a "Ž". The surname itself is never shown.
 */
export function displayName(person: PersonName): string {
  const initial = firstLetter(person.surname);
  return `${person.name} ${initial}${initial === '' ? '' : '.'}`.trim();
}

/** The rail's initials: the first letters of the name and the surname, upper case ("JP"). */
export function displayInitials(person: PersonName): string {
  return `${firstLetter(person.name)}${firstLetter(person.surname)}`.toUpperCase();
}
