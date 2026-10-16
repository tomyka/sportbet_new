import { describe, expect, it } from 'vitest';
import { spoofedMethod } from './method-override';

const post = (body: string, type = 'application/x-www-form-urlencoded') =>
  new Request('https://sportbet.lt/profile', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  });

describe('spoofedMethod', () => {
  it('reads the posted _method, upper-cased and trimmed', async () => {
    expect(await spoofedMethod(post('_method=DELETE&code=1'))).toBe('DELETE');
    expect(await spoofedMethod(post('_method=%20delete%20'))).toBe('DELETE');
    expect(await spoofedMethod(post('_method=PATCH'))).toBe('PATCH');
  });

  it('is POST without a _method, or with a body that is no form', async () => {
    expect(await spoofedMethod(post('code=1'))).toBe('POST');
    expect(await spoofedMethod(post('_method='))).toBe('POST');
    expect(
      await spoofedMethod(post('{"_method":"DELETE"}', 'application/json')),
    ).toBe('POST');
  });

  it('leaves the body readable for the handler', async () => {
    const request = post('_method=DELETE&code=01234567');
    await spoofedMethod(request);
    expect((await request.formData()).get('code')).toBe('01234567');
  });
});
