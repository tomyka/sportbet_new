import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { compareLinkOf } from './compare-link';

describe("compareLinkOf (partials/points.blade.php's route('compare.show', userID))", () => {
  it("is /compare/{id} for a stored player's id", () => {
    expect(compareLinkOf(player('7'))).toBe('/compare/7');
    expect(compareLinkOf(player('2147483647'))).toBe('/compare/2147483647');
  });

  it('is nothing for an id the compare page would not read, so no link leads to a 404', () => {
    expect(compareLinkOf(player('ona'))).toBeNull();
    expect(compareLinkOf(player('0'))).toBeNull();
    expect(compareLinkOf(player('2147483648'))).toBeNull();
  });
});
