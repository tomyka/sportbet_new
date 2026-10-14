import { describe, expect, it } from 'vitest';
import { referringPath } from './referring-path';

// redirect()->back(): the page the form was posted from, kept only as a
// path on this site (safeReturnPath), never another address.

const from = (referer: string | null): Request =>
  new Request('https://sportbet.example/leagues/switch', {
    method: 'POST',
    headers: referer === null ? {} : { referer },
  });

describe('referringPath', () => {
  it("is the referring page's path and query", () => {
    expect(
      referringPath(from('https://sportbet.example/summary/chart?x=1#top')),
    ).toBe('/summary/chart?x=1');
  });

  it('is null with no Referer header', () => {
    expect(referringPath(from(null))).toBeNull();
  });

  it('is null for a Referer that is no address', () => {
    expect(referringPath(from('not an address'))).toBeNull();
  });

  it("keeps only the path of another site's address, never its host", () => {
    expect(
      referringPath(from('https://evil.example//attacker.example')),
    ).toBeNull();
    expect(referringPath(from('https://evil.example/main'))).toBe('/main');
  });
});
