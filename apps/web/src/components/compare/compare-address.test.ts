import { player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import {
  compareIdOf,
  compareLinkOf,
  comparePath,
  isComparePath,
  isRouteUserId,
  otherPlayerOf,
} from './compare-address';

// One text, read every way the compare address is read: the route's
// constraint, the id it names, the player, the link back, and the path a
// guest's sign-in may return to.
const ADDRESSES = [
  // Digits the route accepts but that name no stored id.
  { text: '0', route: true, id: null },
  { text: '007', route: true, id: null },
  { text: '2147483648', route: true, id: null },
  { text: '99999999999999999999', route: true, id: null },
  // Not digits at all: no route.
  { text: 'abc', route: false, id: null },
  { text: '+1', route: false, id: null },
  { text: '1.5', route: false, id: null },
  // A stored id.
  { text: '7', route: true, id: 7 },
  { text: '2147483647', route: true, id: 2_147_483_647 },
] as const;

describe.each(ADDRESSES)('the compare address $text', ({ text, route, id }) => {
  it('is a route userID only when all digits (sportbet`s [0-9]+)', () => {
    expect(isRouteUserId(text)).toBe(route);
  });

  it('names an id only when it is one a page reads', () => {
    expect(compareIdOf(text)).toBe(id);
  });

  it('names a player exactly when it names an id', () => {
    const other = otherPlayerOf(text);
    expect(other.ok ? other.value : null).toBe(
      id === null ? null : player(String(id)),
    );
  });

  it('is a path a guest may return to exactly when it names an id', () => {
    expect(isComparePath(`/compare/${text}`)).toBe(id !== null);
  });

  it('links back from the player, and only when it names an id', () => {
    expect(compareLinkOf(player(text))).toBe(
      id === null ? null : `/compare/${String(id)}`,
    );
  });
});

describe('an empty address', () => {
  it('is no route, id, player or return path', () => {
    expect(isRouteUserId('')).toBe(false);
    expect(compareIdOf('')).toBeNull();
    expect(otherPlayerOf('').ok).toBe(false);
    expect(isComparePath('/compare/')).toBe(false);
  });
});

describe('comparePath', () => {
  it('is /compare/{id}', () => {
    expect(comparePath(42)).toBe('/compare/42');
  });

  it('round-trips with the id and the matcher', () => {
    const path = comparePath(7);
    expect(isComparePath(path)).toBe(true);
    expect(compareIdOf(path.slice('/compare/'.length))).toBe(7);
  });

  it('is not matched with a query, another prefix or a trailing slash', () => {
    expect(isComparePath('/compare/7?x=1')).toBe(false);
    expect(isComparePath('/compare/7/')).toBe(false);
    expect(isComparePath('/compares/7')).toBe(false);
    expect(isComparePath('/compare/')).toBe(false);
  });
});
