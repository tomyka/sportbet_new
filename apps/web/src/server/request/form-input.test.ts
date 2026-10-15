import { describe, expect, it } from 'vitest';
import { formField, formText, formTexts, trimInput } from './form-input';

function formOf(entries: readonly (readonly [string, string | Blob])[]) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

describe('the posted fields as sportbet read them', () => {
  it('form: a text is trimmed as Laravel trims it, by code point, invisible characters included', () => {
    expect(trimInput('  ​note ﻿\t')).toBe('note');
    expect(formText(formOf([['a', '  x  ']]), 'a')).toBe('x');
  });

  it('form: a missing field or a file is empty text', () => {
    expect(formText(formOf([]), 'a')).toBe('');
    expect(formText(formOf([['a', new Blob(['x'])]]), 'a')).toBe('');
    expect(formTexts(formOf([['a', new Blob(['x'])]]), 'a')).toEqual(['']);
  });

  it('form: a field posted as name[] is a list, never the text of the plain field (issue 281)', () => {
    const form = formOf([
      ['userID', '2'],
      ['userID[]', ' 1 '],
      ['userID[]', '3'],
    ]);
    expect(formField(form, 'userID')).toEqual(['1', '3']);
    expect(formField(formOf([['userID', ' 2 ']]), 'userID')).toBe('2');
    expect(formField(formOf([]), 'userID')).toBe('');
  });
});
