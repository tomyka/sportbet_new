import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';
import { formText, formTexts, trimInput } from './form-input';
import { isSameOrigin } from './same-origin';

const headers = (values: Record<string, string>) => new Headers(values);

// #16: a state-changing request must come from this site.
describe('isSameOrigin', () => {
  it('takes an Origin naming this host, as forwarded or as sent', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'https://sportbet.lt', host: 'sportbet.lt' }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        headers({
          origin: 'https://staging.vercel.app',
          host: 'internal.vercel',
          'x-forwarded-host': 'staging.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('refuses another origin, and an opaque one', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'https://evil.example', host: 'sportbet.lt' }),
      ),
    ).toBe(false);
    expect(isSameOrigin(headers({ origin: 'null', host: 'sportbet.lt' }))).toBe(
      false,
    );
  });

  it('with no Origin, takes Sec-Fetch-Site: same-origin and refuses anything else, or nothing', () => {
    expect(
      isSameOrigin(headers({ 'sec-fetch-site': 'same-origin', host: 'x' })),
    ).toBe(true);
    expect(
      isSameOrigin(headers({ 'sec-fetch-site': 'cross-site', host: 'x' })),
    ).toBe(false);
    expect(isSameOrigin(headers({ host: 'sportbet.lt' }))).toBe(false);
  });
});

describe('clientIp', () => {
  it('takes the first X-Forwarded-For address, as Vercel and Caddy set it', () => {
    expect(
      clientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })),
    ).toBe('203.0.113.7');
    expect(clientIp(headers({}))).toBe('unknown');
  });
});

// Laravel's TrimStrings middleware (Str::trim) trims every field first.
describe('trimInput and formText', () => {
  it("trims ASCII whitespace, NUL and Laravel's invisible characters at either end, and nothing inside", () => {
    expect(trimInput(' \t\u00a0jonas@example.lt\u200b\ufeff\n')).toBe(
      'jonas@example.lt',
    );
    expect(trimInput('jo nas')).toBe('jo nas');
    expect(trimInput('\u{1d173}x\u{e0020}')).toBe('x');
  });

  it('reads a missing field, or a file, as empty', () => {
    const form = new FormData();
    form.set('email', '  ada@example.lt ');
    form.set('file', new Blob(['x']));
    expect(formText(form, 'email')).toBe('ada@example.lt');
    expect(formText(form, 'code')).toBe('');
    expect(formText(form, 'file')).toBe('');
  });
});

describe('formTexts', () => {
  it("every value of a repeated field (jQuery's order[]), each trimmed; a file read as empty", () => {
    const form = new FormData();
    form.append('order[]', ' 12 ');
    form.append('order[]', ' 11');
    form.append('order[]', new Blob(['x']), 'x.txt');
    expect(formTexts(form, 'order[]')).toEqual(['12', '11', '']);
    expect(formTexts(form, 'missing')).toEqual([]);
  });
});
