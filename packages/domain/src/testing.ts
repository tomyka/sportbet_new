// Test-only entry point. Never imported by runtime code (web or db); lint
// enforces that (eslint.config.js). The invariants carry their own examples;
// this holds only inputs too many to list, for sweeps on both sides.

/**
 * Every code point from 1 to 0xffff as a one-character string, skipping the
 * UTF-16 surrogate range. Starts at 1: Postgres text cannot hold code point
 * 0 (NUL).
 */
export function everyBmpCharacter(): string[] {
  const characters: string[] = [];
  for (let codePoint = 1; codePoint <= 0xffff; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates
    characters.push(String.fromCharCode(codePoint));
  }
  return characters;
}
