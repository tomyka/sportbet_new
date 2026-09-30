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
    expect((await fetchPage('/')).body).toContain('No tournaments yet.');
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
    expect(body).toContain('Not found');
  });

  it('is a 404 for a slug that is not a valid slug at all', async () => {
    expect((await fetchPage('/tournament/Not_A_Slug')).status).toBe(404);
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
