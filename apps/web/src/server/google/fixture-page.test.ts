import { describe, expect, it } from 'vitest';
import { claimsOf, fixturePage, tripOf } from './fixture-page';

const formOf = (fields: Record<string, string>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

describe('the fixture consent page (tests only)', () => {
  it('reads the trip from the query, and refuses a missing or oversized part', () => {
    expect(tripOf(new URLSearchParams('state=a&nonce=b&challenge=c'))).toEqual({
      state: 'a',
      nonce: 'b',
      challenge: 'c',
    });
    for (const query of [
      'nonce=b&challenge=c',
      'state=a&challenge=c',
      'state=a&nonce=b',
      'state=&nonce=b&challenge=c',
      `state=${'a'.repeat(201)}&nonce=b&challenge=c`,
    ]) {
      expect(tripOf(new URLSearchParams(query))).toBeNull();
    }
  });

  it('makes claims from the form: the sub, the address when given, email_verified in each of its shapes, the name', () => {
    const base = { sub: '1', email: 'a@b.test', name: 'N' };
    expect(claimsOf(formOf({ ...base, verified: 'true' }))).toEqual({
      sub: '1',
      email: 'a@b.test',
      emailVerified: true,
      name: 'N',
    });
    expect(claimsOf(formOf({ ...base, verified: 'false' })).emailVerified).toBe(
      false,
    );
    expect(
      claimsOf(formOf({ ...base, verified: 'string-true' })).emailVerified,
    ).toBe('true');
    expect(
      claimsOf(formOf({ ...base, verified: 'number' })).emailVerified,
    ).toBe(1);
    expect(
      claimsOf(formOf({ ...base, verified: 'missing' })).emailVerified,
    ).toBeUndefined();
    expect(
      claimsOf(formOf({ ...base, verified: 'whatever' })).emailVerified,
    ).toBe(false);
  });

  it('leaves out an empty address and an empty name', () => {
    const claims = claimsOf(
      formOf({ sub: '1', email: '', name: '', verified: 'true' }),
    );
    expect(claims.email).toBeUndefined();
    expect(claims.name).toBeUndefined();
  });

  it('draws one form posting to itself with the trip hidden and escaped', () => {
    const html = fixturePage({
      state: '"><script>x</script>',
      nonce: 'n',
      challenge: 'c',
    });
    expect(html).toContain(
      '<form method="post" action="/auth/google/fixture">',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('name="state"');
    for (const choice of [
      'true',
      'false',
      'string-true',
      'number',
      'missing',
    ]) {
      expect(html).toContain(`<option>${choice}</option>`);
    }
  });
});
