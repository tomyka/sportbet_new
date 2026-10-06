import { insertTournaments } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { JSDOM } from 'jsdom';
import { describe, expect, inject, it } from 'vitest';
import { ACTIVE_PROFILE, withProfile } from '../support/hub';
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

describe('GET / (the hub)', () => {
  it('groups the stored tournaments: active first, then upcoming', async () => {
    await insertTournaments(db, [EUROLEAGUE_2025_26, EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, ACTIVE_PROFILE);
    const { status, body } = await fetchPage('/');
    expect(status).toBe(200);
    const page = new JSDOM(body).window.document;
    const group = (name: string) =>
      page.querySelector(`[data-testid="hub-group-${name}"]`)?.textContent ??
      '';
    expect(group('active')).toContain('Euroleague 2026/27');
    // A tournament saved with no profile has sportbet's default status, upcoming.
    expect(group('upcoming')).toContain('Euroleague 2025/26');
  });

  it('reads the database on every request, not at build time', async () => {
    expect((await fetchPage('/')).body).toContain('Turnyrų kol kas nėra');
    await insertTournaments(db, [EUROLEAGUE_2025_26]);
    expect((await fetchPage('/')).body).toContain('Euroleague 2025/26');
  });
});

describe('GET /tournament/[slug]', () => {
  it("shows a stored tournament's header card", async () => {
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, ACTIVE_PROFILE);
    const { status, body } = await fetchPage('/tournament/euroleague-2026-27');
    expect(status).toBe(200);
    const page = new JSDOM(body).window.document;
    expect(page.querySelector('h1')?.textContent).toBe('Euroleague 2026/27');
    expect(body).toContain('Krepšinis · 2026 · 0 dalyviai');
  });

  // What the server can promise for a page's notFound() (#16). Next 16.3.6
  // cannot render the not-found page on the server here: the segment's
  // not-found.tsx becomes HTTPAccessFallbackBoundary, a client error
  // boundary (server/app-render/create-component-tree.js), which React's
  // server renderer does not run; the shell's render fails, and
  // app-render.js answers with getErrorRSCPayload's bare
  // <html id="__next_error__">, status 404, the not-found page in its
  // flight data for the browser to draw. Only an unmatched address reaches
  // the /_not-found route, rendered on the server ('frames the 404 page
  // too'). The h1 and the rail in a browser: e2e/tournaments.spec.ts.
  it('is a 404 for an unknown slug: noindex, the not-found page in its payload (#16)', async () => {
    const { status, body } = await fetchPage('/tournament/no-such-tournament');
    expect(status).toBe(404);
    const page = new JSDOM(body).window.document;
    expect(
      page.querySelector('meta[name="robots"]')?.getAttribute('content'),
    ).toBe('noindex');
    expect(body).toContain('Puslapis nerastas');
  });

  it('is a 404 for a slug that is not a valid slug at all', async () => {
    expect((await fetchPage('/tournament/Not_A_Slug')).status).toBe(404);
  });

  it('is a 404 for a non-public tournament seen by a guest (R-50)', async () => {
    await insertTournaments(db, [EUROLEAGUE_2026_27]);
    await withProfile(db, EUROLEAGUE_2026_27.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect((await fetchPage('/tournament/euroleague-2026-27')).status).toBe(
      404,
    );
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

  // An address no route matches: Next serves it from its not-found route, rendered on the server.
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
