import { describe, expect, it } from 'vitest';
import {
  DETAILS_PAIR_MESSAGE,
  IBAN_CHECKSUM_MESSAGE,
  paymentDetailsFormEntry,
  paymentsFormEntry,
  type DetailsFieldError,
  type PaymentsFieldError,
} from './payments-form';

const posted = (...entries: readonly (readonly [string, unknown])[]) =>
  new Map<string, unknown>(entries);

const amounts = (...entries: readonly (readonly [string, unknown])[]) => {
  const checked = paymentsFormEntry(posted(...entries));
  if (!checked.ok) throw new Error('expected an entry');
  return [...checked.value];
};

const paidErrors = (
  value: Parameters<typeof paymentsFormEntry>[0],
): readonly PaymentsFieldError[] => {
  const checked = paymentsFormEntry(value);
  if (checked.ok) throw new Error('expected a refusal');
  return checked.errors;
};

describe('paymentsFormEntry', () => {
  it('paid: "10,5" is 1050 cents', () => {
    expect(amounts(['12', '10,5'])).toEqual([[12, 1050]]);
  });

  it('reads a padded amount trimmed', () => {
    expect(amounts(['12', '  20 　'])).toEqual([[12, 2000]]);
  });

  it('accepts "999999.99" and the whole numbers', () => {
    expect(amounts(['1', '999999.99'], ['2', '0'])).toEqual([
      [1, 99_999_999],
      [2, 0],
    ]);
  });

  it('a blank is unpaid, null', () => {
    expect(amounts(['12', ''], ['13', '  '], ['14', null])).toEqual([
      [12, null],
      [13, null],
      [14, null],
    ]);
  });

  it('keeps the posted order', () => {
    expect(amounts(['30', '1'], ['4', '2']).map(([id]) => id)).toEqual([30, 4]);
  });

  it('a key that is no id reads as 0, the id of no member', () => {
    expect(amounts(['abc', '5'], ['12abc', '5'])).toEqual([[0, 500]]);
  });

  it('"-5" is refused with at least 0', () => {
    expect(paidErrors(posted(['12', '-5']))).toEqual([
      {
        field: 'paid.12',
        rule: 'min',
        message: 'The paid.12 field must be at least 0.',
      },
    ]);
  });

  it('"dvidešimt" is refused as no number', () => {
    expect(
      paidErrors(posted(['12', 'dvidešimt'])).map((e) => e.message),
    ).toEqual([
      'The paid.12 field must be a number.',
      'The paid.12 field must have 0-2 decimal places.',
    ]);
  });

  it('"10.555" is refused for two decimals', () => {
    expect(paidErrors(posted(['12', '10.555']))).toEqual([
      {
        field: 'paid.12',
        rule: 'decimal',
        message: 'The paid.12 field must have 0-2 decimal places.',
      },
    ]);
  });

  it('"1000000" is refused as above the maximum', () => {
    expect(paidErrors(posted(['12', '1000000']))).toEqual([
      {
        field: 'paid.12',
        rule: 'max',
        message: 'The paid.12 field must not be greater than 999999.99.',
      },
    ]);
  });

  it('"1e2" is a number the decimal rule refuses', () => {
    expect(paidErrors(posted(['12', '1e2'])).map((e) => e.rule)).toEqual([
      'decimal',
    ]);
  });

  it('a nested value is no number', () => {
    expect(
      paidErrors(posted(['12', ['5']])).map((error) => error.rule),
    ).toEqual(['numeric', 'decimal']);
  });

  it('two bad rows list both, in posted order', () => {
    expect(
      paidErrors(posted(['9', '-1'], ['3', 'x'])).map(
        (error) => `${error.field} ${error.rule}`,
      ),
    ).toEqual(['paid.9 min', 'paid.3 numeric', 'paid.3 decimal']);
  });

  it('a good row beside a bad one is still refused as a whole', () => {
    expect(paidErrors(posted(['1', '5'], ['2', '-5']))).toHaveLength(1);
  });

  it('names an attribute as Laravel does', () => {
    expect(paidErrors(posted(['Foo_bar', '-1']))[0]?.message).toBe(
      'The paid. foo bar field must be at least 0.',
    );
  });

  it('an empty paid map is "The paid field is required."', () => {
    const required = [
      {
        field: 'paid',
        rule: 'required',
        message: 'The paid field is required.',
      },
    ];
    expect(paidErrors(posted())).toEqual(required);
    expect(paidErrors(null)).toEqual(required);
    expect(paidErrors('')).toEqual(required);
    expect(paidErrors('  ')).toEqual(required);
  });

  it('a bare paid=x is "The paid field must be an array."', () => {
    expect(paidErrors('x')).toEqual([
      {
        field: 'paid',
        rule: 'array',
        message: 'The paid field must be an array.',
      },
    ]);
  });
});

