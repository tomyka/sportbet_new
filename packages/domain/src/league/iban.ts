/** Unicode white space, as PCRE reads `\s` under the `u` flag. */
const WHITE_SPACE = /\p{White_Space}+/gu;
/** ISO 13616's shape: two letters, two check digits, 11 to 30 more. */
const IBAN_SHAPE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/u;
const LOWER_ASCII = /[a-z]/gu;

/**
 * The form that goes into the database (App\Support\Iban::compact): every
 * white space removed, ASCII letters upper-cased (PHP 8's `strtoupper` leaves
 * every other letter alone).
 */
export function ibanCompact(text: string): string {
  return text
    .replace(WHITE_SPACE, '')
    .replace(LOWER_ASCII, (letter) => letter.toUpperCase());
}

/** Groups of four, as a bank prints one; empty for nothing. */
export function ibanForDisplay(text: string): string {
  const characters = Array.from(ibanCompact(text));
  const groups: string[] = [];
  for (let at = 0; at < characters.length; at += 4) {
    groups.push(characters.slice(at, at + 4).join(''));
  }
  return groups.join(' ');
}

/**
 * ISO 7064 MOD 97-10 (Iban::mod97): the first four characters moved to the
 * end, each letter replaced by its position plus 9, the whole number taken
 * modulo 97 seven digits at a time. A valid IBAN leaves 1.
 */
function mod97(compact: string): number {
  const digits = Array.from(compact.slice(4) + compact.slice(0, 4))
    .map((character) =>
      /^[0-9]$/u.test(character)
        ? character
        : String((character.codePointAt(0) ?? 0) - 55),
    )
    .join('');
  let remainder = 0;
  for (let at = 0; at < digits.length; at += 7) {
    remainder = Number(`${String(remainder)}${digits.slice(at, at + 7)}`) % 97;
  }
  return remainder;
}

/** The shape every IBAN shares plus the checksum (Iban::isValid). */
export function isValidIban(text: string): boolean {
  const compact = ibanCompact(text);
  return IBAN_SHAPE.test(compact) && mod97(compact) === 1;
}
