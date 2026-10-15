import type { DetailsFieldError } from '@sportbet/domain';
import {
  readDetailsForm,
  readPaymentsForm,
  refusedDetails,
} from './payments-field';
import { describe, expect, it } from 'vitest';

// UpdateLeaguePaymentsRequest's `paid` map and UpdateLeaguePaymentDetailsRequest's
// three boxes, read from a posted form.

function formOf(entries: readonly (readonly [string, string])[]): FormData {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

describe('readPaymentsForm', () => {
  it('reads paid[12]=10,5 as member 12 and 1050 cents', () => {
    const read = readPaymentsForm(formOf([['paid[12]', '10,5']]));
    expect(read).toEqual({ ok: true, entry: new Map([[12, 1050]]) });
  });

  it('a key that is no id reads as member 0, which no league has', () => {
    const read = readPaymentsForm(formOf([['paid[abc]', '5']]));
    expect(read).toEqual({ ok: true, entry: new Map([[0, 500]]) });
  });

  it('a blank box is unpaid', () => {
    const read = readPaymentsForm(formOf([['paid[3]', '']]));
    expect(read).toEqual({ ok: true, entry: new Map([[3, null]]) });
  });

  it('the last of a repeated key wins', () => {
    const read = readPaymentsForm(
      formOf([
        ['paid[3]', '1'],
        ['paid[3]', '2'],
      ]),
    );
    expect(read).toEqual({ ok: true, entry: new Map([[3, 200]]) });
  });

  it('a nested paid[a][b] is no number', () => {
    const read = readPaymentsForm(formOf([['paid[7][x]', '5']]));
    expect(read).toEqual({
      ok: false,
      body: {
        message: 'The paid.7 field must be a number. (and 1 more error)',
        errors: {
          'paid.7': [
            'The paid.7 field must be a number.',
            'The paid.7 field must have 0-2 decimal places.',
          ],
        },
      },
    });
  });

  it('lists every failed rule of every row, with (and N more errors) in the summary', () => {
    const read = readPaymentsForm(
      formOf([
        ['paid[1]', '-5'],
        ['paid[2]', 'dvidešimt'],
      ]),
    );
    expect(read).toEqual({
      ok: false,
      body: {
        message: 'The paid.1 field must be at least 0. (and 2 more errors)',
        errors: {
          'paid.1': ['The paid.1 field must be at least 0.'],
          'paid.2': [
            'The paid.2 field must be a number.',
            'The paid.2 field must have 0-2 decimal places.',
          ],
        },
      },
    });
  });

  it('a post with no paid field is "The paid field is required."', () => {
    const read = readPaymentsForm(formOf([['other', '1']]));
    expect(read).toEqual({
      ok: false,
      body: {
        message: 'The paid field is required.',
        errors: { paid: ['The paid field is required.'] },
      },
    });
  });

  it('a bare paid=5 is not an array', () => {
    const read = readPaymentsForm(formOf([['paid', '5']]));
    expect(read).toEqual({
      ok: false,
      body: {
        message: 'The paid field must be an array.',
        errors: { paid: ['The paid field must be an array.'] },
      },
    });
  });
});

describe('readDetailsForm', () => {
  it('reads the three boxes, the IBAN compacted', () => {
    const read = readDetailsForm(
      formOf([
        ['payment_beneficiary', ' Jonas Jonaitis '],
        ['payment_iban', 'lt12 1000 0111 0100 1000'],
        ['payment_note', 'Ačiū'],
      ]),
    );
    expect(read).toEqual({
      kind: 'ok',
      entry: {
        beneficiary: 'Jonas Jonaitis',
        iban: 'LT121000011101001000',
        note: 'Ačiū',
      },
    });
  });

  it('blank boxes are null', () => {
    expect(readDetailsForm(formOf([]))).toEqual({
      kind: 'ok',
      entry: { beneficiary: null, iban: null, note: null },
    });
  });

  it('a too long box is the 422 body in Laravel words, listing every field', () => {
    const read = readDetailsForm(
      formOf([
        ['payment_beneficiary', 'x'.repeat(71)],
        ['payment_note', 'y'.repeat(501)],
      ]),
    );
    const beneficiary =
      'The payment beneficiary field must not be greater than 70 characters.';
    const note =
      'The payment note field must not be greater than 500 characters.';
    expect(read).toEqual({
      kind: 'invalid',
      body: {
        message: `${beneficiary} (and 1 more error)`,
        errors: { payment_beneficiary: [beneficiary], payment_note: [note] },
      },
    });
  });

  it('a failing checksum is a refusal to flash, not a 422', () => {
    const read = readDetailsForm(
      formOf([
        ['payment_beneficiary', 'Jonas'],
        ['payment_iban', 'LT121000011101001080'],
      ]),
    );
    expect(read).toEqual({ kind: 'refused', message: 'details-iban-invalid' });
  });

  it('a beneficiary without an IBAN is a refusal to flash', () => {
    const read = readDetailsForm(formOf([['payment_beneficiary', 'Jonas']]));
    expect(read).toEqual({ kind: 'refused', message: 'details-half-pair' });
  });

  it('an IBAN without a beneficiary is a refusal to flash', () => {
    const read = readDetailsForm(
      formOf([['payment_iban', 'LT121000011101001000']]),
    );
    expect(read).toEqual({ kind: 'refused', message: 'details-half-pair' });
  });
});

describe('refusedDetails', () => {
  const tooLong: DetailsFieldError = {
    field: 'payment_note',
    rule: 'max',
    message: 'The payment note field must not be greater than 500 characters.',
  };

  it('finds the checksum refusal after another error', () => {
    expect(
      refusedDetails([tooLong, { field: 'payment_iban', rule: 'iban' }]),
    ).toEqual({ kind: 'refused', message: 'details-iban-invalid' });
  });

  it('finds the pair refusal after another error', () => {
    expect(
      refusedDetails([tooLong, { field: 'payment_iban', rule: 'pair' }]),
    ).toEqual({ kind: 'refused', message: 'details-half-pair' });
  });

  it('lists only the length rules in the 422 body', () => {
    expect(refusedDetails([tooLong])).toEqual({
      kind: 'invalid',
      body: {
        message: tooLong.message,
        errors: { payment_note: [tooLong.message] },
      },
    });
  });
});