const IBAN = 'LT121000011101001000';

const details = (over: Record<string, string | null> = {}) =>
  paymentDetailsFormEntry({
    payment_beneficiary: 'Jonas Jonaitis',
    payment_iban: IBAN,
    payment_note: null,
    ...over,
  });

const detailErrors = (
  over: Record<string, string | null>,
): readonly DetailsFieldError[] => {
  const checked = details(over);
  if (checked.ok) throw new Error('expected a refusal');
  return checked.errors;
};

describe('paymentDetailsFormEntry', () => {
  it('IBAN stored compacted however typed', () => {
    expect(details({ payment_iban: ' lt12 1000 0111 0100 1000 ' })).toEqual({
      ok: true,
      value: { beneficiary: 'Jonas Jonaitis', iban: IBAN, note: null },
    });
  });

  it('blank boxes are null not ""', () => {
    expect(
      paymentDetailsFormEntry({
        payment_beneficiary: '  ',
        payment_iban: '',
        payment_note: '\t',
      }),
    ).toEqual({
      ok: true,
      value: { beneficiary: null, iban: null, note: null },
    });
    expect(paymentDetailsFormEntry({})).toEqual({
      ok: true,
      value: { beneficiary: null, iban: null, note: null },
    });
  });

  it('trims the beneficiary and the note', () => {
    expect(
      details({
        payment_beneficiary: '  Jonas  ',
        payment_note: ' iki penktadienio\n',
      }),
    ).toEqual({
      ok: true,
      value: { beneficiary: 'Jonas', iban: IBAN, note: 'iki penktadienio' },
    });
  });

  it('a failing checksum refuses and does not reach the pair rule', () => {
    expect(
      detailErrors({
        payment_iban: 'LT121000011101001080',
        payment_beneficiary: null,
      }),
    ).toEqual([
      { field: 'payment_iban', rule: 'iban', message: IBAN_CHECKSUM_MESSAGE },
    ]);
  });

  it('beneficiary without IBAN and IBAN without beneficiary each refused on payment_iban', () => {
    const pair = [
      { field: 'payment_iban', rule: 'pair', message: DETAILS_PAIR_MESSAGE },
    ];
    expect(detailErrors({ payment_iban: null })).toEqual(pair);
    expect(detailErrors({ payment_beneficiary: null })).toEqual(pair);
  });

  it('an empty form is valid: neither is given', () => {
    expect(details({ payment_iban: null, payment_beneficiary: null }).ok).toBe(
      true,
    );
  });

  it('71-character beneficiary refused, 70 of Š accepted', () => {
    expect(details({ payment_beneficiary: 'Š'.repeat(70) }).ok).toBe(true);
    expect(detailErrors({ payment_beneficiary: 'Š'.repeat(71) })).toEqual([
      {
        field: 'payment_beneficiary',
        rule: 'max',
        message:
          'The payment beneficiary field must not be greater than 70 characters.',
      },
    ]);
  });

  it('a 501-character note refused, 500 accepted', () => {
    expect(details({ payment_note: 'x'.repeat(500) }).ok).toBe(true);
    expect(detailErrors({ payment_note: 'x'.repeat(501) })).toEqual([
      {
        field: 'payment_note',
        rule: 'max',
        message:
          'The payment note field must not be greater than 500 characters.',
      },
    ]);
  });

  it('a 35-character IBAN is refused by max before the checksum', () => {
    expect(detailErrors({ payment_iban: 'L'.repeat(35) })).toEqual([
      {
        field: 'payment_iban',
        rule: 'max',
        message:
          'The payment iban field must not be greater than 34 characters.',
      },
    ]);
  });

  it('counts the IBAN compact, so spaces do not push it over 34', () => {
    expect(
      detailErrors({ payment_iban: `${'L'.repeat(34)}      ` }).map(
        (e) => e.rule,
      ),
    ).toEqual(['iban']);
  });

  it('lists every field that is too long, not the first', () => {
    expect(
      detailErrors({
        payment_beneficiary: 'x'.repeat(71),
        payment_iban: 'L'.repeat(35),
        payment_note: 'x'.repeat(501),
      }).map((error) => error.field),
    ).toEqual(['payment_beneficiary', 'payment_iban', 'payment_note']);
  });
});
