const span = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * What Laravel 12's TrimStrings middleware (Str::trim) strips from either
 * end of every field before sportbet's controllers read it: ASCII
 * whitespace, NUL, and Str::INVISIBLE_CHARACTERS.
 */
const TRIMMED: ReadonlySet<number> = new Set([
  0x00,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x20,
  0xa0,
  0xad,
  0x34f,
  0x61c,
  0x115f,
  0x1160,
  0x17b4,
  0x17b5,
  0x180e,
  ...span(0x2000, 0x200f),
  0x202f,
  0x205f,
  ...span(0x2060, 0x2065),
  ...span(0x206a, 0x206f),
  0x2800,
  0x3000,
  0x3164,
  0xfeff,
  0xffa0,
  0x1d159,
  ...span(0x1d173, 0x1d17a),
  0xe0020,
]);

const isTrimmed = (character: string | undefined) =>
  character !== undefined && TRIMMED.has(character.codePointAt(0) ?? -1);

/** A field as sportbet's controllers saw it: trimmed at both ends, by code point. */
export function trimInput(value: string): string {
  const characters = Array.from(value);
  let start = 0;
  let end = characters.length;
  while (start < end && isTrimmed(characters[start])) start += 1;
  while (end > start && isTrimmed(characters[end - 1])) end -= 1;
  return characters.slice(start, end).join('');
}

/** A form field's text, trimmed; empty for a field that is missing or a file. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? trimInput(value) : '';
}
