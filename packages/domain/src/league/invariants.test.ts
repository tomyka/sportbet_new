import { describe, expect, it } from 'vitest';
import { defineInvariant } from '../invariant/invariant';
import {
  leagueFeeInvariant,
  leagueNameInvariant,
  messageTextInvariant,
  paidCentsInvariant,
  paymentBeneficiaryInvariant,
  paymentIbanInvariant,
} from './invariants';

const textInvariants = [
  leagueNameInvariant,
  paymentBeneficiaryInvariant,
  paymentIbanInvariant,
  messageTextInvariant,
];

describe('the league invariants', () => {
  it.each(textInvariants.map((each) => [each.name, each] as const))(
    '%s: every example goes through its schema as listed',
    (_name, invariant) => {
      expect(invariant.accepts.length).toBeGreaterThan(0);
      expect(invariant.refuses.length).toBeGreaterThan(0);
      for (const { value } of invariant.accepts) {
        expect(invariant.schema.safeParse(value).success).toBe(true);
      }
      for (const { value } of invariant.refuses) {
        expect(invariant.schema.safeParse(value).success).toBe(false);
      }
    },
  );

  it.each(
    [leagueFeeInvariant, paidCentsInvariant].map(
      (each) => [each.name, each] as const,
    ),
  )('%s: every example goes through its schema as listed', (_name, range) => {
    for (const { value } of range.accepts) {
      expect(range.schema.safeParse(value).success).toBe(true);
    }
    for (const { value } of range.refuses) {
      expect(range.schema.safeParse(value).success).toBe(false);
    }
  });

  it('holds sportbet column limits, counted in characters', () => {
    expect(leagueNameInvariant.maxLength).toBe(255);
    expect(paymentBeneficiaryInvariant.maxLength).toBe(70);
    expect(paymentIbanInvariant.maxLength).toBe(34);
    expect(messageTextInvariant.maxLength).toBe(255);
    expect(leagueNameInvariant.schema.safeParse('Š'.repeat(255)).success).toBe(
      true,
    );
    expect(leagueNameInvariant.schema.safeParse('Š'.repeat(256)).success).toBe(
      false,
    );
    expect(
      leagueNameInvariant.schema.safeParse('\u{1F600}'.repeat(255)).success,
    ).toBe(true);
  });

  it('refuses an empty name and an empty message, but takes an empty detail', () => {
    expect(leagueNameInvariant.schema.safeParse('').success).toBe(false);
    expect(messageTextInvariant.schema.safeParse('').success).toBe(false);
    expect(paymentBeneficiaryInvariant.schema.safeParse('').success).toBe(true);
    expect(paymentIbanInvariant.schema.safeParse('').success).toBe(true);
  });

  it('takes any text, line breaks and blanks included', () => {
    for (const invariant of [leagueNameInvariant, messageTextInvariant]) {
      expect(invariant.schema.safeParse('   ').success).toBe(true);
      expect(invariant.schema.safeParse('a\nb\r c').success).toBe(true);
    }
  });

  it('draws the money lines: fees from zero, paid cents 0 to 99 999 999', () => {
    expect(leagueFeeInvariant.min).toBe(0);
    expect(paidCentsInvariant.min).toBe(0);
    expect(paidCentsInvariant.max).toBe(99_999_999);
    expect(paidCentsInvariant.schema.safeParse(99_999_999).success).toBe(true);
    expect(paidCentsInvariant.schema.safeParse(100_000_000).success).toBe(
      false,
    );
    expect(leagueFeeInvariant.schema.safeParse(-1).success).toBe(false);
    expect(leagueFeeInvariant.schema.safeParse(2_147_483_648).success).toBe(
      false,
    );
  });

  it('is built on invariants that refuse a pattern with a quote', () => {
    expect(() =>
      defineInvariant({
        name: 'quoted',
        pattern: "a'b",
        accepts: [],
        refuses: [],
      }),
    ).toThrow(/quote/);
  });
});
