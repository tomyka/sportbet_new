import { insertTournaments } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { describe, expect, inject, it } from 'vitest';
import { EUROLEAGUE_2025_26, EUROLEAGUE_2026_27 } from '../support/tournaments';

const baseUrl = inject('baseUrl');
const { db } = useTestDatabase();

// Does not follow redirects and reads the whole body - fine for these tests,
// which only assert status and page content, never a redirect chain.
async function fetchPage(
  path: string,
): Promise<{ status: number; body: string }> {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'manual' });
  return { status: response.status, body: await response.text() };
}

describe('GET /', () => {
  it('lists exactly the stored tournaments', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26, EUROLEAGUE_2026_27]);
    const { status, body } = await fetchPage('/');
    expect(status).toBe(200);
    expect(body).toContain('Euroleague 2025/26');
    expect(body).toContain('Euroleague 2026/27');
    expect(body.match(/href="\/tournament\//g)).toHaveLength(2);
  });

  it('reads the database on every request, not at build time', async () => {
    expect((await fetchPage('/')).body).toContain('Turnyrų kol kas nėra');
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    expect((await fetchPage('/')).body).toContain('Euroleague 2025/26');
  });
});

describe('GET /tournament/[slug]', () => {
  it('shows a stored tournament', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    const { status, body } = await fetchPage('/tournament/euroleague-2025-26');
    expect(status).toBe(200);
    expect(body).toContain('Euroleague 2025/26');
    expect(body).toContain('Euroleague');
  });

  it('is a 404 for an unknown slug', async () => {
    const { status, body } = await fetchPage('/tournament/no-such-tournament');
    expect(status).toBe(404);
    expect(body).toContain('Puslapis nerastas');
  });

  it('is a 404 for a slug that is not a valid slug at all', async () => {
    expect((await fetchPage('/tournament/Not_A_Slug')).status).toBe(404);
  });
});

describe('the page shell', () => {
  it('serves a page in Lithuanian, inside the guest shell', async () => {
    const { status, body } = await fetchPage('/');
    expect(status).toBe(200);
    expect(body).toMatch(/<html[^>]*\slang="lt"/);
    expect(body).toContain('data-testid="rail"');
    expect(body).toContain('data-testid="phone-header"');
    expect(body).toContain('data-testid="cookie-consent"');
    expect(body).not.toContain('data-testid="bottom-tabs"');
  });

  // An address no route matches: Next serves it from its not-found route,
  // rendered on the server. A page's own notFound() (an unknown tournament)
  // reaches the browser as Next 16's bare error document, which the client
  // then fills with the same framed not-found page; tournaments.spec.ts
  // sees that one in the browser.
  it('frames the 404 page too', async () => {
    const { status, body } = await fetchPage('/no-such-page');
    expect(status).toBe(404);
    expect(body).toContain('data-testid="rail"');
  });

  it('sets the theme before the first paint, and loads nothing from elsewhere', async () => {
    const { body } = await fetchPage('/');
    expect(body).toContain("localStorage.getItem('sb-theme')");
    expect(body).not.toMatch(
      /<(?:script|link|img)\b[^>]*\s(?:src|href|srcset)="(?:https?:)?\/\//,
    );
  });
});

describe('security headers', () => {
  it('lets no other site frame a page, and no browser sniff its type', async () => {
    const response = await fetch(new URL('/', baseUrl));
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('GET /api/health', () => {
  it('is ok while the database answers', async () => {
    const response = await fetch(new URL('/api/health', baseUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body: unknown = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
