import { SLUG_MAX_LENGTH } from './tournament';

/**
 * Tricky inputs shared between the domain schema tests
 * (`tournament.test.ts`) and the database CHECK constraint tests
 * (`packages/db/test/schema.test.ts`), so the two suites exercise the exact
 * same edge cases and cannot drift apart. Exported for tests only, through
 * the separate `@sportbet/domain/testing` entry point - never the runtime
 * index.
 */
export interface LabeledInput {
  readonly label: string;
  readonly value: string;
}

export const INVALID_SLUGS: readonly LabeledInput[] = [
  { label: 'empty', value: '' },
  { label: 'too long', value: 'a'.repeat(SLUG_MAX_LENGTH + 1) },
  { label: 'uppercase', value: 'Euro-2028' },
  { label: 'a space', value: 'euro 2028' },
  { label: 'an underscore', value: 'euro_2028' },
  { label: 'a slash', value: 'euro/2028' },
];

export const VALID_SLUGS: readonly LabeledInput[] = [
  { label: 'a single character', value: 'a' },
  { label: 'a realistic slug', value: 'euro-2028' },
  { label: 'hyphenated numbers', value: 'euroleague-2026-27' },
  { label: 'the maximum length', value: 'a'.repeat(SLUG_MAX_LENGTH) },
];

export const BLANK_NAMES: readonly LabeledInput[] = [
  { label: 'spaces', value: '   ' },
  { label: 'no-break spaces', value: '  ' },
  { label: 'a byte-order mark', value: '﻿' },
];

/**
 * Every code point from 1 to 0xffff, skipping the UTF-16 surrogate range,
 * that JavaScript's `\s` treats as whitespace. Starts at 1: Postgres text
 * cannot hold code point 0 (NUL). The canonical list both the domain schema
 * test and the database CHECK test compare their own "blank" definition
 * against, so a mismatch in either cannot go unnoticed.
 */
export function jsWhitespaceCodePoints(): number[] {
  const points: number[] = [];
  for (let codePoint = 1; codePoint <= 0xffff; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue; // surrogates
    if (/^\s$/.test(String.fromCharCode(codePoint))) points.push(codePoint);
  }
  return points;
}
