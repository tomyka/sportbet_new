import { describe, expect, it } from 'vitest';
import { seal, unseal } from './sealed';

const SECRET = 'test-secret-test-secret-test-secret';

describe('a sealed cookie value', () => {
  it('opens to what was sealed, for the purpose it was sealed for', () => {
    const sealed = seal('registration', { a: 1, b: 'ž' }, SECRET);
    expect(unseal('registration', sealed, SECRET)).toEqual({ a: 1, b: 'ž' });
  });

  it('opens to nothing for another purpose, another key, a changed body or signature, or no value', () => {
    const sealed = seal('registration', { a: 1 }, SECRET);
    const [body = '', signature = ''] = sealed.split('.');
    expect(unseal('sign-in', sealed, SECRET)).toBeNull();
    expect(unseal('registration', sealed, `${SECRET}-other`)).toBeNull();
    const other = Buffer.from(JSON.stringify({ a: 2 })).toString('base64url');
    expect(unseal('registration', `${other}.${signature}`, SECRET)).toBeNull();
    const altered = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(unseal('registration', `${body}.${altered}`, SECRET)).toBeNull();
    expect(unseal('registration', 'nonsense', SECRET)).toBeNull();
    expect(unseal('registration', undefined, SECRET)).toBeNull();
  });
});
