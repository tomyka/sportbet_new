import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Required: a smoke run with nowhere to point at is a failure, not a skip.
const base = z
  .url({ protocol: /^https$/ })
  .parse(process.env['SMOKE_BASE_URL']);

describe(`smoke: ${base}`, () => {
  it('answers health over HTTPS with a valid certificate', async () => {
    // fetch rejects an invalid or expired certificate, so reaching the
    // assertion proves the certificate.
    const response = await fetch(new URL('/api/health', base));
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('serves the home page', async () => {
    const response = await fetch(new URL('/', base));
    expect(response.status).toBe(200);
    // Staging must never be indexed. On Oracle, Caddy sends this header; on
    // Vercel (decision 12), next.config.ts does. Either way, it also proves
    // our staging answered, not some other vhost or project.
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    await response.text();
  });

  it('redirects plain HTTP to HTTPS', async () => {
    const plain = new URL('/', base);
    plain.protocol = 'http:';
    const response = await fetch(plain, { redirect: 'manual' });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      new URL('/', base).toString(),
    );
  });
});
