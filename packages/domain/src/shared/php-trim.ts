/** The characters PHP's `trim()` strips by default. */
const PHP_TRIM_CHARACTERS = ' \t\n\r\0\x0B';

/** PHP's `trim($text)`: only those six ASCII characters, from both ends. */
export function phpTrim(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && PHP_TRIM_CHARACTERS.includes(text.charAt(start))) {
    start++;
  }
  while (end > start && PHP_TRIM_CHARACTERS.includes(text.charAt(end - 1))) {
    end--;
  }
  return text.slice(start, end);
}
